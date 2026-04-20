package telemetry

import (
	"context"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ExecutionLinker stub — replaced in Task 8
type ExecutionLinker struct{ logger *zap.Logger }

func NewExecutionLinker(repo *TelemetryRepository, execRepo interface{}, providers interface{}, logger *zap.Logger) *ExecutionLinker {
	return &ExecutionLinker{logger: logger}
}

func (e *ExecutionLinker) LinkTrace(ctx context.Context, wsID uuid.UUID, traceID string) error {
	return nil
}
