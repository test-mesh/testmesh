package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/plugins"
	"go.uber.org/zap"
)

// PluginHandler handles plugin-related requests
type PluginHandler struct {
	registry *plugins.Registry
	logger   *zap.Logger
}

// NewPluginHandler creates a new plugin handler
func NewPluginHandler(registry *plugins.Registry, logger *zap.Logger) *PluginHandler {
	return &PluginHandler{
		registry: registry,
		logger:   logger,
	}
}

// List handles GET /api/v1/plugins
func (h *PluginHandler) List(c *gin.Context) {
	pluginsList := h.registry.List()

	c.JSON(http.StatusOK, gin.H{
		"plugins": pluginsList,
		"total":   len(pluginsList),
	})
}

// Get handles GET /api/v1/plugins/:id
func (h *PluginHandler) Get(c *gin.Context) {
	id := c.Param("id")

	plugin, err := h.registry.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, plugin)
}

// Enable handles POST /api/v1/plugins/:id/enable
func (h *PluginHandler) Enable(c *gin.Context) {
	id := c.Param("id")

	if err := h.registry.Enable(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Also load if not loaded
	if err := h.registry.Load(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Plugin enabled"})
}

// Disable handles POST /api/v1/plugins/:id/disable
func (h *PluginHandler) Disable(c *gin.Context) {
	id := c.Param("id")

	if err := h.registry.Disable(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Plugin disabled"})
}

// InstallRequest represents a request to install a plugin
type InstallRequest struct {
	Source string `json:"source" binding:"required"` // URL or path
}

// Install handles POST /api/v1/plugins/install
func (h *PluginHandler) Install(c *gin.Context) {
	var req InstallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	plugin, err := h.registry.Install(req.Source)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Auto-load the plugin after installation
	if err := h.registry.Load(plugin.Manifest.ID); err != nil {
		h.logger.Warn("Failed to auto-load plugin after install",
			zap.String("id", plugin.Manifest.ID),
			zap.Error(err),
		)
		// Return the plugin anyway, user can manually enable later
	}

	// Re-fetch to get updated status
	plugin, _ = h.registry.Get(plugin.Manifest.ID)
	c.JSON(http.StatusCreated, plugin)
}

// Uninstall handles DELETE /api/v1/plugins/:id
func (h *PluginHandler) Uninstall(c *gin.Context) {
	id := c.Param("id")

	if err := h.registry.Uninstall(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Plugin uninstalled"})
}

// Discover handles POST /api/v1/plugins/discover
func (h *PluginHandler) Discover(c *gin.Context) {
	if err := h.registry.Discover(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	pluginsList := h.registry.List()
	c.JSON(http.StatusOK, gin.H{
		"plugins":    pluginsList,
		"discovered": len(pluginsList),
	})
}

// GetTypes handles GET /api/v1/plugins/types
func (h *PluginHandler) GetTypes(c *gin.Context) {
	types := []map[string]string{
		{"type": "action", "description": "Custom action handlers for test steps"},
		{"type": "auth", "description": "Authentication providers"},
		{"type": "exporter", "description": "Export format plugins"},
		{"type": "importer", "description": "Import format plugins"},
		{"type": "reporter", "description": "Report generation plugins"},
	}

	c.JSON(http.StatusOK, gin.H{"types": types})
}
