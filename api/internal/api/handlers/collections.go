package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// CollectionHandler handles collection-related requests
type CollectionHandler struct {
	repo     *repository.CollectionRepository
	flowRepo *repository.FlowRepository
	logger   *zap.Logger
}

// NewCollectionHandler creates a new collection handler
func NewCollectionHandler(repo *repository.CollectionRepository, flowRepo *repository.FlowRepository, logger *zap.Logger) *CollectionHandler {
	return &CollectionHandler{
		repo:     repo,
		flowRepo: flowRepo,
		logger:   logger,
	}
}

// CreateCollectionRequest represents a request to create a collection
type CreateCollectionRequest struct {
	Name        string                     `json:"name" binding:"required"`
	Description string                     `json:"description"`
	Icon        string                     `json:"icon"`
	Color       string                     `json:"color"`
	ParentID    *uuid.UUID                 `json:"parent_id"`
	Variables   models.CollectionVariables `json:"variables"`
	Auth        models.CollectionAuth      `json:"auth"`
}

// UpdateCollectionRequest represents a request to update a collection
type UpdateCollectionRequest struct {
	Name        *string                     `json:"name"`
	Description *string                     `json:"description"`
	Icon        *string                     `json:"icon"`
	Color       *string                     `json:"color"`
	Variables   *models.CollectionVariables `json:"variables"`
	Auth        *models.CollectionAuth      `json:"auth"`
}

// MoveCollectionRequest represents a request to move a collection
type MoveCollectionRequest struct {
	ParentID  *uuid.UUID `json:"parent_id"`
	SortOrder *int       `json:"sort_order"`
}

// AddFlowRequest represents a request to add a flow to a collection
type AddFlowRequest struct {
	FlowID    uuid.UUID `json:"flow_id" binding:"required"`
	SortOrder *int      `json:"sort_order"`
}

// ReorderRequest represents a request to reorder items
type ReorderRequest struct {
	Items []struct {
		ID        uuid.UUID `json:"id"`
		SortOrder int       `json:"sort_order"`
	} `json:"items" binding:"required"`
}

// Create handles POST /api/v1/workspaces/:workspace_id/collections
func (h *CollectionHandler) Create(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req CreateCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify parent belongs to same workspace if provided
	if req.ParentID != nil {
		_, err := h.repo.GetByID(*req.ParentID, workspaceID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "parent collection not found in this workspace"})
			return
		}
	}

	collection := &models.Collection{
		Name:        req.Name,
		Description: req.Description,
		Icon:        req.Icon,
		Color:       req.Color,
		ParentID:    req.ParentID,
		Variables:   req.Variables,
		Auth:        req.Auth,
	}

	if err := h.repo.Create(collection, workspaceID); err != nil {
		h.logger.Error("Failed to create collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create collection"})
		return
	}

	c.JSON(http.StatusCreated, collection)
}

// List handles GET /api/v1/workspaces/:workspace_id/collections
func (h *CollectionHandler) List(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	limit := 50
	offset := 0
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil && v >= 0 {
		offset = v
	}

	collections, total, err := h.repo.List(workspaceID, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list collections", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list collections"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"collections": collections,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}

// GetTree handles GET /api/v1/workspaces/:workspace_id/collections/tree
func (h *CollectionHandler) GetTree(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	tree, err := h.repo.GetTree(workspaceID)
	if err != nil {
		h.logger.Error("Failed to get collection tree", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get collection tree"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tree": tree})
}

// Get handles GET /api/v1/workspaces/:workspace_id/collections/:id
func (h *CollectionHandler) Get(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	collection, err := h.repo.GetByIDWithFlows(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// GetChildren handles GET /api/v1/workspaces/:workspace_id/collections/:id/children
func (h *CollectionHandler) GetChildren(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	children, err := h.repo.ListChildren(id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to get collection children", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get collection children"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"children": children})
}

// GetFlows handles GET /api/v1/workspaces/:workspace_id/collections/:id/flows
func (h *CollectionHandler) GetFlows(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	flows, err := h.repo.GetFlows(id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to get collection flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get collection flows"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"flows": flows})
}

// GetAncestors handles GET /api/v1/workspaces/:workspace_id/collections/:id/ancestors
func (h *CollectionHandler) GetAncestors(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	ancestors, err := h.repo.GetAncestors(id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to get collection ancestors", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get collection ancestors"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ancestors": ancestors})
}

// Update handles PUT /api/v1/workspaces/:workspace_id/collections/:id
func (h *CollectionHandler) Update(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	collection, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	var req UpdateCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if req.Name != nil {
		collection.Name = *req.Name
	}
	if req.Description != nil {
		collection.Description = *req.Description
	}
	if req.Icon != nil {
		collection.Icon = *req.Icon
	}
	if req.Color != nil {
		collection.Color = *req.Color
	}
	if req.Variables != nil {
		collection.Variables = *req.Variables
	}
	if req.Auth != nil {
		collection.Auth = *req.Auth
	}

	if err := h.repo.Update(collection, workspaceID); err != nil {
		h.logger.Error("Failed to update collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update collection"})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// Delete handles DELETE /api/v1/workspaces/:workspace_id/collections/:id
func (h *CollectionHandler) Delete(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	// Check if collection has children
	children, err := h.repo.ListChildren(id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to check collection children", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check collection"})
		return
	}

	if len(children) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete collection with children"})
		return
	}

	// Remove collection assignment from flows
	flows, _ := h.repo.GetFlows(id, workspaceID)
	for _, flow := range flows {
		h.repo.RemoveFlow(flow.ID, workspaceID)
	}

	if err := h.repo.Delete(id, workspaceID); err != nil {
		h.logger.Error("Failed to delete collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete collection"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// Move handles POST /api/v1/workspaces/:workspace_id/collections/:id/move
func (h *CollectionHandler) Move(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	var req MoveCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Prevent moving collection into itself
	if req.ParentID != nil && *req.ParentID == id {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot move collection into itself"})
		return
	}

	// Prevent circular reference
	if req.ParentID != nil {
		ancestors, _ := h.repo.GetAncestors(*req.ParentID, workspaceID)
		for _, a := range ancestors {
			if a.ID == id {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cannot create circular reference"})
				return
			}
		}
	}

	if err := h.repo.Move(id, req.ParentID, workspaceID); err != nil {
		h.logger.Error("Failed to move collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to move collection"})
		return
	}

	if req.SortOrder != nil {
		h.repo.Reorder(id, *req.SortOrder, workspaceID)
	}

	collection, _ := h.repo.GetByID(id, workspaceID)
	c.JSON(http.StatusOK, collection)
}

// Duplicate handles POST /api/v1/workspaces/:workspace_id/collections/:id/duplicate
func (h *CollectionHandler) Duplicate(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	duplicate, err := h.repo.Duplicate(id, req.Name, workspaceID)
	if err != nil {
		h.logger.Error("Failed to duplicate collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to duplicate collection"})
		return
	}

	c.JSON(http.StatusCreated, duplicate)
}

// AddFlow handles POST /api/v1/workspaces/:workspace_id/collections/:id/flows
func (h *CollectionHandler) AddFlow(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	var req AddFlowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify collection exists in workspace
	if _, err := h.repo.GetByID(id, workspaceID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	// Verify flow exists in workspace
	if _, err := h.flowRepo.GetByID(req.FlowID, workspaceID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "flow not found"})
		return
	}

	if err := h.repo.AddFlow(id, req.FlowID, workspaceID); err != nil {
		h.logger.Error("Failed to add flow to collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add flow to collection"})
		return
	}

	if req.SortOrder != nil {
		h.repo.ReorderFlow(req.FlowID, *req.SortOrder, workspaceID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "flow added to collection"})
}

// RemoveFlow handles DELETE /api/v1/workspaces/:workspace_id/collections/:id/flows/:flow_id
func (h *CollectionHandler) RemoveFlow(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow ID"})
		return
	}

	if err := h.repo.RemoveFlow(flowID, workspaceID); err != nil {
		h.logger.Error("Failed to remove flow from collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove flow from collection"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// Reorder handles POST /api/v1/workspaces/:workspace_id/collections/:id/reorder
func (h *CollectionHandler) Reorder(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid collection ID"})
		return
	}

	var req ReorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify collection exists
	if _, err := h.repo.GetByID(id, workspaceID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "collection not found"})
		return
	}

	for _, item := range req.Items {
		// Try to reorder as collection first, then as flow
		if err := h.repo.Reorder(item.ID, item.SortOrder, workspaceID); err != nil {
			h.repo.ReorderFlow(item.ID, item.SortOrder, workspaceID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "items reordered"})
}

// Search handles GET /api/v1/workspaces/:workspace_id/collections/search
func (h *CollectionHandler) Search(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "search query required"})
		return
	}

	collections, err := h.repo.Search(query, workspaceID, 20)
	if err != nil {
		h.logger.Error("Failed to search collections", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to search collections"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"collections": collections})
}
