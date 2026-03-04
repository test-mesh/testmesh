package runner

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/plugins"
	"github.com/georgi-georgiev/testmesh/internal/runner/actions"
	"github.com/georgi-georgiev/testmesh/internal/runner/assertions"
	"github.com/georgi-georgiev/testmesh/internal/runner/contracts"
	"github.com/georgi-georgiev/testmesh/internal/runner/debugger"
	"github.com/georgi-georgiev/testmesh/internal/runner/mocks"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Executor orchestrates flow execution
type Executor struct {
	repo            *repository.ExecutionRepository
	contractRepo    *repository.ContractRepository
	logger          *zap.Logger
	wsHub           WSHub // WebSocket hub interface
	mockManager     *mocks.Manager
	pluginRegistry  *plugins.Registry
	debugController *debugger.Controller
}

// WSHub interface for WebSocket broadcasting
type WSHub interface {
	BroadcastExecutionStarted(executionID uuid.UUID, data map[string]interface{})
	BroadcastExecutionCompleted(executionID uuid.UUID, data map[string]interface{})
	BroadcastExecutionFailed(executionID uuid.UUID, data map[string]interface{})
	BroadcastStepStarted(executionID uuid.UUID, data map[string]interface{})
	BroadcastStepCompleted(executionID uuid.UUID, data map[string]interface{})
	BroadcastStepFailed(executionID uuid.UUID, data map[string]interface{})
}

// NewExecutor creates a new executor instance
func NewExecutor(repo *repository.ExecutionRepository, contractRepo *repository.ContractRepository, logger *zap.Logger, wsHub WSHub, mockManager *mocks.Manager) *Executor {
	return &Executor{
		repo:         repo,
		contractRepo: contractRepo,
		logger:       logger,
		wsHub:        wsHub,
		mockManager:  mockManager,
	}
}

// SetPluginRegistry sets the plugin registry for custom action support
func (e *Executor) SetPluginRegistry(registry *plugins.Registry) {
	e.pluginRegistry = registry
}

// SetDebugController sets the debug controller for debugging support
func (e *Executor) SetDebugController(controller *debugger.Controller) {
	e.debugController = controller
}

// GetDebugController returns the debug controller
func (e *Executor) GetDebugController() *debugger.Controller {
	return e.debugController
}

// ExecuteWithoutPersistence runs a flow without persisting results to the database.
// This is optimized for load testing where we don't want DB overhead per request.
func (e *Executor) ExecuteWithoutPersistence(ctx context.Context, flow *models.Flow, variables map[string]string) error {
	definition := &flow.Definition

	// Create execution context
	execCtx := NewContext(variables, definition.Env)

	// Execute setup steps
	if len(definition.Setup) > 0 {
		if err := e.executeStepsWithoutPersistence(ctx, definition.Setup, execCtx); err != nil {
			return fmt.Errorf("setup failed: %w", err)
		}
	}

	// Execute main steps
	if err := e.executeStepsWithoutPersistence(ctx, definition.Steps, execCtx); err != nil {
		// Run teardown even if main steps fail
		if len(definition.Teardown) > 0 {
			e.executeStepsWithoutPersistence(ctx, definition.Teardown, execCtx)
		}
		return fmt.Errorf("execution failed: %w", err)
	}

	// Execute teardown steps
	if len(definition.Teardown) > 0 {
		if err := e.executeStepsWithoutPersistence(ctx, definition.Teardown, execCtx); err != nil {
			return fmt.Errorf("teardown failed: %w", err)
		}
	}

	return nil
}

// executeStepsWithoutPersistence executes steps without DB writes
func (e *Executor) executeStepsWithoutPersistence(ctx context.Context, steps []models.Step, execCtx *Context) error {
	for i, step := range steps {
		stepID := step.ID
		if stepID == "" {
			stepID = fmt.Sprintf("step_%d", i)
		}

		// Execute the step (skip retry for load testing performance)
		result, err := e.executeStep(ctx, &step, execCtx)
		if err != nil {
			return fmt.Errorf("step %s failed: %w", stepID, err)
		}

		// Auto-store all direct result keys so ${stepId.key} works without an output: section
		for key, value := range result {
			execCtx.SetStepOutput(stepID, key, value)
		}
		// Store explicitly-mapped output paths (overrides auto-stored values)
		for key, path := range step.Output {
			value := extractValue(result, path)
			execCtx.SetStepOutput(stepID, key, value)
		}
	}
	return nil
}

// Execute runs a flow definition
func (e *Executor) Execute(execution *models.Execution, definition *models.FlowDefinition, variables map[string]string) error {
	ctx := context.Background()

	// Create execution context
	execCtx := NewContext(variables, definition.Env)

	// Count total steps
	totalSteps := len(definition.Setup) + len(definition.Steps) + len(definition.Teardown)
	execution.TotalSteps = totalSteps

	// Broadcast execution started
	if e.wsHub != nil {
		e.wsHub.BroadcastExecutionStarted(execution.ID, map[string]interface{}{
			"flow_name":   definition.Name,
			"total_steps": totalSteps,
		})
	}

	// Execute setup steps
	if len(definition.Setup) > 0 {
		e.logger.Info("Executing setup steps", zap.Int("count", len(definition.Setup)))
		if err := e.executeSteps(ctx, execution, definition.Setup, execCtx, "setup"); err != nil {
			return fmt.Errorf("setup failed: %w", err)
		}
	}

	// Execute main steps
	e.logger.Info("Executing main steps", zap.Int("count", len(definition.Steps)))
	if err := e.executeSteps(ctx, execution, definition.Steps, execCtx, "main"); err != nil {
		// Run teardown even if main steps fail
		if len(definition.Teardown) > 0 {
			e.logger.Info("Executing teardown steps after failure")
			e.executeSteps(ctx, execution, definition.Teardown, execCtx, "teardown")
		}
		return fmt.Errorf("execution failed: %w", err)
	}

	// Execute teardown steps
	if len(definition.Teardown) > 0 {
		e.logger.Info("Executing teardown steps", zap.Int("count", len(definition.Teardown)))
		if err := e.executeSteps(ctx, execution, definition.Teardown, execCtx, "teardown"); err != nil {
			return fmt.Errorf("teardown failed: %w", err)
		}
	}

	return nil
}

// executeSteps executes a slice of steps
func (e *Executor) executeSteps(ctx context.Context, execution *models.Execution, steps []models.Step, execCtx *Context, phase string) error {
	for i, step := range steps {
		stepID := step.ID
		if stepID == "" {
			stepID = fmt.Sprintf("%s_%d", phase, i)
		}

		e.logger.Info("Executing step",
			zap.String("step_id", stepID),
			zap.String("action", step.Action),
			zap.String("phase", phase),
		)

		// Create step record
		execStep := &models.ExecutionStep{
			ExecutionID: execution.ID,
			StepID:      stepID,
			StepName:    step.Name,
			Action:      step.Action,
			Status:      models.StepStatusRunning,
		}
		now := time.Now()
		execStep.StartedAt = &now

		if err := e.repo.CreateStep(execStep); err != nil {
			return err
		}

		// Broadcast step started
		if e.wsHub != nil {
			e.wsHub.BroadcastStepStarted(execution.ID, map[string]interface{}{
				"step_id":   stepID,
				"step_name": step.Name,
				"action":    step.Action,
				"phase":     phase,
			})
		}

		// Execute the step with retry logic
		result, err := e.executeStepWithRetry(ctx, &step, execStep, execCtx, execution.ID)

		// Update step record
		finishedAt := time.Now()
		execStep.FinishedAt = &finishedAt
		execStep.DurationMs = finishedAt.Sub(*execStep.StartedAt).Milliseconds()

		if err != nil {
			execStep.Status = models.StepStatusFailed
			execStep.ErrorMessage = err.Error()
			e.repo.UpdateStep(execStep)

			execution.FailedSteps++

			// Broadcast step failed
			if e.wsHub != nil {
				e.wsHub.BroadcastStepFailed(execution.ID, map[string]interface{}{
					"step_id":       stepID,
					"step_name":     step.Name,
					"error_message": err.Error(),
					"duration_ms":   execStep.DurationMs,
				})
			}

			// Wrap error with execution context
			execErr := NewExecutionError(
				phase,
				stepID,
				step.Name,
				step.Action,
				err.Error(),
				err,
			)
			return execErr
		}

		execStep.Status = models.StepStatusCompleted
		execStep.Output = result
		e.repo.UpdateStep(execStep)

		execution.PassedSteps++

		// Broadcast step completed
		if e.wsHub != nil {
			e.wsHub.BroadcastStepCompleted(execution.ID, map[string]interface{}{
				"step_id":     stepID,
				"step_name":   step.Name,
				"status":      string(execStep.Status),
				"duration_ms": execStep.DurationMs,
			})
		}

		// Auto-store all direct result keys so ${stepId.key} works without an output: section
		for key, value := range result {
			execCtx.SetStepOutput(stepID, key, value)
		}
		// Store explicitly-mapped output paths (overrides auto-stored values)
		for key, path := range step.Output {
			value := extractValue(result, path)
			execCtx.SetStepOutput(stepID, key, value)
		}
	}

	return nil
}

// executeStepWithRetry executes a step with retry logic
func (e *Executor) executeStepWithRetry(ctx context.Context, step *models.Step, execStep *models.ExecutionStep, execCtx *Context, executionID uuid.UUID) (models.OutputData, error) {
	maxAttempts := 1
	var delay time.Duration
	backoff := "fixed"

	// Get retry configuration
	if step.Retry != nil {
		maxAttempts = step.Retry.MaxAttempts
		if maxAttempts < 1 {
			maxAttempts = 1
		}

		// Parse delay
		if step.Retry.Delay != "" {
			if d, err := time.ParseDuration(step.Retry.Delay); err == nil {
				delay = d
			}
		}

		if step.Retry.Backoff != "" {
			backoff = step.Retry.Backoff
		}
	}

	var lastErr error
	currentDelay := delay

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		execStep.Attempt = attempt
		e.repo.UpdateStep(execStep)

		if attempt > 1 {
			e.logger.Info("Retrying step",
				zap.String("step_id", step.ID),
				zap.Int("attempt", attempt),
				zap.Int("max_attempts", maxAttempts),
			)

			// Wait before retry
			if currentDelay > 0 {
				time.Sleep(currentDelay)

				// Apply backoff
				if backoff == "exponential" {
					currentDelay *= 2
				}
			}
		}

		result, err := e.executeStepWithDebug(ctx, step, execCtx, executionID)
		if err == nil {
			return result, nil
		}

		lastErr = err

		// Log retry failure
		if attempt < maxAttempts {
			e.logger.Warn("Step execution failed, will retry",
				zap.String("step_id", step.ID),
				zap.Error(err),
				zap.Int("attempt", attempt),
			)
		}
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", maxAttempts, lastErr)
}

// executeStep executes a single step
func (e *Executor) executeStep(ctx context.Context, step *models.Step, execCtx *Context) (models.OutputData, error) {
	return e.executeStepWithDebug(ctx, step, execCtx, uuid.Nil)
}

// executeStepWithDebug executes a single step with optional debug support
func (e *Executor) executeStepWithDebug(ctx context.Context, step *models.Step, execCtx *Context, executionID uuid.UUID) (models.OutputData, error) {
	startTime := time.Now()

	// Create interpolator
	interpolator := NewInterpolator(execCtx)

	// Interpolate variables in config
	config := interpolator.InterpolateMap(step.Config)

	// Debug: Check breakpoints before step execution
	if e.debugController != nil && executionID != uuid.Nil {
		// Update debugger with current variables
		vars := make(map[string]interface{})
		for k, v := range execCtx.variables {
			vars[k] = v
		}
		for stepID, outputs := range execCtx.stepOutputs {
			vars["$"+stepID] = outputs
		}
		e.debugController.UpdateVariables(executionID, vars)

		// Call debug hook before step
		shouldContinue, err := e.debugController.OnBeforeStep(ctx, executionID, step.ID, step.Name, step.Action, config)
		if err != nil {
			return nil, fmt.Errorf("debug error: %w", err)
		}
		if !shouldContinue {
			return nil, fmt.Errorf("execution stopped")
		}
	}

	// Get action handler
	handler, err := e.getActionHandler(step.Action)
	if err != nil {
		e.notifyDebugAfterStep(executionID, step.ID, nil, err, time.Since(startTime))
		return nil, err
	}

	// Execute action
	result, err := handler.Execute(ctx, config)
	if err != nil {
		e.notifyDebugAfterStep(executionID, step.ID, result, err, time.Since(startTime))
		return nil, err
	}

	// Run assertions if any
	if len(step.Assert) > 0 {
		evaluator := assertions.NewEvaluator(result)
		if err := evaluator.Evaluate(step.Assert); err != nil {
			assertErr := fmt.Errorf("assertion failed: %w", err)
			e.notifyDebugAfterStep(executionID, step.ID, result, assertErr, time.Since(startTime))
			return result, assertErr
		}
		e.logger.Info("All assertions passed", zap.Int("count", len(step.Assert)))
	}

	// Debug: Notify after successful step
	e.notifyDebugAfterStep(executionID, step.ID, result, nil, time.Since(startTime))

	return result, nil
}

// notifyDebugAfterStep notifies the debugger after step completion
func (e *Executor) notifyDebugAfterStep(executionID uuid.UUID, stepID string, output models.OutputData, err error, duration time.Duration) {
	if e.debugController != nil && executionID != uuid.Nil {
		e.debugController.OnAfterStep(executionID, stepID, output, err, duration)
	}
}

// getActionHandler returns the appropriate action handler
func (e *Executor) getActionHandler(actionType string) (actions.Handler, error) {
	switch actionType {
	case "http_request":
		return actions.NewHTTPHandler(e.logger), nil
	case "database_query":
		return actions.NewDatabaseHandler(e.logger), nil
	case "log":
		return actions.NewLogHandler(e.logger), nil
	case "delay":
		return actions.NewDelayHandler(e.logger), nil
	case "transform":
		return actions.NewTransformHandler(e.logger), nil
	case "assert":
		return actions.NewAssertHandler(e.logger), nil
	case "condition":
		return actions.NewConditionHandler(e.logger, nil), nil
	case "for_each":
		return actions.NewForEachHandler(e.logger, nil), nil
	case "mock_server_start":
		if e.mockManager == nil {
			return nil, fmt.Errorf("mock manager not initialized")
		}
		return actions.NewMockServerStartHandler(e.mockManager, e.logger), nil
	case "mock_server_stop":
		if e.mockManager == nil {
			return nil, fmt.Errorf("mock manager not initialized")
		}
		return actions.NewMockServerStopHandler(e.mockManager, e.logger), nil
	case "mock_server_configure":
		if e.mockManager == nil {
			return nil, fmt.Errorf("mock manager not initialized")
		}
		return actions.NewMockServerConfigureHandler(e.mockManager, e.logger), nil
	case "contract_generate":
		if e.contractRepo == nil {
			return nil, fmt.Errorf("contract repository not initialized")
		}
		generator := contracts.NewGenerator(e.contractRepo, e.logger)
		return actions.NewContractGenerateHandler(generator, e.repo, e.logger), nil
	case "contract_verify":
		if e.contractRepo == nil {
			return nil, fmt.Errorf("contract repository not initialized")
		}
		verifier := contracts.NewVerifier(e.contractRepo, e.logger)
		differ := contracts.NewDiffer(e.contractRepo, e.logger)
		return actions.NewContractVerifyHandler(verifier, differ, e.logger), nil
	case "kafka_consumer":
		return actions.NewKafkaConsumerHandler(e.logger), nil
	case "kafka_producer":
		return actions.NewKafkaProducerHandler(e.logger), nil
	case "wait_for":
		return actions.NewWaitForHandler(e.logger), nil
	case "db_poll":
		return actions.NewDBPollHandler(e.logger), nil
	case "websocket":
		return actions.NewWebSocketHandler(e.logger), nil
	case "grpc":
		return actions.NewGRPCHandler(e.logger), nil
	default:
		// Check plugin registry for custom actions
		if e.pluginRegistry != nil {
			// First try exact match (e.g., "kafka")
			if plugin, ok := e.pluginRegistry.GetAction(actionType); ok {
				return &PluginActionAdapter{plugin: plugin, action: actionType, logger: e.logger}, nil
			}

			// Then try prefix match for namespaced actions (e.g., "kafka.produce" -> "kafka")
			if idx := strings.Index(actionType, "."); idx > 0 {
				pluginName := actionType[:idx]
				if plugin, ok := e.pluginRegistry.GetAction(pluginName); ok {
					return &PluginActionAdapter{plugin: plugin, action: actionType, logger: e.logger}, nil
				}
			}
		}
		return nil, fmt.Errorf("unknown action type: %s", actionType)
	}
}

// PluginActionAdapter wraps a plugin to implement the Handler interface
type PluginActionAdapter struct {
	plugin plugins.ActionPlugin
	action string
	logger *zap.Logger
}

// Execute runs the plugin action
func (a *PluginActionAdapter) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Pass the action type to the plugin so it knows which sub-action to run
	configWithAction := make(map[string]interface{})
	for k, v := range config {
		configWithAction[k] = v
	}
	configWithAction["_action"] = a.action

	result, err := a.plugin.Execute(ctx, configWithAction)
	if err != nil {
		a.logger.Error("Plugin action failed",
			zap.String("plugin", a.plugin.Name()),
			zap.String("action", a.action),
			zap.Error(err),
		)
		return nil, err
	}
	return result, nil
}

// extractValue extracts a value from result using JSONPath
func extractValue(result models.OutputData, path string) interface{} {
	if path == "" || path == "$" {
		return result
	}

	// Try JSONPath extraction (works for HTTP steps with body)
	evaluator := assertions.NewEvaluator(result)
	value, err := evaluator.EvaluateJSONPath(path)
	if err == nil {
		return value
	}

	// Fallback: dot-notation traversal over the full result map
	if dotValue := extractDotPath(map[string]interface{}(result), path); dotValue != nil {
		return dotValue
	}

	// Final fallback: direct key access
	return result[path]
}

// extractDotPath traverses a nested map using dot-separated path segments.
func extractDotPath(data map[string]interface{}, path string) interface{} {
	parts := strings.SplitN(path, ".", 2)
	val, ok := data[parts[0]]
	if !ok || val == nil {
		return nil
	}
	if len(parts) == 1 {
		return val
	}
	switch nested := val.(type) {
	case map[string]interface{}:
		return extractDotPath(nested, parts[1])
	case map[interface{}]interface{}:
		converted := make(map[string]interface{}, len(nested))
		for k, v := range nested {
			if ks, ok := k.(string); ok {
				converted[ks] = v
			}
		}
		return extractDotPath(converted, parts[1])
	}
	return nil
}
