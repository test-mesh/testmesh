package actions

import (
	"context"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

// Handler defines the interface for action handlers
type Handler interface {
	Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error)
}
