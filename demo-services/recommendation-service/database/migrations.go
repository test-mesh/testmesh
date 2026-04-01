package database

import (
	"recommendation-service/models"

	"gorm.io/gorm"
)

func RunMigrations(db *gorm.DB) error {
	return db.AutoMigrate(&models.RecommendationCache{})
}
