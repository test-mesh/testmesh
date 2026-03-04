package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/exporter"
	"github.com/georgi-georgiev/testmesh/internal/importer"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ImportExportHandler handles import/export requests
type ImportExportHandler struct {
	flowRepo *repository.FlowRepository
	logger   *zap.Logger
}

// NewImportExportHandler creates a new import/export handler
func NewImportExportHandler(flowRepo *repository.FlowRepository, logger *zap.Logger) *ImportExportHandler {
	return &ImportExportHandler{
		flowRepo: flowRepo,
		logger:   logger,
	}
}

// ImportRequest represents an import request
type ImportRequest struct {
	Type    string `json:"type" binding:"required"` // "har", "curl", "postman"
	Content string `json:"content" binding:"required"`
	Preview bool   `json:"preview"` // If true, just preview without saving
}

// ImportFlowsRequest represents a request to import parsed flows
type ImportFlowsRequest struct {
	Flows       []models.FlowDefinition `json:"flows" binding:"required"`
	Suite       string                  `json:"suite"`
	Tags        []string                `json:"tags"`
	CollectionID *string                `json:"collection_id"`
}

// ExportRequest represents an export request
type ExportRequest struct {
	FlowIDs      []string `json:"flow_ids" binding:"required"`
	Format       string   `json:"format" binding:"required"` // "postman", "openapi", "har", "testmesh"
	IncludeTests bool     `json:"include_tests"`
	IncludeEnv   bool     `json:"include_env"`
}

// Parse handles POST /api/v1/import/parse
// Parses import content and returns flow definitions for preview
func (h *ImportExportHandler) Parse(c *gin.Context) {
	var req ImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var result *importer.ImportResult
	var err error

	switch req.Type {
	case "har":
		result, err = importer.ParseHAR(req.Content)
	case "curl":
		result, err = importer.ParseCURL(req.Content)
	case "postman":
		result, err = importer.ParsePostman(req.Content)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported import type: " + req.Type})
		return
	}

	if err != nil {
		h.logger.Error("Failed to parse import", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// Import handles POST /api/v1/import
// Imports parsed flows into the system
func (h *ImportExportHandler) Import(c *gin.Context) {
	var req ImportFlowsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get workspace ID from context
	workspaceID := middleware.GetWorkspaceID(c)

	var collectionID *uuid.UUID
	if req.CollectionID != nil && *req.CollectionID != "" {
		id, err := uuid.Parse(*req.CollectionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
			return
		}
		collectionID = &id
	}

	created := []string{}
	errors := []string{}

	for _, flowDef := range req.Flows {
		// Merge tags
		tags := append([]string{}, flowDef.Tags...)
		for _, t := range req.Tags {
			if !contains(tags, t) {
				tags = append(tags, t)
			}
		}

		// Use suite from flow or request
		suite := flowDef.Suite
		if suite == "" && req.Suite != "" {
			suite = req.Suite
		}

		flow := &models.Flow{
			Name:         flowDef.Name,
			Description:  flowDef.Description,
			Suite:        suite,
			Tags:         tags,
			Definition:   flowDef,
			CollectionID: collectionID,
		}

		if err := h.flowRepo.Create(flow, workspaceID); err != nil {
			errors = append(errors, flowDef.Name+": "+err.Error())
			continue
		}

		created = append(created, flow.ID.String())
	}

	c.JSON(http.StatusOK, gin.H{
		"created": created,
		"errors":  errors,
		"stats": gin.H{
			"total":     len(req.Flows),
			"succeeded": len(created),
			"failed":    len(errors),
		},
	})
}

// Export handles POST /api/v1/export
// Exports flows to the specified format
func (h *ImportExportHandler) Export(c *gin.Context) {
	var req ExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get workspace ID from context
	workspaceID := middleware.GetWorkspaceID(c)

	// Fetch flows
	var flows []*models.Flow
	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			continue
		}

		flows = append(flows, flow)
	}

	if len(flows) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid flows to export"})
		return
	}

	// Export
	options := exporter.ExportOptions{
		Format:       exporter.ExportFormat(req.Format),
		IncludeTests: req.IncludeTests,
		IncludeEnv:   req.IncludeEnv,
	}

	result, err := exporter.ExportFlows(flows, options)
	if err != nil {
		h.logger.Error("Failed to export flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ExportDownload handles GET /api/v1/export/download
// Returns the exported content as a downloadable file
func (h *ImportExportHandler) ExportDownload(c *gin.Context) {
	flowIDs := c.QueryArray("flow_ids")
	format := c.Query("format")

	if len(flowIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "flow_ids required"})
		return
	}
	if format == "" {
		format = "testmesh"
	}

	// Get workspace ID from context
	workspaceID := middleware.GetWorkspaceID(c)

	// Fetch flows
	var flows []*models.Flow
	for _, idStr := range flowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			continue
		}

		flows = append(flows, flow)
	}

	if len(flows) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid flows to export"})
		return
	}

	// Export
	options := exporter.ExportOptions{
		Format: exporter.ExportFormat(format),
	}

	result, err := exporter.ExportFlows(flows, options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+result.Filename)
	c.Header("Content-Type", result.MimeType)
	c.String(http.StatusOK, result.Content)
}

// Helper function
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
