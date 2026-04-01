package models

import "time"

// RecommendationCache stores computed recommendations with a TTL.
type RecommendationCache struct {
	ID          string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      string    `gorm:"not null;index" json:"user_id"`
	ProductIDs  string    `gorm:"not null" json:"product_ids"` // JSON-encoded []string
	GeneratedAt time.Time `gorm:"autoCreateTime" json:"generated_at"`
	ExpiresAt   time.Time `gorm:"not null" json:"expires_at"`
}

func (RecommendationCache) TableName() string {
	return "recommendation_service.recommendation_cache"
}
