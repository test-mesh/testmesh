package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AIRepository handles AI-related database operations
type AIRepository struct {
	db *gorm.DB
}

// NewAIRepository creates a new AI repository
func NewAIRepository(db *gorm.DB) *AIRepository {
	return &AIRepository{db: db}
}

// ListGenerationHistory retrieves generation history with optional filters
func (r *AIRepository) ListGenerationHistory(status models.GenerationStatus, provider models.AIProviderType, limit, offset int) ([]models.GenerationHistory, int64, error) {
	var history []models.GenerationHistory
	var total int64

	query := r.db.Model(&models.GenerationHistory{})

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if provider != "" {
		query = query.Where("provider = ?", provider)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Preload("Flow").Order("created_at DESC").Limit(limit).Offset(offset).Find(&history).Error; err != nil {
		return nil, 0, err
	}

	return history, total, nil
}

// GetGenerationHistoryByID retrieves a specific generation history record
func (r *AIRepository) GetGenerationHistoryByID(id uuid.UUID) (*models.GenerationHistory, error) {
	var history models.GenerationHistory
	if err := r.db.Preload("Flow").First(&history, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &history, nil
}

// ListImportHistory retrieves import history with optional filters
func (r *AIRepository) ListImportHistory(sourceType models.ImportSourceType, status models.ImportStatus, limit, offset int) ([]models.ImportHistory, int64, error) {
	var history []models.ImportHistory
	var total int64

	query := r.db.Model(&models.ImportHistory{})

	if sourceType != "" {
		query = query.Where("source_type = ?", sourceType)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&history).Error; err != nil {
		return nil, 0, err
	}

	return history, total, nil
}

// GetImportHistoryByID retrieves a specific import history record
func (r *AIRepository) GetImportHistoryByID(id uuid.UUID) (*models.ImportHistory, error) {
	var history models.ImportHistory
	if err := r.db.First(&history, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &history, nil
}

// ListCoverageAnalyses retrieves coverage analyses with optional filters
func (r *AIRepository) ListCoverageAnalyses(status models.CoverageStatus, limit, offset int) ([]models.CoverageAnalysis, int64, error) {
	var analyses []models.CoverageAnalysis
	var total int64

	query := r.db.Model(&models.CoverageAnalysis{})

	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&analyses).Error; err != nil {
		return nil, 0, err
	}

	return analyses, total, nil
}

// GetCoverageAnalysisByID retrieves a specific coverage analysis record
func (r *AIRepository) GetCoverageAnalysisByID(id uuid.UUID) (*models.CoverageAnalysis, error) {
	var analysis models.CoverageAnalysis
	if err := r.db.First(&analysis, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &analysis, nil
}

// DeleteSuggestion deletes a suggestion by ID
func (r *AIRepository) DeleteSuggestion(id uuid.UUID) error {
	return r.db.Delete(&models.Suggestion{}, "id = ?", id).Error
}

// GetSuggestionByID retrieves a suggestion by ID
func (r *AIRepository) GetSuggestionByID(id uuid.UUID) (*models.Suggestion, error) {
	var suggestion models.Suggestion
	if err := r.db.Preload("Flow").Preload("Execution").First(&suggestion, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &suggestion, nil
}
