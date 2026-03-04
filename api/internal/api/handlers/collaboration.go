package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// CollaborationHandler handles collaboration-related requests
type CollaborationHandler struct {
	repo   *repository.CollaborationRepository
	logger *zap.Logger
}

// NewCollaborationHandler creates a new collaboration handler
func NewCollaborationHandler(repo *repository.CollaborationRepository, logger *zap.Logger) *CollaborationHandler {
	return &CollaborationHandler{
		repo:   repo,
		logger: logger,
	}
}

// Presence Handlers

// SetPresenceRequest represents a request to set user presence
type SetPresenceRequest struct {
	UserID       string `json:"user_id" binding:"required"`
	UserName     string `json:"user_name" binding:"required"`
	UserEmail    string `json:"user_email"`
	UserAvatar   string `json:"user_avatar"`
	ResourceType string `json:"resource_type" binding:"required"`
	ResourceID   string `json:"resource_id" binding:"required"`
	Status       string `json:"status"`
	CursorData   string `json:"cursor_data"`
}

// SetPresence handles POST /api/v1/collaboration/presence
func (h *CollaborationHandler) SetPresence(c *gin.Context) {
	var req SetPresenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	resourceID, err := uuid.Parse(req.ResourceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid resource ID"})
		return
	}

	status := req.Status
	if status == "" {
		status = "viewing"
	}

	// Get color index based on user ID
	colorIndex := int(userID[0]) % len(models.PresenceColors)

	presence := &models.UserPresence{
		UserID:       userID,
		UserName:     req.UserName,
		UserEmail:    req.UserEmail,
		UserAvatar:   req.UserAvatar,
		Color:        models.GetPresenceColor(colorIndex),
		ResourceType: req.ResourceType,
		ResourceID:   resourceID,
		Status:       status,
		CursorData:   req.CursorData,
	}

	if err := h.repo.SetPresence(presence); err != nil {
		h.logger.Error("Failed to set presence", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, presence)
}

// RemovePresence handles DELETE /api/v1/collaboration/presence
func (h *CollaborationHandler) RemovePresence(c *gin.Context) {
	userIDStr := c.Query("user_id")
	resourceType := c.Query("resource_type")
	resourceIDStr := c.Query("resource_id")

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	resourceID, err := uuid.Parse(resourceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid resource ID"})
		return
	}

	if err := h.repo.RemovePresence(userID, resourceType, resourceID); err != nil {
		h.logger.Error("Failed to remove presence", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Presence removed"})
}

// GetPresence handles GET /api/v1/collaboration/presence/:resource_type/:resource_id
func (h *CollaborationHandler) GetPresence(c *gin.Context) {
	resourceType := c.Param("resource_type")
	resourceIDStr := c.Param("resource_id")

	resourceID, err := uuid.Parse(resourceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid resource ID"})
		return
	}

	presences, err := h.repo.GetPresenceForResource(resourceType, resourceID)
	if err != nil {
		h.logger.Error("Failed to get presence", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"presences": presences,
		"count":     len(presences),
	})
}

// Comment Handlers

// CreateCommentRequest represents a request to create a comment
type CreateCommentRequest struct {
	FlowID       string                 `json:"flow_id" binding:"required"`
	StepID       string                 `json:"step_id"`
	ParentID     string                 `json:"parent_id"`
	AuthorID     string                 `json:"author_id" binding:"required"`
	AuthorName   string                 `json:"author_name" binding:"required"`
	AuthorAvatar string                 `json:"author_avatar"`
	Content      string                 `json:"content" binding:"required"`
	Position     map[string]interface{} `json:"position"`
}

// CreateComment handles POST /api/v1/collaboration/comments
func (h *CollaborationHandler) CreateComment(c *gin.Context) {
	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	flowID, err := uuid.Parse(req.FlowID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	authorID, err := uuid.Parse(req.AuthorID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid author ID"})
		return
	}

	comment := &models.FlowComment{
		FlowID:       flowID,
		StepID:       req.StepID,
		AuthorID:     authorID,
		AuthorName:   req.AuthorName,
		AuthorAvatar: req.AuthorAvatar,
		Content:      req.Content,
		Position:     req.Position,
	}

	if req.ParentID != "" {
		parentID, err := uuid.Parse(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent ID"})
			return
		}
		comment.ParentID = &parentID
	}

	if err := h.repo.CreateComment(comment); err != nil {
		h.logger.Error("Failed to create comment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// GetComment handles GET /api/v1/collaboration/comments/:id
func (h *CollaborationHandler) GetComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.repo.GetComment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	c.JSON(http.StatusOK, comment)
}

// UpdateCommentRequest represents a request to update a comment
type UpdateCommentRequest struct {
	Content string `json:"content" binding:"required"`
}

// UpdateComment handles PUT /api/v1/collaboration/comments/:id
func (h *CollaborationHandler) UpdateComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.repo.GetComment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	var req UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	comment.Content = req.Content
	if err := h.repo.UpdateComment(comment); err != nil {
		h.logger.Error("Failed to update comment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, comment)
}

// DeleteComment handles DELETE /api/v1/collaboration/comments/:id
func (h *CollaborationHandler) DeleteComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	if err := h.repo.DeleteComment(id); err != nil {
		h.logger.Error("Failed to delete comment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
}

// ListFlowComments handles GET /api/v1/collaboration/flows/:flow_id/comments
func (h *CollaborationHandler) ListFlowComments(c *gin.Context) {
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	includeResolved := c.Query("include_resolved") == "true"

	comments, err := h.repo.ListCommentsForFlow(flowID, includeResolved)
	if err != nil {
		h.logger.Error("Failed to list comments", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"count":    len(comments),
	})
}

// ResolveComment handles POST /api/v1/collaboration/comments/:id/resolve
func (h *CollaborationHandler) ResolveComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	if err := h.repo.ResolveComment(id); err != nil {
		h.logger.Error("Failed to resolve comment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment resolved"})
}

// UnresolveComment handles POST /api/v1/collaboration/comments/:id/unresolve
func (h *CollaborationHandler) UnresolveComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	if err := h.repo.UnresolveComment(id); err != nil {
		h.logger.Error("Failed to unresolve comment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment unresolved"})
}

// Activity Feed Handlers

// ListActivity handles GET /api/v1/collaboration/activity
func (h *CollaborationHandler) ListActivity(c *gin.Context) {
	params := repository.ActivityEventParams{}

	if workspaceIDStr := c.Query("workspace_id"); workspaceIDStr != "" {
		if id, err := uuid.Parse(workspaceIDStr); err == nil {
			params.WorkspaceID = id
		}
	}
	if resourceType := c.Query("resource_type"); resourceType != "" {
		params.ResourceType = resourceType
	}
	if resourceIDStr := c.Query("resource_id"); resourceIDStr != "" {
		if id, err := uuid.Parse(resourceIDStr); err == nil {
			params.ResourceID = id
		}
	}
	if actorIDStr := c.Query("actor_id"); actorIDStr != "" {
		if id, err := uuid.Parse(actorIDStr); err == nil {
			params.ActorID = id
		}
	}
	if eventType := c.Query("event_type"); eventType != "" {
		params.EventType = eventType
	}
	if sinceStr := c.Query("since"); sinceStr != "" {
		if since, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			params.Since = since
		}
	}
	if limit, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil {
		params.Limit = limit
	}
	if offset, err := strconv.Atoi(c.DefaultQuery("offset", "0")); err == nil {
		params.Offset = offset
	}

	events, total, err := h.repo.ListActivityEvents(params)
	if err != nil {
		h.logger.Error("Failed to list activity", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  total,
	})
}

// Flow Version Handlers

// ListFlowVersions handles GET /api/v1/collaboration/flows/:flow_id/versions
func (h *CollaborationHandler) ListFlowVersions(c *gin.Context) {
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	limit := 20
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	versions, err := h.repo.ListFlowVersions(flowID, limit)
	if err != nil {
		h.logger.Error("Failed to list versions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"versions": versions,
		"count":    len(versions),
	})
}

// GetFlowVersion handles GET /api/v1/collaboration/flows/:flow_id/versions/:version
func (h *CollaborationHandler) GetFlowVersion(c *gin.Context) {
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	version, err := strconv.Atoi(c.Param("version"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version"})
		return
	}

	v, err := h.repo.GetFlowVersion(flowID, version)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version not found"})
		return
	}

	c.JSON(http.StatusOK, v)
}

// CompareVersions handles GET /api/v1/collaboration/flows/:flow_id/versions/compare
func (h *CollaborationHandler) CompareVersions(c *gin.Context) {
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	v1, err := strconv.Atoi(c.Query("v1"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid v1 parameter"})
		return
	}

	v2, err := strconv.Atoi(c.Query("v2"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid v2 parameter"})
		return
	}

	ver1, ver2, err := h.repo.CompareFlowVersions(flowID, v1, v2)
	if err != nil {
		h.logger.Error("Failed to compare versions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"version1": ver1,
		"version2": ver2,
	})
}
