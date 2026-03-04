package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ExecutionRepository handles execution database operations
type ExecutionRepository struct {
	db *gorm.DB
}

// NewExecutionRepository creates a new execution repository
func NewExecutionRepository(db *gorm.DB) *ExecutionRepository {
	return &ExecutionRepository{db: db}
}

// Create creates a new execution
func (r *ExecutionRepository) Create(execution *models.Execution) error {
	return r.db.Create(execution).Error
}

// GetByID retrieves an execution by ID with flow details
func (r *ExecutionRepository) GetByID(id uuid.UUID) (*models.Execution, error) {
	var execution models.Execution
	if err := r.db.Preload("Flow").First(&execution, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &execution, nil
}

// List retrieves executions with optional filters
func (r *ExecutionRepository) List(flowID *uuid.UUID, status models.ExecutionStatus, limit, offset int) ([]models.Execution, int64, error) {
	var executions []models.Execution
	var total int64

	query := r.db.Model(&models.Execution{}).Preload("Flow")

	// Apply filters
	if flowID != nil {
		query = query.Where("flow_id = ?", *flowID)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Limit(limit).Offset(offset).Order("created_at DESC").Find(&executions).Error; err != nil {
		return nil, 0, err
	}

	return executions, total, nil
}

// Update updates an execution
func (r *ExecutionRepository) Update(execution *models.Execution) error {
	return r.db.Save(execution).Error
}

// CreateStep creates a new execution step
func (r *ExecutionRepository) CreateStep(step *models.ExecutionStep) error {
	return r.db.Create(step).Error
}

// GetSteps retrieves all steps for an execution
func (r *ExecutionRepository) GetSteps(executionID uuid.UUID) ([]models.ExecutionStep, error) {
	var steps []models.ExecutionStep
	if err := r.db.Where("execution_id = ?", executionID).Order("created_at ASC").Find(&steps).Error; err != nil {
		return nil, err
	}
	return steps, nil
}

// UpdateStep updates an execution step
func (r *ExecutionRepository) UpdateStep(step *models.ExecutionStep) error {
	return r.db.Save(step).Error
}

// GetStepByID retrieves a specific execution step by ID
func (r *ExecutionRepository) GetStepByID(id uuid.UUID) (*models.ExecutionStep, error) {
	var step models.ExecutionStep
	if err := r.db.First(&step, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &step, nil
}
