package notifications

import (
	"context"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// NotificationDispatcher creates in-app notifications and optionally forwards to Slack
type NotificationDispatcher struct {
	notifRepo       *repository.NotificationRepository
	integrationRepo *repository.IntegrationRepository
	slack           *SlackNotifier
	logger          *zap.Logger
}

// NewNotificationDispatcher creates a new dispatcher
func NewNotificationDispatcher(
	notifRepo *repository.NotificationRepository,
	integrationRepo *repository.IntegrationRepository,
	logger *zap.Logger,
) *NotificationDispatcher {
	return &NotificationDispatcher{
		notifRepo:       notifRepo,
		integrationRepo: integrationRepo,
		slack:           NewSlackNotifier(),
		logger:          logger,
	}
}

// Dispatch creates an in-app notification and sends to Slack if configured
func (d *NotificationDispatcher) Dispatch(
	ctx context.Context,
	workspaceID uuid.UUID,
	notifType models.NotificationType,
	title, message string,
	entityType models.NotificationEntityType,
	entityID *uuid.UUID,
) {
	n := &models.Notification{
		WorkspaceID: workspaceID,
		Title:       title,
		Message:     message,
		Type:        notifType,
		EntityType:  entityType,
		EntityID:    entityID,
	}
	if err := d.notifRepo.Create(n); err != nil {
		d.logger.Error("Failed to create notification", zap.Error(err))
	}

	// Attempt Slack delivery (best-effort)
	d.dispatchSlack(title, message, string(notifType))
}

// dispatchSlack sends to all active Slack integrations (best-effort, no error returned)
func (d *NotificationDispatcher) dispatchSlack(title, message, notifType string) {
	if d.integrationRepo == nil {
		return
	}
	integrations, err := d.integrationRepo.List(models.IntegrationTypeNotification, models.IntegrationStatusActive)
	if err != nil {
		d.logger.Warn("Failed to load Slack integrations", zap.Error(err))
		return
	}
	for _, integration := range integrations {
		if integration.Provider != models.IntegrationProviderSlack {
			continue
		}
		// Load secrets to get webhook URL
		full, err := d.integrationRepo.GetWithSecrets(integration.ID)
		if err != nil {
			d.logger.Warn("Failed to load Slack secrets", zap.String("id", integration.ID.String()), zap.Error(err))
			continue
		}
		webhookURL, ok := full.Secrets["webhook_url"]
		if !ok || webhookURL == "" {
			continue
		}
		if err := d.slack.Send(webhookURL, title, message, notifType, ""); err != nil {
			d.logger.Warn("Failed to send Slack notification", zap.Error(err))
		}
	}
}
