package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// BranchExecutor can execute a sequence of steps and return merged output.
type BranchExecutor interface {
	ExecuteSteps(ctx context.Context, steps []models.Step, vars map[string]string) (models.OutputData, error)
}

// ParallelHandler executes multiple branches of steps concurrently.
type ParallelHandler struct {
	logger   *zap.Logger
	executor BranchExecutor
}

// NewParallelHandler creates a new parallel handler.
func NewParallelHandler(logger *zap.Logger, executor BranchExecutor) *ParallelHandler {
	return &ParallelHandler{
		logger:   logger,
		executor: executor,
	}
}

// Execute runs all branches concurrently and collects their results.
func (h *ParallelHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Parse branches
	branchesRaw, ok := config["branches"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("branches is required and must be an array")
	}

	// Parse max_concurrent (0 = unlimited)
	maxConcurrent := 0
	if mc, ok := config["max_concurrent"]; ok {
		switch v := mc.(type) {
		case int:
			maxConcurrent = v
		case float64:
			maxConcurrent = int(v)
		}
	}

	// Parse fail_fast (default: true)
	failFast := true
	if ff, ok := config["fail_fast"]; ok {
		if ffBool, ok := ff.(bool); ok {
			failFast = ffBool
		}
	}

	// Parse wait_for_all (default: true)
	waitForAll := true
	if wfa, ok := config["wait_for_all"]; ok {
		if wfaBool, ok := wfa.(bool); ok {
			waitForAll = wfaBool
		}
	}

	// Parse each branch's steps
	type branch struct {
		steps []models.Step
	}
	branches := make([]branch, 0, len(branchesRaw))
	for i, b := range branchesRaw {
		bMap, ok := b.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("branch %d must be an object with a 'steps' key", i)
		}
		stepsRaw, ok := bMap["steps"].([]interface{})
		if !ok {
			return nil, fmt.Errorf("branch %d: 'steps' must be an array", i)
		}

		// Convert []interface{} → []models.Step via JSON round-trip
		stepsJSON, err := json.Marshal(stepsRaw)
		if err != nil {
			return nil, fmt.Errorf("branch %d: failed to marshal steps: %w", i, err)
		}
		var steps []models.Step
		if err := json.Unmarshal(stepsJSON, &steps); err != nil {
			return nil, fmt.Errorf("branch %d: failed to parse steps: %w", i, err)
		}
		branches = append(branches, branch{steps: steps})
	}

	h.logger.Info("Starting parallel execution",
		zap.Int("branches", len(branches)),
		zap.Int("max_concurrent", maxConcurrent),
		zap.Bool("fail_fast", failFast),
	)

	// Set up cancellable context for fail_fast support
	execCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Semaphore for max_concurrent (nil channel = unlimited)
	var sem chan struct{}
	if maxConcurrent > 0 {
		sem = make(chan struct{}, maxConcurrent)
	}

	type branchResult struct {
		index  int
		output models.OutputData
		err    error
	}

	results := make(chan branchResult, len(branches))
	var wg sync.WaitGroup

	for i, br := range branches {
		wg.Add(1)
		go func(idx int, steps []models.Step) {
			defer wg.Done()

			// Acquire semaphore slot
			if sem != nil {
				select {
				case sem <- struct{}{}:
					defer func() { <-sem }()
				case <-execCtx.Done():
					results <- branchResult{index: idx, err: execCtx.Err()}
					return
				}
			}

			// Check context before executing
			select {
			case <-execCtx.Done():
				results <- branchResult{index: idx, err: execCtx.Err()}
				return
			default:
			}

			var vars map[string]string
			if ctxVars, ok := config["_vars"]; ok {
				if m, ok := ctxVars.(map[string]string); ok {
					vars = m
				}
			}

			var output models.OutputData
			var err error
			if h.executor != nil {
				output, err = h.executor.ExecuteSteps(execCtx, steps, vars)
			} else {
				// No executor wired — return empty success
				output = models.OutputData{}
			}

			if err != nil && failFast {
				cancel()
			}

			results <- branchResult{index: idx, output: output, err: err}
		}(i, br.steps)
	}

	// Close results channel after all goroutines finish
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	branchOutputs := make(map[string]interface{}, len(branches))
	var firstErr error
	errCount := 0

	for res := range results {
		key := fmt.Sprintf("branch_%d", res.index)
		if res.err != nil {
			errCount++
			branchOutputs[key] = map[string]interface{}{
				"error":  res.err.Error(),
				"status": "failed",
			}
			if firstErr == nil {
				firstErr = res.err
			}
			if !waitForAll && failFast {
				// Drain remaining results but don't block forever
				go func() {
					for range results {
					}
				}()
				break
			}
		} else {
			branchOutputs[key] = map[string]interface{}{
				"output": res.output,
				"status": "completed",
			}
		}
	}

	h.logger.Info("Parallel execution completed",
		zap.Int("branches", len(branches)),
		zap.Int("errors", errCount),
	)

	output := models.OutputData{
		"branches_total":  len(branches),
		"branches_failed": errCount,
		"results":         branchOutputs,
	}

	if firstErr != nil && failFast {
		return output, fmt.Errorf("parallel execution failed: %w", firstErr)
	}

	return output, nil
}
