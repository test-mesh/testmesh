package handlers

import (
	"net/http"
	"notification-service/models"
	redisclient "notification-service/redis"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type NotificationHandler struct {
	db          *gorm.DB
	redisClient *redisclient.Client
}

func NewNotificationHandler(db *gorm.DB, redisClient *redisclient.Client) *NotificationHandler {
	return &NotificationHandler{
		db:          db,
		redisClient: redisClient,
	}
}

func (h *NotificationHandler) GetNotifications(c *gin.Context) {
	userID := c.Param("user_id")

	var notifications []models.Notification

	if err := h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get notifications"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"count":         len(notifications),
	})
}

func (h *NotificationHandler) GetUnreadNotifications(c *gin.Context) {
	userID := c.Param("user_id")

	var notifications []models.Notification

	if err := h.db.Where("user_id = ? AND read = ?", userID, false).
		Order("created_at DESC").
		Limit(50).
		Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get notifications"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"count":         len(notifications),
	})
}
