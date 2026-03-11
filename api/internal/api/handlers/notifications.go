package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// NotificationHandler handles notification API requests
type NotificationHandler struct {
	repo   *repository.NotificationRepository
	logger *zap.Logger
}

// NewNotificationHandler creates a new notification handler
func NewNotificationHandler(repo *repository.NotificationRepository, logger *zap.Logger) *NotificationHandler {
	return &NotificationHandler{repo: repo, logger: logger}
}

// List handles GET /workspaces/:workspace_id/notifications
func (h *NotificationHandler) List(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	notifications, err := h.repo.List(workspaceID, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list notifications", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list notifications"})
		return
	}

	unreadCount, err := h.repo.CountUnread(workspaceID)
	if err != nil {
		h.logger.Warn("Failed to count unread notifications", zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"unread_count":  unreadCount,
	})
}

// MarkRead handles PATCH /workspaces/:workspace_id/notifications/:id/read
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	if err := h.repo.MarkRead(id, workspaceID); err != nil {
		h.logger.Error("Failed to mark notification as read", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark as read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Marked as read"})
}

// MarkAllRead handles PATCH /workspaces/:workspace_id/notifications/read-all
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	if err := h.repo.MarkAllRead(workspaceID); err != nil {
		h.logger.Error("Failed to mark all notifications as read", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark all as read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All notifications marked as read"})
}

// Delete handles DELETE /workspaces/:workspace_id/notifications/:id
func (h *NotificationHandler) Delete(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	if err := h.repo.Delete(id, workspaceID); err != nil {
		h.logger.Error("Failed to delete notification", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete notification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification deleted"})
}
