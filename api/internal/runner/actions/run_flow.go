package actions

import (
	"context"
	"fmt"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// activeFlowsKey is the context key used to track the chain of active flow IDs,
// preventing circular flow references.
type activeFlowsKeyType struct{}

var activeFlowsKey = activeFlowsKeyType{}

// FlowLoader can retrieve a flow definition by name or UUID string.
type FlowLoader interface {
	// LoadFlow returns a flow by name or UUID. It may return nil if not found.
	LoadFlow(ctx context.Context, nameOrID string) (*models.Flow, error)
}

// ChildFlowRunner can execute a flow's steps in a child context and return output vars.
type ChildFlowRunner interface {
	RunFlowSteps(ctx context.Context, definition *models.FlowDefinition, vars map[string]string) (models.OutputData, error)
}

// RunFlowHandler handles the run_flow action, which executes another flow as a sub-flow.
type RunFlowHandler struct {
	logger *zap.Logger
	loader FlowLoader
	runner ChildFlowRunner
}

// NewRunFlowHandler creates a new run_flow handler.
func NewRunFlowHandler(logger *zap.Logger, loader FlowLoader, runner ChildFlowRunner) *RunFlowHandler {
	return &RunFlowHandler{
		logger: logger,
		loader: loader,
		runner: runner,
	}
}

// Execute loads and executes a child flow, merging input variables and optionally
// inheriting the parent flow's environment.
func (h *RunFlowHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Required: flow name or UUID
	flowRef, ok := config["flow"].(string)
	if !ok || strings.TrimSpace(flowRef) == "" {
		return nil, fmt.Errorf("run_flow: 'flow' is required and must be a non-empty string (name or UUID)")
	}

	// Optional: input vars to pass to the child flow
	inputVars := make(map[string]string)
	if inputRaw, ok := config["input"]; ok {
		switch iv := inputRaw.(type) {
		case map[string]interface{}:
			for k, v := range iv {
				inputVars[k] = fmt.Sprintf("%v", v)
			}
		case map[string]string:
			for k, v := range iv {
				inputVars[k] = v
			}
		}
	}

	// Optional: inherit_env (default: true) — copy parent context vars into child
	inheritEnv := true
	if v, ok := config["inherit_env"]; ok {
		if b, ok := v.(bool); ok {
			inheritEnv = b
		}
	}

	// Inherit parent vars if requested
	if inheritEnv {
		if parentVars, ok := config["_vars"].(map[string]string); ok {
			for k, v := range parentVars {
				if _, already := inputVars[k]; !already {
					inputVars[k] = v
				}
			}
		}
	}

	// Circular-reference detection: read active flow chain from context
	activeFlows := map[string]bool{}
	if existing, ok := ctx.Value(activeFlowsKey).(map[string]bool); ok {
		for k, v := range existing {
			activeFlows[k] = v
		}
	}
	if activeFlows[flowRef] {
		return nil, fmt.Errorf("run_flow: circular reference detected — flow %q is already executing in the current call chain", flowRef)
	}

	h.logger.Info("run_flow: loading child flow",
		zap.String("flow", flowRef),
		zap.Bool("inherit_env", inheritEnv),
	)

	// Load the child flow
	if h.loader == nil {
		return nil, fmt.Errorf("run_flow: no FlowLoader configured — cannot load flow %q", flowRef)
	}
	flow, err := h.loader.LoadFlow(ctx, flowRef)
	if err != nil {
		return nil, fmt.Errorf("run_flow: failed to load flow %q: %w", flowRef, err)
	}
	if flow == nil {
		return nil, fmt.Errorf("run_flow: flow %q not found", flowRef)
	}

	// Also track by actual UUID and name to catch aliases (e.g. A refs B by name, B refs A by UUID)
	actualID := flow.ID.String()
	if activeFlows[actualID] || activeFlows[flow.Name] {
		return nil, fmt.Errorf("run_flow: circular reference detected — flow %q (id=%s) is already executing", flowRef, actualID)
	}
	activeFlows[flowRef] = true
	activeFlows[flow.Name] = true
	activeFlows[actualID] = true
	ctx = context.WithValue(ctx, activeFlowsKey, activeFlows)

	h.logger.Info("run_flow: executing child flow",
		zap.String("flow_id", actualID),
		zap.String("flow_name", flow.Name),
		zap.Int("steps", len(flow.Definition.Steps)),
	)

	if h.runner == nil {
		return nil, fmt.Errorf("run_flow: no ChildFlowRunner configured")
	}

	output, err := h.runner.RunFlowSteps(ctx, &flow.Definition, inputVars)
	if err != nil {
		return models.OutputData{
			"flow":   flowRef,
			"status": "failed",
			"error":  err.Error(),
		}, fmt.Errorf("run_flow: child flow %q failed: %w", flowRef, err)
	}

	h.logger.Info("run_flow: child flow completed",
		zap.String("flow", flowRef),
	)

	result := models.OutputData{
		"flow":   flowRef,
		"status": "completed",
	}
	// Merge child output into result so callers can reference child step outputs
	for k, v := range output {
		result[k] = v
	}
	return result, nil
}
