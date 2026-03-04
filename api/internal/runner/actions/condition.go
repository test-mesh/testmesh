package actions

import (
	"context"
	"fmt"

	"github.com/expr-lang/expr"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ConditionHandler handles conditional (if/else) logic
type ConditionHandler struct {
	logger   *zap.Logger
	executor StepExecutor
}

// StepExecutor interface for executing nested steps
type StepExecutor interface {
	ExecuteStep(ctx context.Context, step *models.Step, execCtx interface{}) (models.OutputData, error)
}

// NewConditionHandler creates a new condition handler
func NewConditionHandler(logger *zap.Logger, executor StepExecutor) *ConditionHandler {
	return &ConditionHandler{
		logger:   logger,
		executor: executor,
	}
}

// Execute evaluates a condition and executes appropriate branch
func (h *ConditionHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Get condition expression
	conditionStr, ok := config["condition"].(string)
	if !ok {
		return nil, fmt.Errorf("condition is required and must be a string expression")
	}

	// Get environment/context for evaluation
	env := config["_context"]
	if env == nil {
		env = make(map[string]interface{})
	}

	// Evaluate condition
	program, err := expr.Compile(conditionStr, expr.Env(env))
	if err != nil {
		return nil, fmt.Errorf("failed to compile condition: %w", err)
	}

	output, err := expr.Run(program, env)
	if err != nil {
		return nil, fmt.Errorf("failed to evaluate condition: %w", err)
	}

	conditionResult, ok := output.(bool)
	if !ok {
		return nil, fmt.Errorf("condition must evaluate to boolean, got %T", output)
	}

	h.logger.Info("Condition evaluated", zap.Bool("result", conditionResult))

	// For now, return the condition result
	// In full implementation, this would execute nested steps based on the condition
	return models.OutputData{
		"condition": conditionStr,
		"result":    conditionResult,
		"evaluated": true,
	}, nil
}
