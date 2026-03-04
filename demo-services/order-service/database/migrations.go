package database

import (
	"order-service/models"

	"gorm.io/gorm"
)

func RunMigrations(db *gorm.DB) error {
	return db.AutoMigrate(&models.Order{}, &models.OrderItem{})
}
