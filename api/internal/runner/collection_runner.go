package runner

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// CollectionRunner executes flows with data-driven testing
type CollectionRunner struct {
	executor *Executor
	logger   *zap.Logger
}

// NewCollectionRunner creates a new collection runner
func NewCollectionRunner(executor *Executor, logger *zap.Logger) *CollectionRunner {
	return &CollectionRunner{
		executor: executor,
		logger:   logger,
	}
}

// DataSource represents a data source for iterations
type DataSource struct {
	Type    string          `json:"type"` // "csv", "json", or "inline"
	Content string          `json:"content"` // Raw content or file path
	Data    []DataRow       `json:"data,omitempty"` // Parsed data rows
}

// DataRow represents a single row of data for an iteration
type DataRow map[string]interface{}

// CollectionRunConfig configures a collection run
type CollectionRunConfig struct {
	FlowIDs         []uuid.UUID       `json:"flow_ids"`
	DataSource      *DataSource       `json:"data_source,omitempty"`
	Iterations      int               `json:"iterations"` // Number of iterations (if no data source)
	DelayMs         int64             `json:"delay_ms"`   // Delay between iterations
	StopOnError     bool              `json:"stop_on_error"`
	Parallel        int               `json:"parallel"`        // Number of parallel executions (1 = sequential)
	Variables       map[string]string `json:"variables"`       // Global variables for all iterations
	VariableMapping map[string]string `json:"variable_mapping"` // Map data columns to variable names
	Environment     string            `json:"environment"`
}

// CollectionRunResult represents the result of a collection run
type CollectionRunResult struct {
	ID             uuid.UUID           `json:"id"`
	Status         string              `json:"status"` // "running", "completed", "failed", "cancelled"
	TotalIterations int               `json:"total_iterations"`
	CompletedIterations int           `json:"completed_iterations"`
	PassedIterations int              `json:"passed_iterations"`
	FailedIterations int              `json:"failed_iterations"`
	IterationResults []IterationResult `json:"iteration_results"`
	StartedAt      time.Time          `json:"started_at"`
	FinishedAt     *time.Time         `json:"finished_at,omitempty"`
	DurationMs     int64              `json:"duration_ms"`
	Error          string             `json:"error,omitempty"`
}

// IterationResult represents the result of a single iteration
type IterationResult struct {
	Iteration     int               `json:"iteration"`
	DataRow       DataRow           `json:"data_row,omitempty"`
	FlowResults   []FlowRunResult   `json:"flow_results"`
	Status        string            `json:"status"` // "passed", "failed"
	StartedAt     time.Time         `json:"started_at"`
	FinishedAt    time.Time         `json:"finished_at"`
	DurationMs    int64             `json:"duration_ms"`
	Error         string            `json:"error,omitempty"`
}

// FlowRunResult represents the result of running a single flow
type FlowRunResult struct {
	FlowID      uuid.UUID `json:"flow_id"`
	FlowName    string    `json:"flow_name"`
	ExecutionID uuid.UUID `json:"execution_id"`
	Status      string    `json:"status"`
	DurationMs  int64     `json:"duration_ms"`
	Error       string    `json:"error,omitempty"`
}

// ParseCSV parses CSV content into data rows
func ParseCSV(content string) ([]DataRow, error) {
	reader := csv.NewReader(strings.NewReader(content))

	// Read header
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	var rows []DataRow
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV record: %w", err)
		}

		row := make(DataRow)
		for i, value := range record {
			if i < len(header) {
				row[header[i]] = value
			}
		}
		rows = append(rows, row)
	}

	return rows, nil
}

// ParseJSON parses JSON content into data rows
func ParseJSON(content string) ([]DataRow, error) {
	var rows []DataRow

	// Try parsing as array first
	if err := json.Unmarshal([]byte(content), &rows); err != nil {
		// Try parsing as object with "data" key
		var wrapper struct {
			Data []DataRow `json:"data"`
		}
		if err := json.Unmarshal([]byte(content), &wrapper); err != nil {
			return nil, fmt.Errorf("failed to parse JSON data: %w", err)
		}
		rows = wrapper.Data
	}

	return rows, nil
}

// Run executes a collection run
func (r *CollectionRunner) Run(ctx context.Context, config *CollectionRunConfig, flows []*models.Flow, progressFn func(*CollectionRunResult)) (*CollectionRunResult, error) {
	result := &CollectionRunResult{
		ID:        uuid.New(),
		Status:    "running",
		StartedAt: time.Now(),
	}

	// Parse data source if provided
	var dataRows []DataRow
	if config.DataSource != nil {
		var err error
		switch config.DataSource.Type {
		case "csv":
			dataRows, err = ParseCSV(config.DataSource.Content)
		case "json":
			dataRows, err = ParseJSON(config.DataSource.Content)
		case "inline":
			dataRows = config.DataSource.Data
		default:
			return nil, fmt.Errorf("unsupported data source type: %s", config.DataSource.Type)
		}
		if err != nil {
			return nil, err
		}
	}

	// Determine number of iterations
	iterations := config.Iterations
	if len(dataRows) > 0 {
		iterations = len(dataRows)
	}
	if iterations == 0 {
		iterations = 1
	}

	result.TotalIterations = iterations
	result.IterationResults = make([]IterationResult, 0, iterations)

	// Run iterations
	parallel := config.Parallel
	if parallel <= 0 {
		parallel = 1
	}

	var mu sync.Mutex
	sem := make(chan struct{}, parallel)

	for i := 0; i < iterations; i++ {
		select {
		case <-ctx.Done():
			result.Status = "cancelled"
			result.Error = "cancelled by user"
			return result, nil
		default:
		}

		sem <- struct{}{}

		go func(iteration int) {
			defer func() { <-sem }()

			iterResult := IterationResult{
				Iteration: iteration + 1,
				StartedAt: time.Now(),
			}

			// Get data row if available
			var dataRow DataRow
			if iteration < len(dataRows) {
				dataRow = dataRows[iteration]
				iterResult.DataRow = dataRow
			}

			// Build variables for this iteration
			vars := make(map[string]string)
			for k, v := range config.Variables {
				vars[k] = v
			}

			// Apply data row with variable mapping
			if dataRow != nil {
				for dataKey, dataValue := range dataRow {
					varName := dataKey
					if mapped, ok := config.VariableMapping[dataKey]; ok {
						varName = mapped
					}
					vars[varName] = fmt.Sprintf("%v", dataValue)
				}
			}

			// Add iteration number as a variable
			vars["__iteration"] = fmt.Sprintf("%d", iteration+1)
			vars["__total_iterations"] = fmt.Sprintf("%d", iterations)

			// Run each flow
			for _, flow := range flows {
				flowResult := FlowRunResult{
					FlowID:   flow.ID,
					FlowName: flow.Name,
				}

				// TODO: Execute flow with variables
				// This would integrate with the existing executor
				// For now, we'll create a placeholder
				flowResult.Status = "completed"
				flowResult.DurationMs = 100

				iterResult.FlowResults = append(iterResult.FlowResults, flowResult)
			}

			iterResult.FinishedAt = time.Now()
			iterResult.DurationMs = iterResult.FinishedAt.Sub(iterResult.StartedAt).Milliseconds()

			// Determine iteration status
			allPassed := true
			for _, fr := range iterResult.FlowResults {
				if fr.Status != "completed" {
					allPassed = false
					break
				}
			}
			if allPassed {
				iterResult.Status = "passed"
			} else {
				iterResult.Status = "failed"
			}

			// Update result
			mu.Lock()
			result.IterationResults = append(result.IterationResults, iterResult)
			result.CompletedIterations++
			if iterResult.Status == "passed" {
				result.PassedIterations++
			} else {
				result.FailedIterations++
			}
			mu.Unlock()

			// Report progress
			if progressFn != nil {
				progressFn(result)
			}

			// Delay between iterations
			if config.DelayMs > 0 && iteration < iterations-1 {
				time.Sleep(time.Duration(config.DelayMs) * time.Millisecond)
			}

			// Check if we should stop on error
			if config.StopOnError && iterResult.Status == "failed" {
				mu.Lock()
				result.Status = "failed"
				result.Error = "stopped due to iteration failure"
				mu.Unlock()
			}
		}(i)
	}

	// Wait for all iterations to complete
	for i := 0; i < parallel; i++ {
		sem <- struct{}{}
	}

	// Finalize result
	finishedAt := time.Now()
	result.FinishedAt = &finishedAt
	result.DurationMs = finishedAt.Sub(result.StartedAt).Milliseconds()

	if result.Status == "running" {
		if result.FailedIterations > 0 {
			result.Status = "failed"
		} else {
			result.Status = "completed"
		}
	}

	return result, nil
}

// ValidateDataSource validates a data source
func ValidateDataSource(source *DataSource) error {
	if source == nil {
		return nil
	}

	switch source.Type {
	case "csv":
		_, err := ParseCSV(source.Content)
		return err
	case "json":
		_, err := ParseJSON(source.Content)
		return err
	case "inline":
		if len(source.Data) == 0 {
			return fmt.Errorf("inline data source has no data")
		}
		return nil
	default:
		return fmt.Errorf("unsupported data source type: %s", source.Type)
	}
}

// GetDataPreview returns a preview of the data source
func GetDataPreview(source *DataSource, maxRows int) ([]DataRow, []string, error) {
	var rows []DataRow
	var columns []string

	switch source.Type {
	case "csv":
		var err error
		rows, err = ParseCSV(source.Content)
		if err != nil {
			return nil, nil, err
		}
	case "json":
		var err error
		rows, err = ParseJSON(source.Content)
		if err != nil {
			return nil, nil, err
		}
	case "inline":
		rows = source.Data
	default:
		return nil, nil, fmt.Errorf("unsupported data source type: %s", source.Type)
	}

	// Extract column names from first row
	if len(rows) > 0 {
		for key := range rows[0] {
			columns = append(columns, key)
		}
	}

	// Limit rows
	if maxRows > 0 && len(rows) > maxRows {
		rows = rows[:maxRows]
	}

	return rows, columns, nil
}
