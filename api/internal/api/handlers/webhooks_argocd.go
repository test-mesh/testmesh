package handlers

// ArgoCDWebhookHandler handles POST /api/v1/webhooks/argocd
// Called by argocd-notifications when an Application sync succeeds.
//
// Setup in argocd-notifications-cm:
//
//	service.webhook.testmesh:
//	  url: http://testmesh-api:5016
//	  headers:
//	    - name: Content-Type
//	      value: application/json
//	    - name: X-TestMesh-Secret
//	      value: $testmesh-webhook-secret
//
//	trigger.on-sync-succeeded: |
//	  - send: [testmesh-sync]
//	    when: app.status.sync.status == 'Synced' && app.status.health.status == 'Healthy'
//
//	template.testmesh-sync:
//	  webhook:
//	    testmesh:
//	      method: POST
//	      path: /api/v1/webhooks/argocd
//	      body: |
//	        {"application": {{toJson .app}}}

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// ArgoCDSyncEvent is the payload sent by argocd-notifications on a sync.
type ArgoCDSyncEvent struct {
	Application struct {
		Metadata struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"metadata"`
		Status struct {
			Health struct {
				Status string `json:"status"`
			} `json:"health"`
			Sync struct {
				Revision string `json:"revision"` // commit SHA
			} `json:"sync"`
		} `json:"status"`
	} `json:"application"`
}

// ArgoCDWebhookHandler handles Argo CD sync webhook events.
type ArgoCDWebhookHandler struct {
	ruleRepo     *repository.GitTriggerRuleRepository
	deliveryRepo *repository.WebhookDeliveryRepository
	suiteRunner  *runner.SuiteRunner
	logger       *zap.Logger
}

// NewArgoCDWebhookHandler creates a new ArgoCDWebhookHandler.
func NewArgoCDWebhookHandler(
	ruleRepo *repository.GitTriggerRuleRepository,
	deliveryRepo *repository.WebhookDeliveryRepository,
	suiteRunner *runner.SuiteRunner,
	logger *zap.Logger,
) *ArgoCDWebhookHandler {
	return &ArgoCDWebhookHandler{
		ruleRepo:     ruleRepo,
		deliveryRepo: deliveryRepo,
		suiteRunner:  suiteRunner,
		logger:       logger,
	}
}

// HandleSync handles POST /api/v1/webhooks/argocd.
//
// TODO: Add HMAC/shared-secret validation once the argocd-notifications secret
// header strategy is finalised. For now the endpoint is unauthenticated — deploy
// behind a network policy or ingress rule that restricts access to the Argo CD
// notifications controller only.
func (h *ArgoCDWebhookHandler) HandleSync(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		h.logger.Error("argocd webhook: failed to read body", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	var event ArgoCDSyncEvent
	if err := json.Unmarshal(body, &event); err != nil {
		h.logger.Error("argocd webhook: failed to parse payload", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON payload"})
		return
	}

	appName := event.Application.Metadata.Name
	commitSHA := event.Application.Status.Sync.Revision

	h.logger.Info("argocd webhook: received sync event",
		zap.String("app", appName),
		zap.String("commit_sha", commitSHA),
		zap.String("health", event.Application.Status.Health.Status),
	)

	// Find all enabled GitTriggerRules whose repository field matches the Argo CD
	// application name. We use FindByRepository which queries only by repository +
	// enabled, as Argo CD syncs are not branch-scoped in the traditional sense.
	rules, err := h.ruleRepo.FindByRepository(appName)
	if err != nil {
		h.logger.Error("argocd webhook: failed to query trigger rules",
			zap.String("app", appName),
			zap.Error(err),
		)
		h.logArgoCDDelivery(appName, commitSHA, body, models.WebhookDeliveryStatusFailed, err.Error(), nil)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process webhook"})
		return
	}

	if len(rules) == 0 {
		h.logger.Info("argocd webhook: no matching trigger rules",
			zap.String("app", appName),
		)
		h.logArgoCDDelivery(appName, commitSHA, body, models.WebhookDeliveryStatusSuccess, "", nil)
		c.JSON(http.StatusOK, gin.H{
			"message":        "no matching trigger rules",
			"application":    appName,
			"triggered_rules": 0,
		})
		return
	}

	var triggeredRuns []uuid.UUID
	for _, rule := range rules {
		if rule.SuiteID == nil {
			h.logger.Info("argocd webhook: rule has no suite_id, skipping",
				zap.String("rule_id", rule.ID.String()),
				zap.String("rule_name", rule.Name),
			)
			continue
		}

		h.logger.Info("argocd webhook: triggering suite run",
			zap.String("rule_id", rule.ID.String()),
			zap.String("suite_id", rule.SuiteID.String()),
			zap.String("app", appName),
			zap.String("commit_sha", commitSHA),
		)

		suiteRun, err := h.suiteRunner.Run(c.Request.Context(), runner.RunSuiteRequest{
			SuiteID:     *rule.SuiteID,
			TriggerType: models.TriggerTypeArgoCD,
			TriggerRef:  commitSHA,
		})
		if err != nil {
			h.logger.Error("argocd webhook: failed to trigger suite run",
				zap.String("suite_id", rule.SuiteID.String()),
				zap.Error(err),
			)
			continue
		}
		if suiteRun != nil {
			triggeredRuns = append(triggeredRuns, suiteRun.ID)
		}
	}

	h.logArgoCDDelivery(appName, commitSHA, body, models.WebhookDeliveryStatusSuccess, "", triggeredRuns)

	c.JSON(http.StatusOK, gin.H{
		"application":     appName,
		"commit_sha":      commitSHA,
		"triggered_rules": len(triggeredRuns),
	})
}

// logArgoCDDelivery persists a WebhookDelivery audit record.
// It uses a zero-value UUID for IntegrationID since there is no Argo CD
// SystemIntegration record required to receive webhooks.
func (h *ArgoCDWebhookHandler) logArgoCDDelivery(
	appName, commitSHA string,
	rawBody []byte,
	status models.WebhookDeliveryStatus,
	errorMsg string,
	triggeredRuns []uuid.UUID,
) {
	var payload map[string]interface{}
	_ = json.Unmarshal(rawBody, &payload)
	if payload == nil {
		payload = map[string]interface{}{}
	}

	now := time.Now()
	delivery := &models.WebhookDelivery{
		// No SystemIntegration row for Argo CD; use nil-equivalent zero UUID.
		IntegrationID: uuid.Nil,
		EventType:     "argocd_sync",
		Repository:    appName,
		CommitSHA:     commitSHA,
		Payload:       payload,
		Status:        status,
		Error:         errorMsg,
		TriggeredRuns: triggeredRuns,
		ReceivedAt:    now,
	}
	if status == models.WebhookDeliveryStatusSuccess {
		delivery.ProcessedAt = &now
	}

	if err := h.deliveryRepo.Create(delivery); err != nil {
		h.logger.Warn("argocd webhook: failed to log delivery", zap.Error(err))
	}
}
