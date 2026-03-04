package repository

import (
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/security"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IntegrationRepository handles integration database operations
type IntegrationRepository struct {
	db         *gorm.DB
	encryption *security.EncryptionService
}

// NewIntegrationRepository creates a new integration repository
func NewIntegrationRepository(db *gorm.DB, encryption *security.EncryptionService) *IntegrationRepository {
	return &IntegrationRepository{
		db:         db,
		encryption: encryption,
	}
}

// Create creates a new integration with encrypted secrets
func (r *IntegrationRepository) Create(integration *models.SystemIntegration, secrets map[string]string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Create the integration
		if err := tx.Create(integration).Error; err != nil {
			return fmt.Errorf("failed to create integration: %w", err)
		}

		// If secrets provided, encrypt and store them
		if len(secrets) > 0 {
			encrypted, nonce, err := r.encryption.Encrypt(secrets)
			if err != nil {
				return fmt.Errorf("failed to encrypt secrets: %w", err)
			}

			secret := &models.IntegrationSecret{
				IntegrationID: integration.ID,
				EncryptedData: encrypted,
				Nonce:         nonce,
			}

			if err := tx.Create(secret).Error; err != nil {
				return fmt.Errorf("failed to save encrypted secrets: %w", err)
			}
		}

		return nil
	})
}

// Get retrieves an integration by ID without secrets
func (r *IntegrationRepository) Get(id uuid.UUID) (*models.SystemIntegration, error) {
	var integration models.SystemIntegration
	err := r.db.First(&integration, "id = ? AND deleted_at IS NULL", id).Error
	if err != nil {
		return nil, err
	}
	return &integration, nil
}

// GetWithSecrets retrieves an integration with decrypted secrets
func (r *IntegrationRepository) GetWithSecrets(id uuid.UUID) (*models.SystemIntegration, error) {
	integration, err := r.Get(id)
	if err != nil {
		return nil, err
	}

	// Load and decrypt secrets
	var secret models.IntegrationSecret
	err = r.db.Where("integration_id = ?", id).First(&secret).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// No secrets stored - return integration without secrets
			return integration, nil
		}
		return nil, fmt.Errorf("failed to load secrets: %w", err)
	}

	// Decrypt secrets
	decrypted, err := r.encryption.Decrypt(secret.EncryptedData, secret.Nonce)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt secrets: %w", err)
	}

	integration.Secrets = decrypted
	return integration, nil
}

// Update updates an integration (config only, not secrets)
func (r *IntegrationRepository) Update(integration *models.SystemIntegration) error {
	return r.db.Save(integration).Error
}

// UpdateSecrets updates only the encrypted secrets for an integration
func (r *IntegrationRepository) UpdateSecrets(id uuid.UUID, secrets map[string]string) error {
	if len(secrets) == 0 {
		return fmt.Errorf("secrets cannot be empty")
	}

	// Encrypt new secrets
	encrypted, nonce, err := r.encryption.Encrypt(secrets)
	if err != nil {
		return fmt.Errorf("failed to encrypt secrets: %w", err)
	}

	// Update or create secret record
	secret := &models.IntegrationSecret{
		IntegrationID: id,
		EncryptedData: encrypted,
		Nonce:         nonce,
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		// Check if integration exists
		var integration models.SystemIntegration
		if err := tx.First(&integration, "id = ? AND deleted_at IS NULL", id).Error; err != nil {
			return fmt.Errorf("integration not found: %w", err)
		}

		// Delete old secret if exists
		tx.Where("integration_id = ?", id).Delete(&models.IntegrationSecret{})

		// Create new secret
		if err := tx.Create(secret).Error; err != nil {
			return fmt.Errorf("failed to save secrets: %w", err)
		}

		return nil
	})
}

// Delete soft deletes an integration
func (r *IntegrationRepository) Delete(id uuid.UUID) error {
	return r.db.Model(&models.SystemIntegration{}).
		Where("id = ?", id).
		Update("deleted_at", gorm.Expr("NOW()")).Error
}

// List lists integrations without secrets
func (r *IntegrationRepository) List(integrationType models.IntegrationType, status models.IntegrationStatus) ([]*models.SystemIntegration, error) {
	query := r.db.Model(&models.SystemIntegration{}).Where("deleted_at IS NULL")

	if integrationType != "" {
		query = query.Where("type = ?", integrationType)
	}

	if status != "" {
		query = query.Where("status = ?", status)
	}

	var integrations []*models.SystemIntegration
	err := query.Order("created_at DESC").Find(&integrations).Error
	if err != nil {
		return nil, err
	}

	return integrations, nil
}

// ListByType lists integrations by type
func (r *IntegrationRepository) ListByType(integrationType models.IntegrationType, status models.IntegrationStatus) ([]*models.SystemIntegration, error) {
	return r.List(integrationType, status)
}

// GetByTypeAndProvider gets an integration by type and provider
func (r *IntegrationRepository) GetByTypeAndProvider(integrationType models.IntegrationType, provider models.IntegrationProvider) (*models.SystemIntegration, error) {
	var integration models.SystemIntegration
	err := r.db.Where("type = ? AND provider = ? AND deleted_at IS NULL", integrationType, provider).
		First(&integration).Error
	if err != nil {
		return nil, err
	}
	return &integration, nil
}

// GetByTypeAndProviderWithSecrets gets an integration with secrets by type and provider
func (r *IntegrationRepository) GetByTypeAndProviderWithSecrets(integrationType models.IntegrationType, provider models.IntegrationProvider) (*models.SystemIntegration, error) {
	integration, err := r.GetByTypeAndProvider(integrationType, provider)
	if err != nil {
		return nil, err
	}

	// Load and decrypt secrets
	var secret models.IntegrationSecret
	err = r.db.Where("integration_id = ?", integration.ID).First(&secret).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return integration, nil
		}
		return nil, fmt.Errorf("failed to load secrets: %w", err)
	}

	decrypted, err := r.encryption.Decrypt(secret.EncryptedData, secret.Nonce)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt secrets: %w", err)
	}

	integration.Secrets = decrypted
	return integration, nil
}

// GetAllAIIntegrationsWithSecrets returns all active AI provider integrations with secrets
func (r *IntegrationRepository) GetAllAIIntegrationsWithSecrets() ([]*models.SystemIntegration, error) {
	integrations, err := r.ListByType(models.IntegrationTypeAIProvider, models.IntegrationStatusActive)
	if err != nil {
		return nil, err
	}

	var result []*models.SystemIntegration
	for _, integration := range integrations {
		// Load secrets for each integration
		fullIntegration, err := r.GetWithSecrets(integration.ID)
		if err != nil {
			continue // Skip if we can't load secrets
		}
		result = append(result, fullIntegration)
	}

	return result, nil
}

// GitTriggerRuleRepository handles git trigger rule operations
type GitTriggerRuleRepository struct {
	db *gorm.DB
}

// NewGitTriggerRuleRepository creates a new git trigger rule repository
func NewGitTriggerRuleRepository(db *gorm.DB) *GitTriggerRuleRepository {
	return &GitTriggerRuleRepository{db: db}
}

// Create creates a new git trigger rule
func (r *GitTriggerRuleRepository) Create(rule *models.GitTriggerRule) error {
	return r.db.Create(rule).Error
}

// Get retrieves a git trigger rule by ID
func (r *GitTriggerRuleRepository) Get(id uuid.UUID) (*models.GitTriggerRule, error) {
	var rule models.GitTriggerRule
	err := r.db.Preload("Integration").
		Preload("Schedule").
		Preload("Flow").
		First(&rule, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

// Update updates a git trigger rule
func (r *GitTriggerRuleRepository) Update(rule *models.GitTriggerRule) error {
	return r.db.Save(rule).Error
}

// Delete deletes a git trigger rule
func (r *GitTriggerRuleRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.GitTriggerRule{}, "id = ?", id).Error
}

// List lists git trigger rules by workspace
func (r *GitTriggerRuleRepository) List(workspaceID uuid.UUID) ([]*models.GitTriggerRule, error) {
	var rules []*models.GitTriggerRule
	err := r.db.Where("workspace_id = ?", workspaceID).
		Preload("Integration").
		Preload("Schedule").
		Preload("Flow").
		Order("created_at DESC").
		Find(&rules).Error
	if err != nil {
		return nil, err
	}
	return rules, nil
}

// FindMatchingRules finds all enabled rules matching repository, branch, and event type
func (r *GitTriggerRuleRepository) FindMatchingRules(repository, branch, eventType string) ([]*models.GitTriggerRule, error) {
	var rules []*models.GitTriggerRule

	// Find rules with matching repository and enabled
	query := r.db.Where("repository = ? AND enabled = ?", repository, true).
		Preload("Integration").
		Preload("Schedule").
		Preload("Flow")

	// Filter by event type (check if eventType is in the array)
	query = query.Where("? = ANY(event_types)", eventType)

	err := query.Find(&rules).Error
	if err != nil {
		return nil, err
	}

	// Filter by branch pattern (simple glob matching for now)
	// TODO: Implement proper glob matching
	var matchingRules []*models.GitTriggerRule
	for _, rule := range rules {
		if matchesBranch(rule.BranchFilter, branch) {
			matchingRules = append(matchingRules, rule)
		}
	}

	return matchingRules, nil
}

// matchesBranch performs simple glob matching
// TODO: Implement proper glob matching with * and **
func matchesBranch(pattern, branch string) bool {
	if pattern == "*" || pattern == "" {
		return true
	}
	return pattern == branch
}

// WebhookDeliveryRepository handles webhook delivery logging
type WebhookDeliveryRepository struct {
	db *gorm.DB
}

// NewWebhookDeliveryRepository creates a new webhook delivery repository
func NewWebhookDeliveryRepository(db *gorm.DB) *WebhookDeliveryRepository {
	return &WebhookDeliveryRepository{db: db}
}

// Create creates a new webhook delivery log
func (r *WebhookDeliveryRepository) Create(delivery *models.WebhookDelivery) error {
	return r.db.Create(delivery).Error
}

// Get retrieves a webhook delivery by ID
func (r *WebhookDeliveryRepository) Get(id uuid.UUID) (*models.WebhookDelivery, error) {
	var delivery models.WebhookDelivery
	err := r.db.First(&delivery, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &delivery, nil
}

// ListByIntegration lists webhook deliveries for an integration
func (r *WebhookDeliveryRepository) ListByIntegration(integrationID uuid.UUID, limit int) ([]*models.WebhookDelivery, error) {
	var deliveries []*models.WebhookDelivery
	err := r.db.Where("integration_id = ?", integrationID).
		Order("received_at DESC").
		Limit(limit).
		Find(&deliveries).Error
	if err != nil {
		return nil, err
	}
	return deliveries, nil
}

// ListRecent lists recent webhook deliveries
func (r *WebhookDeliveryRepository) ListRecent(limit int) ([]*models.WebhookDelivery, error) {
	var deliveries []*models.WebhookDelivery
	err := r.db.Order("received_at DESC").
		Limit(limit).
		Find(&deliveries).Error
	if err != nil {
		return nil, err
	}
	return deliveries, nil
}
