package runner

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/expr-lang/expr"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/plugins"
	"github.com/test-mesh/testmesh/internal/runner/actions"
	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/runner/debugger"
	"github.com/test-mesh/testmesh/internal/runner/mocks"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"github.com/test-mesh/testmesh/internal/tracing"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// Executor orchestrates flow execution
type Executor struct {
	repo            *repository.ExecutionRepository
	flowRepo        *repository.FlowRepository
	logger          *zap.Logger
	wsHub           WSHub // WebSocket hub interface
	mockManager     *mocks.Manager
	pluginRegistry  *plugins.Registry
	debugController *debugger.Controller
	graphResolver   *graph.GraphResolver
	executionTracer *tracing.ExecutionTracer
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
func NewExecutor(repo *repository.ExecutionRepository, logger *zap.Logger, wsHub WSHub, mockManager *mocks.Manager) *Executor {
	return &Executor{
		repo:        repo,
		logger:      logger,
		wsHub:       wsHub,
		mockManager: mockManager,
	}
}

// SetFlowRepository sets the flow repository for run_flow action support
func (e *Executor) SetFlowRepository(repo *repository.FlowRepository) {
	e.flowRepo = repo
}

// SetPluginRegistry sets the plugin registry for custom action support
func (e *Executor) SetPluginRegistry(registry *plugins.Registry) {
	e.pluginRegistry = registry
}

// SetDebugController sets the debug controller for debugging support
func (e *Executor) SetDebugController(controller *debugger.Controller) {
	e.debugController = controller
}

// SetGraphResolver sets the graph resolver for graph-aware step resolution.
func (e *Executor) SetGraphResolver(resolver *graph.GraphResolver) {
	e.graphResolver = resolver
}

// SetExecutionTracer sets the execution tracer for OpenTelemetry instrumentation.
func (e *Executor) SetExecutionTracer(tracer *tracing.ExecutionTracer) {
	e.executionTracer = tracer
}

// GetDebugController returns the debug controller
func (e *Executor) GetDebugController() *debugger.Controller {
	return e.debugController
}

// resolveEnvFile merges env_file variables (if specified) with inline env vars.
// env_file values serve as the base; inline env: values override them.
func (e *Executor) resolveEnvFile(definition *models.FlowDefinition) map[string]interface{} {
	if definition.EnvFile == "" {
		return definition.Env
	}
	merged, err := MergeEnvFileIntoDefinition(definition.Env, definition.EnvFile, definition.FlowDir)
	if err != nil {
		if e.logger != nil {
			e.logger.Warn("failed to load env_file",
				zap.String("env_file", definition.EnvFile),
				zap.Error(err))
		}
		return definition.Env
	}
	return merged
}

// ExecuteWithoutPersistence runs a flow without persisting results to the database.
// This is optimized for load testing where we don't want DB overhead per request.
func (e *Executor) ExecuteWithoutPersistence(ctx context.Context, flow *models.Flow, variables map[string]string) error {
	definition := &flow.Definition

	// Create execution context
	env := e.resolveEnvFile(definition)
	execCtx := NewContext(variables, env)

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

		// Evaluate when condition before executing the step
		if step.When != "" {
			shouldRun, evalErr := evalWhenCondition(step.When, execCtx)
			if evalErr != nil {
				e.logger.Warn("Failed to evaluate when condition, executing step anyway",
					zap.String("step_id", stepID),
					zap.String("when", step.When),
					zap.Error(evalErr),
				)
			} else if !shouldRun {
				e.logger.Debug("Skipping step: when condition evaluated to false",
					zap.String("step_id", stepID),
					zap.String("when", step.When),
				)
				continue
			}
		}

		// Execute the step (skip retry for load testing performance)
		result, err := e.executeStep(ctx, &step, execCtx)
		if err != nil {
			// Handle on_error policy
			if step.OnError != nil {
				switch step.OnError.Action {
				case "continue", "retry":
					// Treat retry as continue for now (retry logic is handled by step.Retry)
					e.logger.Warn("Step failed, continuing due to on_error policy",
						zap.String("step_id", stepID),
						zap.String("on_error_action", step.OnError.Action),
						zap.Error(err),
					)
					continue
				case "fail":
					// explicit fail — fall through to return error
				default:
					// unknown action — fail safe
				}
			}
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
			// Also store as flat variable so {{key}} works in subsequent steps
			execCtx.Set(key, fmt.Sprintf("%v", value))
		}
	}
	return nil
}

// Execute runs a flow definition
func (e *Executor) Execute(execution *models.Execution, definition *models.FlowDefinition, variables map[string]string) error {
	ctx := context.Background()

	// Start execution tracing span
	var rootSpan trace.Span
	if e.executionTracer != nil {
		var tracedCtx context.Context
		tracedCtx, rootSpan = e.executionTracer.StartExecution(ctx,
			execution.ID.String(),
			execution.FlowID.String(),
			definition.Name,
		)
		ctx = tracedCtx
		defer rootSpan.End()

		// Set trace ID on execution for correlation
		if rootSpan.SpanContext().IsValid() {
			execution.TraceID = rootSpan.SpanContext().TraceID().String()
		}
	}

	// Create execution context
	env := e.resolveEnvFile(definition)
	execCtx := NewContext(variables, env)

	// Validate graph requirements if specified
	if definition.Graph != nil && e.graphResolver != nil {
		if len(definition.Graph.Require) > 0 {
			workspaceID := uuid.Nil
			if wsID, ok := execCtx.Get("workspace_id"); ok {
				if parsed, err := uuid.Parse(wsID); err == nil {
					workspaceID = parsed
				}
			}
			if err := e.graphResolver.ValidateGraphRequirements(ctx, workspaceID, definition.Graph.Require); err != nil {
				return fmt.Errorf("graph requirement check failed: %w", err)
			}
		}
		// Store environment for graph-aware step resolution
		if definition.Graph.Environment != "" {
			execCtx.Set("environment", definition.Graph.Environment)
		}
	}

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

		// Evaluate when condition before executing the step
		if step.When != "" {
			shouldRun, evalErr := evalWhenCondition(step.When, execCtx)
			if evalErr != nil {
				e.logger.Warn("Failed to evaluate when condition, executing step anyway",
					zap.String("step_id", stepID),
					zap.String("when", step.When),
					zap.Error(evalErr),
				)
			} else if !shouldRun {
				e.logger.Debug("Skipping step: when condition evaluated to false",
					zap.String("step_id", stepID),
					zap.String("when", step.When),
				)
				continue
			}
		}

		e.logger.Info("Executing step",
			zap.String("step_id", stepID),
			zap.String("action", step.Action),
			zap.String("phase", phase),
		)

		// Start step tracing span
		var stepSpan trace.Span
		if e.executionTracer != nil {
			var stepCtx context.Context
			stepCtx, stepSpan = e.executionTracer.StartStep(ctx, stepID, step.Name, step.Action)
			ctx = stepCtx
		}

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
			if stepSpan != nil {
				stepSpan.End()
			}
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
			// Record step failure in tracing span
			if e.executionTracer != nil && stepSpan != nil {
				e.executionTracer.RecordStepResult(stepSpan, "failed", time.Since(*execStep.StartedAt), err)
				stepSpan.End()
			}

			execStep.Status = models.StepStatusFailed
			execStep.ErrorMessage = err.Error()
			execStep.Output = result
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

			// Check on_error policy before propagating the error
			if step.OnError != nil {
				switch step.OnError.Action {
				case "continue", "retry":
					// Treat retry as continue for now (retry logic is handled by step.Retry)
					e.logger.Warn("Step failed, continuing due to on_error policy",
						zap.String("step_id", stepID),
						zap.String("on_error_action", step.OnError.Action),
						zap.Error(err),
					)
					continue
				case "fail":
					// explicit fail — fall through to return error
				default:
					// unknown action — fail safe
				}
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

		// Record step success in tracing span
		if e.executionTracer != nil && stepSpan != nil {
			e.executionTracer.RecordStepResult(stepSpan, "completed", time.Since(*execStep.StartedAt), nil)
			stepSpan.End()
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
			// Also store as flat variable so {{key}} works in subsequent steps
			execCtx.Set(key, fmt.Sprintf("%v", value))
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
	var lastResult models.OutputData
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
		lastResult = result

		// Log retry failure
		if attempt < maxAttempts {
			e.logger.Warn("Step execution failed, will retry",
				zap.String("step_id", step.ID),
				zap.Error(err),
				zap.Int("attempt", attempt),
			)
		}
	}

	return lastResult, fmt.Errorf("failed after %d attempts: %w", maxAttempts, lastErr)
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

	// Apply environment routing overrides for this action type.
	// Step-level config takes precedence (overrides are merged first, then step config on top).
	if overrides := execCtx.GetRoutingOverrides(step.Action); len(overrides) > 0 {
		merged := make(map[string]interface{})
		for k, v := range overrides {
			merged[k] = v // routing default
		}
		for k, v := range config {
			merged[k] = v // step config wins
		}
		config = merged
	}

	// For HTTP requests, also inject environment-level routing headers.
	// Step-level headers take precedence over routing headers.
	if step.Action == "http_request" {
		if routingHeaders := execCtx.GetRoutingHeaders(); len(routingHeaders) > 0 {
			merged := make(map[string]interface{})
			for k, v := range routingHeaders {
				merged[k] = v
			}
			if stepHeaders, ok := config["headers"].(map[string]interface{}); ok {
				for k, v := range stepHeaders {
					merged[k] = v // step headers win
				}
			}
			config["headers"] = merged
		}
	}

	// Graph-aware resolution: resolve `service:` and `endpoint:` references
	if e.graphResolver != nil {
		if _, hasService := config["service"]; hasService {
			workspaceID := uuid.Nil
			if wsID, ok := execCtx.Get("workspace_id"); ok {
				if parsed, err := uuid.Parse(wsID); err == nil {
					workspaceID = parsed
				}
			}
			envStr, _ := execCtx.Get("environment")
			resolved, err := e.graphResolver.ResolveStep(ctx, workspaceID, config, envStr)
			if err != nil {
				e.notifyDebugAfterStep(executionID, step.ID, nil, err, time.Since(startTime))
				return nil, fmt.Errorf("graph resolution failed: %w", err)
			}
			config = resolved
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
		evaluator := assertions.NewEvaluatorWithVars(result, execCtx.variables)
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

// ExecuteSteps implements actions.BranchExecutor.
// It runs a slice of steps in a fresh execution context seeded with vars and returns
// the merged step outputs as OutputData.
func (e *Executor) ExecuteSteps(ctx context.Context, steps []models.Step, vars map[string]string) (models.OutputData, error) {
	if vars == nil {
		vars = make(map[string]string)
	}
	execCtx := NewContext(vars, nil)
	if err := e.executeStepsWithoutPersistence(ctx, steps, execCtx); err != nil {
		return nil, err
	}
	// Collect all step outputs into a flat result map
	result := make(models.OutputData)
	for stepID, outputs := range execCtx.stepOutputs {
		result[stepID] = outputs
	}
	return result, nil
}

// LoadFlow implements actions.FlowLoader.
func (e *Executor) LoadFlow(ctx context.Context, nameOrID string) (*models.Flow, error) {
	if e.flowRepo == nil {
		return nil, fmt.Errorf("flow repository not configured on executor")
	}
	return e.flowRepo.FindByNameOrID(nameOrID)
}

// RunFlowSteps implements actions.ChildFlowRunner.
// It executes setup + main + teardown steps of a child flow definition.
func (e *Executor) RunFlowSteps(ctx context.Context, definition *models.FlowDefinition, vars map[string]string) (models.OutputData, error) {
	if vars == nil {
		vars = make(map[string]string)
	}
	env := e.resolveEnvFile(definition)
	execCtx := NewContext(vars, env)

	if len(definition.Setup) > 0 {
		if err := e.executeStepsWithoutPersistence(ctx, definition.Setup, execCtx); err != nil {
			return nil, fmt.Errorf("child flow setup failed: %w", err)
		}
	}
	if err := e.executeStepsWithoutPersistence(ctx, definition.Steps, execCtx); err != nil {
		if len(definition.Teardown) > 0 {
			e.executeStepsWithoutPersistence(ctx, definition.Teardown, execCtx) //nolint:errcheck
		}
		return nil, err
	}
	if len(definition.Teardown) > 0 {
		if err := e.executeStepsWithoutPersistence(ctx, definition.Teardown, execCtx); err != nil {
			return nil, fmt.Errorf("child flow teardown failed: %w", err)
		}
	}

	// Collect outputs
	result := make(models.OutputData)
	for stepID, outputs := range execCtx.stepOutputs {
		result[stepID] = outputs
	}
	for k, v := range execCtx.variables {
		if _, exists := result[k]; !exists {
			result[k] = v
		}
	}
	return result, nil
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
	case "grpc_call":
		return actions.NewGRPCHandler(e.logger), nil
	case "grpc_stream":
		return actions.NewGRPCHandler(e.logger), nil
	case "browser":
		return actions.NewBrowserHandler(e.logger), nil
	case "docker_run":
		return actions.NewDockerRunHandler(e.logger), nil
	case "docker_stop":
		return actions.NewDockerStopHandler(e.logger), nil
	case "parallel":
		return actions.NewParallelHandler(e.logger, e), nil
	case "wait_until":
		return actions.NewWaitUntilHandler(e.logger), nil
	case "contract_generate":
		return actions.NewContractGenerateHandler(e.logger), nil
	case "contract_verify":
		return actions.NewContractVerifyHandler(e.logger), nil
	case "run_flow":
		return actions.NewRunFlowHandler(e.logger, e, e), nil
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

// InlineStepResult holds the result of a single step in an inline execution.
type InlineStepResult struct {
	StepID     string            `json:"step_id"`
	StepName   string            `json:"step_name,omitempty"`
	Action     string            `json:"action"`
	Phase      string            `json:"phase"`
	Status     string            `json:"status"`
	DurationMs int64             `json:"duration_ms"`
	Error      string            `json:"error,omitempty"`
	Output     models.OutputData `json:"output,omitempty"`
}

// InlineResult holds the result of an inline (non-persisted) flow execution.
type InlineResult struct {
	Status     string             `json:"status"`
	DurationMs int64              `json:"duration_ms"`
	TotalSteps int                `json:"total_steps"`
	Passed     int                `json:"passed"`
	Failed     int                `json:"failed"`
	Error      string             `json:"error,omitempty"`
	Steps      []InlineStepResult `json:"steps"`
}

// ExecuteInline runs a flow definition synchronously without persisting anything to the database.
func (e *Executor) ExecuteInline(definition *models.FlowDefinition, variables map[string]string) (*InlineResult, error) {
	ctx := context.Background()
	start := time.Now()
	env := e.resolveEnvFile(definition)
	execCtx := NewContext(variables, env)
	result := &InlineResult{Status: "passed"}

	type phase struct {
		name  string
		steps []models.Step
	}
	phases := []phase{
		{"setup", definition.Setup},
		{"main", definition.Steps},
		{"teardown", definition.Teardown},
	}

	for _, ph := range phases {
		for i, step := range ph.steps {
			stepID := step.ID
			if stepID == "" {
				stepID = fmt.Sprintf("step_%d", i+1)
			}

			// Evaluate when condition before executing the step
			if step.When != "" {
				shouldRun, evalErr := evalWhenCondition(step.When, execCtx)
				if evalErr != nil {
					e.logger.Warn("Failed to evaluate when condition, executing step anyway",
						zap.String("step_id", stepID),
						zap.String("when", step.When),
						zap.Error(evalErr),
					)
				} else if !shouldRun {
					e.logger.Debug("Skipping step: when condition evaluated to false",
						zap.String("step_id", stepID),
						zap.String("when", step.When),
					)
					continue
				}
			}

			stepStart := time.Now()
			output, err := e.executeStep(ctx, &step, execCtx)
			sr := InlineStepResult{
				StepID:     stepID,
				StepName:   step.Name,
				Action:     step.Action,
				Phase:      ph.name,
				DurationMs: time.Since(stepStart).Milliseconds(),
			}

			sr.Output = output

			if err != nil {
				sr.Status = "failed"
				sr.Error = err.Error()
				result.Failed++
				result.Steps = append(result.Steps, sr)
				if ph.name != "teardown" {
					// Handle on_error policy
					if step.OnError != nil {
						switch step.OnError.Action {
						case "continue", "retry":
							// Treat retry as continue for now (retry logic is handled by step.Retry)
							e.logger.Warn("Step failed, continuing due to on_error policy",
								zap.String("step_id", stepID),
								zap.String("on_error_action", step.OnError.Action),
								zap.Error(err),
							)
							continue
						case "fail":
							// explicit fail — fall through to return error
						default:
							// unknown action — fail safe
						}
					}
					result.Status = "failed"
					result.Error = fmt.Sprintf("[%s] step '%s' (%s): %s", ph.name, stepID, step.Action, err.Error())
					result.TotalSteps = len(result.Steps)
					result.DurationMs = time.Since(start).Milliseconds()
					return result, nil
				}
				continue
			}

			sr.Status = "passed"
			result.Passed++
			// Store outputs so subsequent steps can reference them
			for key, path := range step.Output {
				value := extractValue(output, path)
				execCtx.SetStepOutput(stepID, key, value)
				execCtx.Set(key, fmt.Sprintf("%v", value))
			}
			result.Steps = append(result.Steps, sr)
		}
	}

	result.TotalSteps = len(result.Steps)
	result.DurationMs = time.Since(start).Milliseconds()
	return result, nil
}

// evalWhenCondition evaluates a boolean expression from step.When against the current
// execution context. Returns (true, nil) when the condition is met (step should run),
// (false, nil) when the condition is not met (step should be skipped), and
// (true, err) when evaluation fails (step runs with a warning logged by the caller).
func evalWhenCondition(condition string, execCtx *Context) (bool, error) {
	if condition == "" {
		return true, nil
	}

	// Build expression environment from current context variables and step outputs
	env := make(map[string]interface{})
	for k, v := range execCtx.variables {
		env[k] = v
	}
	for stepID, outputs := range execCtx.stepOutputs {
		env[stepID] = outputs
	}

	// Try to compile and run the expression
	program, compileErr := expr.Compile(condition, expr.AsBool())
	if compileErr != nil {
		// Try without strict type enforcement (dynamic keys)
		program, compileErr = expr.Compile(condition)
		if compileErr != nil {
			return true, fmt.Errorf("failed to compile when condition %q: %w", condition, compileErr)
		}
	}

	result, runErr := expr.Run(program, env)
	if runErr != nil {
		return true, fmt.Errorf("failed to evaluate when condition %q: %w", condition, runErr)
	}

	b, ok := result.(bool)
	if !ok {
		return true, fmt.Errorf("when condition %q must evaluate to bool, got %T", condition, result)
	}
	return b, nil
}

// extractValue extracts a value from result using JSONPath
func extractValue(result models.OutputData, path string) interface{} {
	if path == "" || path == "$" {
		return result
	}

	// Try JSONPath extraction (works for HTTP steps with body)
	evaluator := assertions.NewEvaluator(result)
	value, err := evaluator.EvaluateJSONPath(path)
	if err == nil && value != nil {
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
// Strips leading "$." or "$" prefix (JSONPath root notation).
func extractDotPath(data map[string]interface{}, path string) interface{} {
	path = strings.TrimPrefix(path, "$.")
	path = strings.TrimPrefix(path, "$")
	if path == "" {
		return data
	}
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
