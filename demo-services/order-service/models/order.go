package models

import (
	"time"
)

type Order struct {
	ID        string      `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID    string      `gorm:"not null;index" json:"user_id"`
	Items     []OrderItem `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"items"`
	Total     float64     `gorm:"not null" json:"total"`
	Status    string      `gorm:"not null;default:'pending'" json:"status"`
	CreatedAt time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time   `gorm:"autoUpdateTime" json:"updated_at"`
}

type OrderItem struct {
	ID        string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	OrderID   string    `gorm:"not null;index" json:"order_id"`
	ProductID string    `gorm:"not null" json:"product_id"`
	Quantity  int       `gorm:"not null" json:"quantity"`
	Price     float64   `gorm:"not null" json:"price"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Order) TableName() string {
	return "order_service.orders"
}

func (OrderItem) TableName() string {
	return "order_service.order_items"
}
