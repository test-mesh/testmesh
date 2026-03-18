// Package worker manages a pool of goroutines that execute TestMesh flows
// locally and invoke a callback with per-step and final results.
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/runner/actions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ResultFn is called by the worker after each step and once on job completion.
type ResultFn func(Result)

// Job is a flow execution request received from the control plane.
type Job struct {
	ID         string                 `json:"id"`          // unique job ID assigned by cloud
	Definition models.FlowDefinition  `json:"definition"`  // full flow definition
	Variables  map[string]string      `json:"variables"`   // runtime variable overrides
	ResultFn   ResultFn               `json:"-"`           // set locally, never sent over wire
}

// Result is a single update streamed back to the control plane.
// It covers both per-step progress and the final job outcome.
type Result struct {
	JobID     string          `json:"job_id"`
	Type      ResultType      `json:"type"`
	StepID    string          `json:"step_id,omitempty"`
	StepIndex int             `json:"step_index,omitempty"`
	Status    StepStatus      `json:"status"`
	Duration  time.Duration   `json:"duration_ms"`
	Output    json.RawMessage `json:"output,omitempty"`
	Error     string          `json:"error,omitempty"`
}

type ResultType string

const (
	ResultTypeStepStarted   ResultType = "step_started"
	ResultTypeStepCompleted ResultType = "step_completed"
	ResultTypeStepFailed    ResultType = "step_failed"
	ResultTypeFlowCompleted ResultType = "flow_completed"
	ResultTypeFlowFailed    ResultType = "flow_failed"
)

type StepStatus string

const (
	StatusRunning StepStatus = "running"
	StatusPassed  StepStatus = "passed"
	StatusFailed  StepStatus = "failed"
)

// Pool is a bounded pool of worker goroutines.
type Pool struct {
	workers int
	jobs    chan Job
	logger  *zap.Logger
	done    chan struct{}
}

// NewPool creates a Pool with the given concurrency limit.
func NewPool(workers int, logger *zap.Logger) *Pool {
	return &Pool{
		workers: workers,
		jobs:    make(chan Job, workers*2),
		logger:  logger,
		done:    make(chan struct{}),
	}
}

// Start launches worker goroutines. Call Stop to shut them down.
func (p *Pool) Start() {
	for i := 0; i < p.workers; i++ {
		go p.work()
	}
}

// Stop drains the job queue and waits for workers to finish.
func (p *Pool) Stop() {
	close(p.done)
}

// Enqueue adds a job to the pool. Blocks if the pool is at capacity.
func (p *Pool) Enqueue(job Job) {
	select {
	case p.jobs <- job:
	case <-p.done:
	}
}

func (p *Pool) work() {
	for {
		select {
		case job := <-p.jobs:
			p.execute(job)
		case <-p.done:
			return
		}
	}
}

// execute runs a single job and streams results via job.ResultFn.
func (p *Pool) execute(job Job) {
	p.logger.Info("executing job", zap.String("job_id", job.ID), zap.String("flow", job.Definition.Name))

	// Build a streaming WSHub that fires job.ResultFn on each step event.
	hub := &streamingHub{job: job, logger: p.logger}

	// Use the OSS executor — no DB needed, execution is fully local.
	exec := runner.NewExecutor(
		nil,   // no execution repository — agent does not write to a DB
		p.logger,
		hub,
		nil,   // no mock manager
	)

	// Register all built-in action handlers.
	actions.RegisterDefaults(exec)

	flow := &models.Flow{Definition: job.Definition}

	start := time.Now()
	err := exec.ExecuteWithoutPersistence(context.Background(), flow, job.Variables)

	if err != nil {
		job.ResultFn(Result{
			JobID:    job.ID,
			Type:     ResultTypeFlowFailed,
			Status:   StatusFailed,
			Duration: time.Since(start),
			Error:    err.Error(),
		})
		p.logger.Warn("job failed", zap.String("job_id", job.ID), zap.Error(err))
		return
	}

	job.ResultFn(Result{
		JobID:    job.ID,
		Type:     ResultTypeFlowCompleted,
		Status:   StatusPassed,
		Duration: time.Since(start),
	})
	p.logger.Info("job completed", zap.String("job_id", job.ID), zap.Duration("duration", time.Since(start)))
}

// ── streamingHub ─────────────────────────────────────────────────────────────
//
// Implements runner.WSHub so the executor can emit step events.
// Instead of broadcasting to WebSocket clients in the API, it calls job.ResultFn
// to stream each event back to the cloud control plane.

type streamingHub struct {
	job    Job
	logger *zap.Logger
}

func (h *streamingHub) BroadcastExecutionStarted(_ interface{}, _ map[string]interface{}) {}
func (h *streamingHub) BroadcastExecutionCompleted(_ interface{}, _ map[string]interface{}) {}
func (h *streamingHub) BroadcastExecutionFailed(_ interface{}, _ map[string]interface{}) {}

func (h *streamingHub) BroadcastStepStarted(_ interface{}, data map[string]interface{}) {
	h.job.ResultFn(Result{
		JobID:  h.job.ID,
		Type:   ResultTypeStepStarted,
		StepID: stringFromMap(data, "step_id"),
		Status: StatusRunning,
	})
}

func (h *streamingHub) BroadcastStepCompleted(_ interface{}, data map[string]interface{}) {
	out, _ := json.Marshal(data["output"])
	h.job.ResultFn(Result{
		JobID:    h.job.ID,
		Type:     ResultTypeStepCompleted,
		StepID:   stringFromMap(data, "step_id"),
		Status:   StatusPassed,
		Duration: durationFromMap(data, "duration_ms"),
		Output:   out,
	})
}

func (h *streamingHub) BroadcastStepFailed(_ interface{}, data map[string]interface{}) {
	h.job.ResultFn(Result{
		JobID:    h.job.ID,
		Type:     ResultTypeStepFailed,
		StepID:   stringFromMap(data, "step_id"),
		Status:   StatusFailed,
		Duration: durationFromMap(data, "duration_ms"),
		Error:    fmt.Sprintf("%v", data["error"]),
	})
}

func stringFromMap(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func durationFromMap(m map[string]interface{}, key string) time.Duration {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case float64:
			return time.Duration(t) * time.Millisecond
		case int64:
			return time.Duration(t) * time.Millisecond
		}
	}
	return 0
}
