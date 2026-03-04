package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/ai"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// IntegrationHandler handles integration management requests (admin only)
type IntegrationHandler struct {
	repo      *repository.IntegrationRepository
	aiManager *ai.ProviderManager
	logger    *zap.Logger
}

// NewIntegrationHandler creates a new integration handler
func NewIntegrationHandler(
	repo *repository.IntegrationRepository,
	aiManager *ai.ProviderManager,
	logger *zap.Logger,
) *IntegrationHandler {
	return &IntegrationHandler{
		repo:      repo,
		aiManager: aiManager,
		logger:    logger,
	}
}

// integrationRepoAdapter adapts IntegrationRepository to ai.IntegrationProvider interface
type integrationRepoAdapter struct {
	repo *repository.IntegrationRepository
}

// GetAIIntegrations implements ai.IntegrationProvider
func (a *integrationRepoAdapter) GetAIIntegrations() ([]*ai.IntegrationData, error) {
	integrations, err := a.repo.GetAllAIIntegrationsWithSecrets()
	if err != nil {
		return nil, err
	}

	var result []*ai.IntegrationData
	for _, integration := range integrations {
		data := &ai.IntegrationData{
			Provider: string(integration.Provider),
			Config: ai.IntegrationConfig{
				Model:       integration.Config.Model,
				Endpoint:    integration.Config.Endpoint,
				Temperature: integration.Config.Temperature,
				MaxTokens:   integration.Config.MaxTokens,
			},
			Secrets: integration.Secrets,
		}
		result = append(result, data)
	}

	return result, nil
}

// reloadAIProviders is a helper to reload AI providers from database
func (h *IntegrationHandler) reloadAIProviders() error {
	adapter := &integrationRepoAdapter{repo: h.repo}
	return h.aiManager.ReloadFromDatabase(adapter)
}

// CreateIntegrationRequest represents a request to create an integration
type CreateIntegrationRequest struct {
	Name     string                  `json:"name" binding:"required"`
	Type     models.IntegrationType  `json:"type" binding:"required"`
	Provider models.IntegrationProvider `json:"provider" binding:"required"`
	Config   models.IntegrationConfig `json:"config"`
	Secrets  map[string]string       `json:"secrets"`
}

// UpdateIntegrationRequest represents a request to update an integration
type UpdateIntegrationRequest struct {
	Name   string                   `json:"name"`
	Status models.IntegrationStatus `json:"status"`
	Config models.IntegrationConfig `json:"config"`
}

// UpdateSecretsRequest represents a request to update integration secrets
type UpdateSecretsRequest struct {
	Secrets map[string]string `json:"secrets" binding:"required"`
}

// List handles GET /api/v1/admin/integrations
func (h *IntegrationHandler) List(c *gin.Context) {
	// Optional filters
	integrationType := models.IntegrationType(c.Query("type"))
	status := models.IntegrationStatus(c.Query("status"))

	integrations, err := h.repo.List(integrationType, status)
	if err != nil {
		h.logger.Error("Failed to list integrations", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list integrations"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"integrations": integrations,
		"total":        len(integrations),
	})
}

// Create handles POST /api/v1/admin/integrations
func (h *IntegrationHandler) Create(c *gin.Context) {
	var req CreateIntegrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate type and provider combination
	if err := validateIntegration(req.Type, req.Provider); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if integration with same type/provider already exists
	existing, _ := h.repo.GetByTypeAndProvider(req.Type, req.Provider)
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": fmt.Sprintf("Integration of type %s with provider %s already exists", req.Type, req.Provider),
		})
		return
	}

	// Create integration
	integration := &models.SystemIntegration{
		Name:     req.Name,
		Type:     req.Type,
		Provider: req.Provider,
		Status:   models.IntegrationStatusActive,
		Config:   req.Config,
	}

	// Get user ID from context
	if userID := c.GetHeader("X-User-ID"); userID != "" {
		id, _ := uuid.Parse(userID)
		integration.CreatedBy = &id
	}

	// Create with secrets
	if err := h.repo.Create(integration, req.Secrets); err != nil {
		h.logger.Error("Failed to create integration", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create integration"})
		return
	}

	// Reload AI providers if this is an AI integration
	if req.Type == models.IntegrationTypeAIProvider {
		if err := h.reloadAIProviders(); err != nil {
			h.logger.Warn("Failed to reload AI providers after creating integration", zap.Error(err))
		}
	}

	c.JSON(http.StatusCreated, integration)
}

// Get handles GET /api/v1/admin/integrations/:id
func (h *IntegrationHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	integration, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	c.JSON(http.StatusOK, integration)
}

// Update handles PUT /api/v1/admin/integrations/:id
func (h *IntegrationHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	var req UpdateIntegrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Load existing integration
	integration, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	// Update fields
	if req.Name != "" {
		integration.Name = req.Name
	}
	if req.Status != "" {
		integration.Status = req.Status
	}
	integration.Config = req.Config

	if err := h.repo.Update(integration); err != nil {
		h.logger.Error("Failed to update integration", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update integration"})
		return
	}

	// Reload AI providers if this is an AI integration
	if integration.Type == models.IntegrationTypeAIProvider {
		if err := h.reloadAIProviders(); err != nil {
			h.logger.Warn("Failed to reload AI providers after updating integration", zap.Error(err))
		}
	}

	c.JSON(http.StatusOK, integration)
}

// Delete handles DELETE /api/v1/admin/integrations/:id
func (h *IntegrationHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	// Load integration to check type
	integration, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		h.logger.Error("Failed to delete integration", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete integration"})
		return
	}

	// Reload AI providers if this was an AI integration
	if integration.Type == models.IntegrationTypeAIProvider {
		if err := h.reloadAIProviders(); err != nil {
			h.logger.Warn("Failed to reload AI providers after deleting integration", zap.Error(err))
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Integration deleted successfully"})
}

// GetSecrets handles GET /api/v1/admin/integrations/:id/secrets
func (h *IntegrationHandler) GetSecrets(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	integration, err := h.repo.GetWithSecrets(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	// Return secrets (keys only, not the full values for security)
	secretKeys := make([]string, 0, len(integration.Secrets))
	for key := range integration.Secrets {
		secretKeys = append(secretKeys, key)
	}

	c.JSON(http.StatusOK, gin.H{
		"integration_id": integration.ID,
		"secret_keys":    secretKeys,
		"secrets":        integration.Secrets, // Full secrets - admin only
	})
}

// UpdateSecrets handles PUT /api/v1/admin/integrations/:id/secrets
func (h *IntegrationHandler) UpdateSecrets(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	var req UpdateSecretsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Load integration to check type
	integration, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	if err := h.repo.UpdateSecrets(id, req.Secrets); err != nil {
		h.logger.Error("Failed to update secrets", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update secrets"})
		return
	}

	// Reload AI providers if this is an AI integration
	if integration.Type == models.IntegrationTypeAIProvider {
		if err := h.reloadAIProviders(); err != nil {
			h.logger.Warn("Failed to reload AI providers after updating secrets", zap.Error(err))
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Secrets updated successfully"})
}

// TestConnection handles POST /api/v1/admin/integrations/:id/test
func (h *IntegrationHandler) TestConnection(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration ID"})
		return
	}

	integration, err := h.repo.GetWithSecrets(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	// Test based on type
	var testErr error
	var testResult string

	switch integration.Type {
	case models.IntegrationTypeAIProvider:
		testResult, testErr = h.testAIProvider(integration)
	case models.IntegrationTypeGit:
		testResult, testErr = h.testGitIntegration(integration)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown integration type"})
		return
	}

	// Update last test result
	now := time.Now()
	integration.LastTestAt = &now
	if testErr != nil {
		integration.LastTestStatus = "failed"
		integration.LastTestError = testErr.Error()
		integration.Status = models.IntegrationStatusError
	} else {
		integration.LastTestStatus = "success"
		integration.LastTestError = ""
		integration.Status = models.IntegrationStatusActive
	}

	if err := h.repo.Update(integration); err != nil {
		h.logger.Warn("Failed to update test status", zap.Error(err))
	}

	if testErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   testErr.Error(),
			"tested_at": now,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": testResult,
		"tested_at": now,
	})
}

// testAIProvider tests an AI provider connection
func (h *IntegrationHandler) testAIProvider(integration *models.SystemIntegration) (string, error) {
	apiKey, ok := integration.Secrets["api_key"]
	if !ok {
		return "", fmt.Errorf("api_key not configured")
	}

	// Create temporary provider and test
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var provider ai.Provider
	switch integration.Provider {
	case models.IntegrationProviderOpenAI:
		provider = ai.NewOpenAIProvider(apiKey, h.logger)
	case models.IntegrationProviderAnthropic:
		provider = ai.NewAnthropicProvider(apiKey, h.logger)
	case models.IntegrationProviderLocal:
		endpoint := integration.Config.Endpoint
		if endpoint == "" {
			return "", fmt.Errorf("endpoint not configured for local provider")
		}
		provider = ai.NewLocalProvider(endpoint, h.logger)
	default:
		return "", fmt.Errorf("unsupported AI provider: %s", integration.Provider)
	}

	// Send a simple test prompt
	testPrompt := "Say 'OK' if you can read this."
	req := ai.GenerateRequest{
		Prompt:    testPrompt,
		MaxTokens: 100,
	}
	_, err := provider.Generate(ctx, req)
	if err != nil {
		return "", fmt.Errorf("connection test failed: %w", err)
	}

	return fmt.Sprintf("Successfully connected to %s", integration.Provider), nil
}

// testGitIntegration tests a Git integration (webhook secret validation)
func (h *IntegrationHandler) testGitIntegration(integration *models.SystemIntegration) (string, error) {
	webhookSecret, ok := integration.Secrets["webhook_secret"]
	if !ok {
		return "", fmt.Errorf("webhook_secret not configured")
	}

	if len(webhookSecret) < 16 {
		return "", fmt.Errorf("webhook secret must be at least 16 characters")
	}

	// For GitHub, we can't really "test" the connection without making an API call
	// For now, just validate the secret format
	return fmt.Sprintf("Webhook secret configured for %s", integration.Provider), nil
}

// validateIntegration validates that the type and provider combination is valid
func validateIntegration(integrationType models.IntegrationType, provider models.IntegrationProvider) error {
	switch integrationType {
	case models.IntegrationTypeAIProvider:
		switch provider {
		case models.IntegrationProviderOpenAI,
			models.IntegrationProviderAnthropic,
			models.IntegrationProviderLocal:
			return nil
		default:
			return fmt.Errorf("invalid AI provider: %s", provider)
		}
	case models.IntegrationTypeGit:
		switch provider {
		case models.IntegrationProviderGitHub:
			return nil
		default:
			return fmt.Errorf("invalid Git provider: %s (only github supported)", provider)
		}
	default:
		return fmt.Errorf("invalid integration type: %s", integrationType)
	}
}
