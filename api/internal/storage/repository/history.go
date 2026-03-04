package repository

import (
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// HistoryRepository handles request history database operations
type HistoryRepository struct {
	db *gorm.DB
}

// NewHistoryRepository creates a new history repository
func NewHistoryRepository(db *gorm.DB) *HistoryRepository {
	return &HistoryRepository{db: db}
}

// Create creates a new history entry
func (r *HistoryRepository) Create(history *models.RequestHistory) error {
	return r.db.Create(history).Error
}

// GetByID retrieves a history entry by ID
func (r *HistoryRepository) GetByID(id uuid.UUID) (*models.RequestHistory, error) {
	var history models.RequestHistory
	if err := r.db.First(&history, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &history, nil
}

// List retrieves history entries with optional filters
func (r *HistoryRepository) List(filter *models.HistoryFilter, limit, offset int) ([]models.RequestHistory, int64, error) {
	var histories []models.RequestHistory
	var total int64

	query := r.db.Model(&models.RequestHistory{})

	// Apply filters
	if filter != nil {
		if filter.Method != "" {
			query = query.Where("method = ?", filter.Method)
		}
		if filter.URL != "" {
			query = query.Where("url ILIKE ?", "%"+filter.URL+"%")
		}
		if filter.StatusCode != nil {
			query = query.Where("status_code = ?", *filter.StatusCode)
		}
		if filter.FlowID != nil {
			query = query.Where("flow_id = ?", *filter.FlowID)
		}
		if filter.CollectionID != nil {
			query = query.Where("collection_id = ?", *filter.CollectionID)
		}
		if filter.SavedOnly {
			query = query.Where("saved_at IS NOT NULL")
		}
		if filter.StartDate != nil {
			query = query.Where("created_at >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("created_at <= ?", *filter.EndDate)
		}
		if len(filter.Tags) > 0 {
			query = query.Where("tags && ?", filter.Tags)
		}
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Limit(limit).Offset(offset).Order("created_at DESC").Find(&histories).Error; err != nil {
		return nil, 0, err
	}

	return histories, total, nil
}

// ListRecent retrieves the most recent history entries
func (r *HistoryRepository) ListRecent(limit int) ([]models.RequestHistory, error) {
	var histories []models.RequestHistory
	if err := r.db.Order("created_at DESC").Limit(limit).Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}

// ListByURL retrieves history entries for a specific URL pattern
func (r *HistoryRepository) ListByURL(urlPattern string, limit int) ([]models.RequestHistory, error) {
	var histories []models.RequestHistory
	if err := r.db.Where("url ILIKE ?", "%"+urlPattern+"%").Order("created_at DESC").Limit(limit).Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}

// Update updates a history entry
func (r *HistoryRepository) Update(history *models.RequestHistory) error {
	return r.db.Save(history).Error
}

// Save marks a history entry as saved
func (r *HistoryRepository) Save(id uuid.UUID) error {
	now := time.Now()
	return r.db.Model(&models.RequestHistory{}).Where("id = ?", id).Update("saved_at", now).Error
}

// Unsave removes the saved flag from a history entry
func (r *HistoryRepository) Unsave(id uuid.UUID) error {
	return r.db.Model(&models.RequestHistory{}).Where("id = ?", id).Update("saved_at", nil).Error
}

// Delete deletes a history entry
func (r *HistoryRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.RequestHistory{}, "id = ?", id).Error
}

// DeleteOld deletes history entries older than the specified time
func (r *HistoryRepository) DeleteOld(before time.Time, keepSaved bool) (int64, error) {
	query := r.db.Where("created_at < ?", before)
	if keepSaved {
		query = query.Where("saved_at IS NULL")
	}

	result := query.Delete(&models.RequestHistory{})
	return result.RowsAffected, result.Error
}

// DeleteByFlowID deletes all history entries for a flow
func (r *HistoryRepository) DeleteByFlowID(flowID uuid.UUID) error {
	return r.db.Where("flow_id = ?", flowID).Delete(&models.RequestHistory{}).Error
}

// DeleteByCollectionID deletes all history entries for a collection
func (r *HistoryRepository) DeleteByCollectionID(collectionID uuid.UUID) error {
	return r.db.Where("collection_id = ?", collectionID).Delete(&models.RequestHistory{}).Error
}

// ClearAll deletes all non-saved history entries
func (r *HistoryRepository) ClearAll(keepSaved bool) (int64, error) {
	query := r.db.Model(&models.RequestHistory{})
	if keepSaved {
		query = query.Where("saved_at IS NULL")
	}

	result := query.Delete(&models.RequestHistory{})
	return result.RowsAffected, result.Error
}

// GetStats retrieves statistics about request history
func (r *HistoryRepository) GetStats() (*HistoryStats, error) {
	var stats HistoryStats

	// Total count
	if err := r.db.Model(&models.RequestHistory{}).Count(&stats.TotalRequests).Error; err != nil {
		return nil, err
	}

	// Saved count
	if err := r.db.Model(&models.RequestHistory{}).Where("saved_at IS NOT NULL").Count(&stats.SavedRequests).Error; err != nil {
		return nil, err
	}

	// Today's count
	today := time.Now().Truncate(24 * time.Hour)
	if err := r.db.Model(&models.RequestHistory{}).Where("created_at >= ?", today).Count(&stats.TodayRequests).Error; err != nil {
		return nil, err
	}

	// Method distribution
	type methodCount struct {
		Method string
		Count  int64
	}
	var methodCounts []methodCount
	if err := r.db.Model(&models.RequestHistory{}).
		Select("method, count(*) as count").
		Group("method").
		Scan(&methodCounts).Error; err != nil {
		return nil, err
	}
	stats.MethodDistribution = make(map[string]int64)
	for _, mc := range methodCounts {
		stats.MethodDistribution[mc.Method] = mc.Count
	}

	return &stats, nil
}

// HistoryStats holds statistics about request history
type HistoryStats struct {
	TotalRequests      int64            `json:"total_requests"`
	SavedRequests      int64            `json:"saved_requests"`
	TodayRequests      int64            `json:"today_requests"`
	MethodDistribution map[string]int64 `json:"method_distribution"`
}

// AddTag adds a tag to a history entry
func (r *HistoryRepository) AddTag(id uuid.UUID, tag string) error {
	return r.db.Model(&models.RequestHistory{}).
		Where("id = ?", id).
		Update("tags", gorm.Expr("array_append(tags, ?)", tag)).Error
}

// RemoveTag removes a tag from a history entry
func (r *HistoryRepository) RemoveTag(id uuid.UUID, tag string) error {
	return r.db.Model(&models.RequestHistory{}).
		Where("id = ?", id).
		Update("tags", gorm.Expr("array_remove(tags, ?)", tag)).Error
}
