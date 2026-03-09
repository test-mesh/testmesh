package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RepositoryLinkHandler handles repository link CRUD
type RepositoryLinkHandler struct {
	repoLinkRepo *repository.RepositoryLinkRepository
	logger       *zap.Logger
}

// NewRepositoryLinkHandler creates a new repository link handler
func NewRepositoryLinkHandler(repoLinkRepo *repository.RepositoryLinkRepository, logger *zap.Logger) *RepositoryLinkHandler {
	return &RepositoryLinkHandler{
		repoLinkRepo: repoLinkRepo,
		logger:       logger,
	}
}

type createRepositoryLinkRequest struct {
	IntegrationID      string                       `json:"integration_id" binding:"required"`
	Repository         string                       `json:"repository" binding:"required"`
	DefaultBranch      string                       `json:"default_branch"`
	ServiceMappings    []models.ServicePathMapping  `json:"service_mappings"`
	AutoAdapt          bool                         `json:"auto_adapt"`
	AutoApplyThreshold float64                      `json:"auto_apply_threshold"`
}

type updateRepositoryLinkRequest struct {
	DefaultBranch      *string                      `json:"default_branch"`
	ServiceMappings    []models.ServicePathMapping  `json:"service_mappings"`
	AutoAdapt          *bool                        `json:"auto_adapt"`
	AutoApplyThreshold *float64                     `json:"auto_apply_threshold"`
}

// List returns all repository links for a workspace
func (h *RepositoryLinkHandler) List(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	links, err := h.repoLinkRepo.ListByWorkspace(workspaceID)
	if err != nil {
		h.logger.Error("Failed to list repository links", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list repository links"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"repository_links": links, "total": len(links)})
}

// Create creates a new repository link
func (h *RepositoryLinkHandler) Create(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	var req createRepositoryLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	integrationID, err := uuid.Parse(req.IntegrationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid integration_id"})
		return
	}

	branch := req.DefaultBranch
	if branch == "" {
		branch = "main"
	}

	mappings := req.ServiceMappings
	if mappings == nil {
		mappings = []models.ServicePathMapping{}
	}

	link := &models.RepositoryLink{
		WorkspaceID:        workspaceID,
		IntegrationID:      integrationID,
		Repository:         req.Repository,
		DefaultBranch:      branch,
		ServiceMappings:    mappings,
		AutoAdapt:          req.AutoAdapt,
		AutoApplyThreshold: req.AutoApplyThreshold,
	}

	if err := h.repoLinkRepo.Create(link); err != nil {
		h.logger.Error("Failed to create repository link", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create repository link"})
		return
	}

	c.JSON(http.StatusCreated, link)
}

// Get retrieves a single repository link
func (h *RepositoryLinkHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("link_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	link, err := h.repoLinkRepo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repository link not found"})
		return
	}

	c.JSON(http.StatusOK, link)
}

// Update updates a repository link
func (h *RepositoryLinkHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("link_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	link, err := h.repoLinkRepo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repository link not found"})
		return
	}

	var req updateRepositoryLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.DefaultBranch != nil {
		link.DefaultBranch = *req.DefaultBranch
	}
	if req.ServiceMappings != nil {
		link.ServiceMappings = req.ServiceMappings
	}
	if req.AutoAdapt != nil {
		link.AutoAdapt = *req.AutoAdapt
	}
	if req.AutoApplyThreshold != nil {
		link.AutoApplyThreshold = *req.AutoApplyThreshold
	}

	if err := h.repoLinkRepo.Update(link); err != nil {
		h.logger.Error("Failed to update repository link", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update repository link"})
		return
	}

	c.JSON(http.StatusOK, link)
}

// Delete removes a repository link
func (h *RepositoryLinkHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("link_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	if err := h.repoLinkRepo.Delete(id); err != nil {
		h.logger.Error("Failed to delete repository link", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete repository link"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "repository link deleted"})
}
