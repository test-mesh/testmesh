package loadtest

import (
	"context"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// FlowExecutor interface for executing flows (allows dependency injection)
type FlowExecutor interface {
	ExecuteWithoutPersistence(ctx context.Context, flow *models.Flow, variables map[string]string) error
}

// LoadTester executes load tests with configurable virtual users
type LoadTester struct {
	logger   *zap.Logger
	executor FlowExecutor
}

// NewLoadTester creates a new load tester
func NewLoadTester(logger *zap.Logger) *LoadTester {
	return &LoadTester{
		logger: logger,
	}
}

// SetExecutor sets the flow executor for real execution
func (lt *LoadTester) SetExecutor(executor FlowExecutor) {
	lt.executor = executor
}

// LoadTestConfig configures a load test
type LoadTestConfig struct {
	FlowIDs      []uuid.UUID       `json:"flow_ids"`
	VirtualUsers int               `json:"virtual_users"`   // Number of concurrent users
	Duration     time.Duration     `json:"duration"`        // Test duration
	RampUpTime   time.Duration     `json:"ramp_up_time"`    // Time to reach full VUs
	RampDownTime time.Duration     `json:"ramp_down_time"`  // Time to wind down
	ThinkTime    time.Duration     `json:"think_time"`      // Delay between iterations per VU
	Variables    map[string]string `json:"variables"`       // Global variables
	Environment  string            `json:"environment"`
}

// LoadTestResult represents the overall result of a load test
type LoadTestResult struct {
	ID                uuid.UUID          `json:"id"`
	Status            string             `json:"status"` // "running", "completed", "failed", "cancelled"
	StartedAt         time.Time          `json:"started_at"`
	FinishedAt        *time.Time         `json:"finished_at,omitempty"`
	DurationMs        int64              `json:"duration_ms"`
	TotalRequests     int64              `json:"total_requests"`
	SuccessfulRequests int64             `json:"successful_requests"`
	FailedRequests    int64              `json:"failed_requests"`
	RequestsPerSecond float64            `json:"requests_per_second"`
	Metrics           LoadTestMetrics    `json:"metrics"`
	Timeline          []TimelinePoint    `json:"timeline"`
	Errors            []LoadTestError    `json:"errors,omitempty"`
}

// LoadTestMetrics contains aggregate metrics
type LoadTestMetrics struct {
	ResponseTimes ResponseTimeMetrics `json:"response_times"`
	Throughput    ThroughputMetrics   `json:"throughput"`
	ErrorRate     float64             `json:"error_rate"`
	ActiveVUs     int                 `json:"active_vus"`
}

// ResponseTimeMetrics contains response time percentiles
type ResponseTimeMetrics struct {
	Min    int64   `json:"min_ms"`
	Max    int64   `json:"max_ms"`
	Avg    float64 `json:"avg_ms"`
	Median float64 `json:"median_ms"`
	P90    float64 `json:"p90_ms"`
	P95    float64 `json:"p95_ms"`
	P99    float64 `json:"p99_ms"`
}

// ThroughputMetrics contains throughput measurements
type ThroughputMetrics struct {
	RequestsPerSecond float64 `json:"requests_per_second"`
	BytesSent         int64   `json:"bytes_sent"`
	BytesReceived     int64   `json:"bytes_received"`
}

// TimelinePoint represents metrics at a point in time
type TimelinePoint struct {
	Timestamp         time.Time `json:"timestamp"`
	ActiveVUs         int       `json:"active_vus"`
	RequestsPerSecond float64   `json:"requests_per_second"`
	AvgResponseTime   float64   `json:"avg_response_time_ms"`
	ErrorRate         float64   `json:"error_rate"`
}

// LoadTestError represents an error during load testing
type LoadTestError struct {
	Timestamp time.Time `json:"timestamp"`
	FlowID    uuid.UUID `json:"flow_id"`
	FlowName  string    `json:"flow_name"`
	Error     string    `json:"error"`
	Count     int       `json:"count"`
}

// VirtualUser represents a single virtual user
type VirtualUser struct {
	ID        int
	startTime time.Time
	requests  int64
	errors    int64
	totalTime int64 // Total response time in ms
}

// Run executes a load test with an auto-generated ID
func (lt *LoadTester) Run(ctx context.Context, config *LoadTestConfig, flows []*models.Flow, progressFn func(*LoadTestResult)) (*LoadTestResult, error) {
	return lt.RunWithID(ctx, uuid.New(), config, flows, progressFn)
}

// RunWithID executes a load test with a provided ID
func (lt *LoadTester) RunWithID(ctx context.Context, testID uuid.UUID, config *LoadTestConfig, flows []*models.Flow, progressFn func(*LoadTestResult)) (*LoadTestResult, error) {
	result := &LoadTestResult{
		ID:        testID,
		Status:    "running",
		StartedAt: time.Now(),
		Timeline:  make([]TimelinePoint, 0),
	}

	var (
		mu              sync.Mutex
		wg              sync.WaitGroup
		activeVUs       int32
		totalRequests   int64
		successRequests int64
		failedRequests  int64
		responseTimes   []int64
		errorMap        = make(map[string]*LoadTestError)
	)

	// Calculate ramp schedule
	vuPerInterval := float64(config.VirtualUsers) / float64(config.RampUpTime.Seconds())

	// Context with timeout
	testCtx, cancel := context.WithTimeout(ctx, config.Duration+config.RampUpTime+config.RampDownTime)
	defer cancel()

	// Start virtual users gradually
	vuStarted := 0
	startTime := time.Now()
	ticker := time.NewTicker(100 * time.Millisecond) // Check every 100ms
	defer ticker.Stop()

	// Metrics collection ticker
	metricsTicker := time.NewTicker(1 * time.Second)
	defer metricsTicker.Stop()

	// Start VU spawner
	go func() {
		for {
			select {
			case <-testCtx.Done():
				return
			case <-ticker.C:
				elapsed := time.Since(startTime)

				// Ramp up phase
				if elapsed < config.RampUpTime {
					targetVUs := int(vuPerInterval * elapsed.Seconds())
					if targetVUs > config.VirtualUsers {
						targetVUs = config.VirtualUsers
					}

					// Start new VUs
					for vuStarted < targetVUs {
						vuID := vuStarted
						vuStarted++
						atomic.AddInt32(&activeVUs, 1)

						wg.Add(1)
						go func(id int) {
							defer wg.Done()
							defer atomic.AddInt32(&activeVUs, -1)

							lt.runVirtualUser(testCtx, id, config, flows, func(duration int64, err error) {
								atomic.AddInt64(&totalRequests, 1)
								if err != nil {
									atomic.AddInt64(&failedRequests, 1)
									mu.Lock()
									errKey := err.Error()
									if e, ok := errorMap[errKey]; ok {
										e.Count++
									} else {
										errorMap[errKey] = &LoadTestError{
											Timestamp: time.Now(),
											Error:     errKey,
											Count:     1,
										}
									}
									mu.Unlock()
								} else {
									atomic.AddInt64(&successRequests, 1)
								}

								mu.Lock()
								responseTimes = append(responseTimes, duration)
								mu.Unlock()
							})
						}(vuID)
					}
				}

				// Check if test duration exceeded
				if elapsed > config.Duration+config.RampUpTime {
					cancel()
					return
				}
			}
		}
	}()

	// Metrics collector
	go func() {
		lastRequests := int64(0)
		for {
			select {
			case <-testCtx.Done():
				return
			case <-metricsTicker.C:
				currentRequests := atomic.LoadInt64(&totalRequests)
				currentFailed := atomic.LoadInt64(&failedRequests)
				currentActive := atomic.LoadInt32(&activeVUs)

				rps := float64(currentRequests - lastRequests)
				lastRequests = currentRequests

				errorRate := float64(0)
				if currentRequests > 0 {
					errorRate = float64(currentFailed) / float64(currentRequests) * 100
				}

				// Calculate average response time
				mu.Lock()
				avgRT := float64(0)
				if len(responseTimes) > 0 {
					var sum int64
					for _, rt := range responseTimes {
						sum += rt
					}
					avgRT = float64(sum) / float64(len(responseTimes))
				}
				mu.Unlock()

				point := TimelinePoint{
					Timestamp:         time.Now(),
					ActiveVUs:         int(currentActive),
					RequestsPerSecond: rps,
					AvgResponseTime:   avgRT,
					ErrorRate:         errorRate,
				}

				mu.Lock()
				result.Timeline = append(result.Timeline, point)
				result.TotalRequests = currentRequests
				result.SuccessfulRequests = atomic.LoadInt64(&successRequests)
				result.FailedRequests = currentFailed
				result.Metrics.ActiveVUs = int(currentActive)
				mu.Unlock()

				// Report progress
				if progressFn != nil {
					mu.Lock()
					progressFn(result)
					mu.Unlock()
				}
			}
		}
	}()

	// Wait for all VUs to complete
	wg.Wait()

	// Finalize result
	finishedAt := time.Now()
	result.FinishedAt = &finishedAt
	result.DurationMs = finishedAt.Sub(result.StartedAt).Milliseconds()
	result.Status = "completed"

	// Calculate final metrics
	if len(responseTimes) > 0 {
		result.Metrics.ResponseTimes = calculateResponseTimeMetrics(responseTimes)
	}

	if result.DurationMs > 0 {
		result.RequestsPerSecond = float64(result.TotalRequests) / (float64(result.DurationMs) / 1000)
		result.Metrics.Throughput.RequestsPerSecond = result.RequestsPerSecond
	}

	if result.TotalRequests > 0 {
		result.Metrics.ErrorRate = float64(result.FailedRequests) / float64(result.TotalRequests) * 100
	}

	// Collect errors
	for _, e := range errorMap {
		result.Errors = append(result.Errors, *e)
	}

	return result, nil
}

// runVirtualUser simulates a single virtual user
func (lt *LoadTester) runVirtualUser(ctx context.Context, id int, config *LoadTestConfig, flows []*models.Flow, resultFn func(int64, error)) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			// Execute each flow
			for _, flow := range flows {
				select {
				case <-ctx.Done():
					return
				default:
				}

				startTime := time.Now()

				// Execute the flow using the configured executor
				err := lt.executeFlow(ctx, flow, config.Variables)

				duration := time.Since(startTime).Milliseconds()
				resultFn(duration, err)

				// Think time between requests
				if config.ThinkTime > 0 {
					select {
					case <-ctx.Done():
						return
					case <-time.After(config.ThinkTime):
					}
				}
			}
		}
	}
}

// executeFlow executes a flow using the configured executor
func (lt *LoadTester) executeFlow(ctx context.Context, flow *models.Flow, variables map[string]string) error {
	// Use real executor if available
	if lt.executor != nil {
		return lt.executor.ExecuteWithoutPersistence(ctx, flow, variables)
	}

	// Fallback to simulation if no executor configured
	return lt.simulateFlowExecution(ctx, flow, variables)
}

// simulateFlowExecution simulates executing a flow (fallback when no executor)
func (lt *LoadTester) simulateFlowExecution(ctx context.Context, flow *models.Flow, variables map[string]string) error {
	// Get step count from flow definition for realistic simulation
	stepCount := len(flow.Definition.Steps)
	if stepCount == 0 {
		stepCount = 1
	}

	// Random delay per step (30-80ms) to simulate realistic HTTP calls
	for i := 0; i < stepCount; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			time.Sleep(time.Duration(30+int(time.Now().UnixNano()%50)) * time.Millisecond)
		}
	}

	return nil
}

// calculateResponseTimeMetrics calculates response time percentiles
func calculateResponseTimeMetrics(times []int64) ResponseTimeMetrics {
	if len(times) == 0 {
		return ResponseTimeMetrics{}
	}

	// Sort times
	sorted := make([]int64, len(times))
	copy(sorted, times)
	sortInt64(sorted)

	// Calculate metrics
	var sum int64
	for _, t := range sorted {
		sum += t
	}

	return ResponseTimeMetrics{
		Min:    sorted[0],
		Max:    sorted[len(sorted)-1],
		Avg:    float64(sum) / float64(len(sorted)),
		Median: percentile(sorted, 50),
		P90:    percentile(sorted, 90),
		P95:    percentile(sorted, 95),
		P99:    percentile(sorted, 99),
	}
}

// sortInt64 sorts a slice of int64 in place
func sortInt64(a []int64) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j-1] > a[j]; j-- {
			a[j-1], a[j] = a[j], a[j-1]
		}
	}
}

// percentile calculates the nth percentile
func percentile(sorted []int64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return float64(sorted[0])
	}

	rank := (p / 100) * float64(len(sorted)-1)
	lower := int(math.Floor(rank))
	upper := int(math.Ceil(rank))

	if lower == upper {
		return float64(sorted[lower])
	}

	frac := rank - float64(lower)
	return float64(sorted[lower])*(1-frac) + float64(sorted[upper])*frac
}
