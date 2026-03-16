package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/test-mesh/testmesh/internal/ai"
	gitprovider "github.com/test-mesh/testmesh/internal/git"
	"github.com/test-mesh/testmesh/internal/scheduler"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebhookHandler handles incoming webhook events
type WebhookHandler struct {
	integrationRepo *repository.IntegrationRepository
	ruleRepo        *repository.GitTriggerRuleRepository
	deliveryRepo    *repository.WebhookDeliveryRepository
	repoLinkRepo    *repository.RepositoryLinkRepository
	diffAnalyzer    *ai.DiffAnalyzer
	selfHealing     *ai.SelfHealingEngine
	scheduler       *scheduler.Scheduler
	logger          *zap.Logger
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(
	integrationRepo *repository.IntegrationRepository,
	ruleRepo *repository.GitTriggerRuleRepository,
	deliveryRepo *repository.WebhookDeliveryRepository,
	repoLinkRepo *repository.RepositoryLinkRepository,
	diffAnalyzer *ai.DiffAnalyzer,
	selfHealing *ai.SelfHealingEngine,
	scheduler *scheduler.Scheduler,
	logger *zap.Logger,
) *WebhookHandler {
	return &WebhookHandler{
		integrationRepo: integrationRepo,
		ruleRepo:        ruleRepo,
		deliveryRepo:    deliveryRepo,
		repoLinkRepo:    repoLinkRepo,
		diffAnalyzer:    diffAnalyzer,
		selfHealing:     selfHealing,
		scheduler:       scheduler,
		logger:          logger,
	}
}

// GitHub webhook event structures
type GitHubPushEvent struct {
	Ref        string `json:"ref"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
	HeadCommit struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	} `json:"head_commit"`
	Pusher struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"pusher"`
}

type GitHubPullRequestEvent struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest struct {
		Head struct {
			Ref string `json:"ref"`
			SHA string `json:"sha"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	} `json:"pull_request"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
}

// HandleGitHub handles POST /api/v1/webhooks/github
func (h *WebhookHandler) HandleGitHub(c *gin.Context) {
	// Read raw body for signature verification
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		h.logger.Error("Failed to read webhook body", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	// Get event type
	eventType := c.GetHeader("X-GitHub-Event")
	if eventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing X-GitHub-Event header"})
		return
	}

	// Get signature
	signature := c.GetHeader("X-Hub-Signature-256")
	if signature == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing X-Hub-Signature-256 header"})
		return
	}

	// Load GitHub integration to get webhook secret
	integration, err := h.integrationRepo.GetByTypeAndProviderWithSecrets(
		models.IntegrationTypeGit,
		models.IntegrationProviderGitHub,
	)
	if err != nil {
		h.logger.Error("GitHub integration not found", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub integration not configured"})
		return
	}

	// Verify signature
	webhookSecret := integration.Secrets["webhook_secret"]
	if !verifyGitHubSignature(body, webhookSecret, signature) {
		h.logger.Warn("Invalid webhook signature")
		// Log failed delivery
		h.logDelivery(integration.ID, nil, eventType, "", "", "", body, signature, models.WebhookDeliveryStatusRejected, "Invalid signature", nil)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	// Parse payload based on event type
	var repository, branch, commitSHA string
	var payload map[string]interface{}

	if err := json.Unmarshal(body, &payload); err != nil {
		h.logger.Error("Failed to parse webhook payload", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON payload"})
		return
	}

	switch eventType {
	case "push":
		var pushEvent GitHubPushEvent
		if err := json.Unmarshal(body, &pushEvent); err != nil {
			h.logger.Error("Failed to parse push event", zap.Error(err))
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid push event format"})
			return
		}
		repository = pushEvent.Repository.FullName
		branch = extractBranchFromRef(pushEvent.Ref)
		commitSHA = pushEvent.HeadCommit.ID

	case "pull_request":
		var prEvent GitHubPullRequestEvent
		if err := json.Unmarshal(body, &prEvent); err != nil {
			h.logger.Error("Failed to parse pull_request event", zap.Error(err))
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pull_request event format"})
			return
		}
		repository = prEvent.Repository.FullName
		branch = prEvent.PullRequest.Head.Ref
		commitSHA = prEvent.PullRequest.Head.SHA

	default:
		h.logger.Info("Ignoring unsupported event type", zap.String("event_type", eventType))
		c.JSON(http.StatusOK, gin.H{"message": "Event type not supported"})
		return
	}

	// Find matching trigger rules
	rules, err := h.ruleRepo.FindMatchingRules(repository, branch, eventType)
	if err != nil {
		h.logger.Error("Failed to find matching rules", zap.Error(err))
		h.logDelivery(integration.ID, nil, eventType, repository, branch, commitSHA, body, signature, models.WebhookDeliveryStatusFailed, err.Error(), nil)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process webhook"})
		return
	}

	if len(rules) == 0 {
		h.logger.Info("No matching trigger rules found",
			zap.String("repository", repository),
			zap.String("branch", branch),
			zap.String("event_type", eventType),
		)
		h.logDelivery(integration.ID, nil, eventType, repository, branch, commitSHA, body, signature, models.WebhookDeliveryStatusSuccess, "", nil)
		c.JSON(http.StatusOK, gin.H{
			"message":        "No matching trigger rules",
			"repository":     repository,
			"branch":         branch,
			"event_type":     eventType,
			"triggered_runs": 0,
		})
		return
	}

	// Trigger executions for each matching rule
	var triggeredRuns []uuid.UUID
	for _, rule := range rules {
		runID, err := h.triggerRule(rule, commitSHA, payload)
		if err != nil {
			h.logger.Error("Failed to trigger rule",
				zap.String("rule_id", rule.ID.String()),
				zap.Error(err),
			)
			continue
		}
		if runID != uuid.Nil {
			triggeredRuns = append(triggeredRuns, runID)
		}
	}

	// Log successful delivery
	h.logDelivery(integration.ID, nil, eventType, repository, branch, commitSHA, body, signature, models.WebhookDeliveryStatusSuccess, "", triggeredRuns)

	// Async diff analysis for push events
	if eventType == "push" {
		var beforeSHA string
		if raw, ok := payload["before"]; ok {
			beforeSHA, _ = raw.(string)
		}
		if beforeSHA != "" && beforeSHA != "0000000000000000000000000000000000000000" {
			go h.runDiffAnalysis(context.Background(), integration, repository, beforeSHA, commitSHA)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":           "Webhook processed successfully",
		"repository":        repository,
		"branch":            branch,
		"commit_sha":        commitSHA,
		"event_type":        eventType,
		"matched_rules":     len(rules),
		"triggered_runs":    len(triggeredRuns),
		"triggered_run_ids": triggeredRuns,
	})
}

// Gitea webhook event structures
type GiteaPushEvent struct {
	Ref        string `json:"ref"`
	Before     string `json:"before"`
	After      string `json:"after"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
	HeadCommit struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	} `json:"head_commit"`
	Pusher struct {
		Login string `json:"login"`
		Email string `json:"email"`
	} `json:"pusher"`
}

type GiteaPullRequestEvent struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest struct {
		Head struct {
			Ref string `json:"ref"`
			SHA string `json:"sha"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	} `json:"pull_request"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
}

// HandleGitea handles POST /api/v1/webhooks/gitea
func (h *WebhookHandler) HandleGitea(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		h.logger.Error("Failed to read Gitea webhook body", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	eventType := c.GetHeader("X-Gitea-Event")
	if eventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing X-Gitea-Event header"})
		return
	}

	signature := c.GetHeader("X-Gitea-Signature")
	if signature == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing X-Gitea-Signature header"})
		return
	}

	// Load Gitea integration
	integration, err := h.integrationRepo.GetByTypeAndProviderWithSecrets(
		models.IntegrationTypeGit,
		models.IntegrationProviderGitea,
	)
	if err != nil {
		h.logger.Error("Gitea integration not found", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gitea integration not configured"})
		return
	}

	// Verify signature (same HMAC-SHA256 as GitHub)
	webhookSecret := integration.Secrets["webhook_secret"]
	if !verifyGitHubSignature(body, webhookSecret, "sha256="+signature) {
		h.logger.Warn("Invalid Gitea webhook signature")
		h.logDelivery(integration.ID, nil, eventType, "", "", "", body, signature, models.WebhookDeliveryStatusRejected, "Invalid signature", nil)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON payload"})
		return
	}

	var repo, branch, commitSHA, beforeSHA string

	switch eventType {
	case "push":
		var pushEvent GiteaPushEvent
		if err := json.Unmarshal(body, &pushEvent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid push event format"})
			return
		}
		repo = pushEvent.Repository.FullName
		branch = extractBranchFromRef(pushEvent.Ref)
		commitSHA = pushEvent.After
		beforeSHA = pushEvent.Before

	case "pull_request":
		var prEvent GiteaPullRequestEvent
		if err := json.Unmarshal(body, &prEvent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pull_request event format"})
			return
		}
		repo = prEvent.Repository.FullName
		branch = prEvent.PullRequest.Head.Ref
		commitSHA = prEvent.PullRequest.Head.SHA

	default:
		h.logger.Info("Ignoring unsupported Gitea event type", zap.String("event_type", eventType))
		c.JSON(http.StatusOK, gin.H{"message": "Event type not supported"})
		return
	}

	// Find matching trigger rules
	rules, err := h.ruleRepo.FindMatchingRules(repo, branch, eventType)
	if err != nil {
		h.logger.Error("Failed to find matching rules", zap.Error(err))
		h.logDelivery(integration.ID, nil, eventType, repo, branch, commitSHA, body, signature, models.WebhookDeliveryStatusFailed, err.Error(), nil)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process webhook"})
		return
	}

	var triggeredRuns []uuid.UUID
	for _, rule := range rules {
		runID, err := h.triggerRule(rule, commitSHA, payload)
		if err != nil {
			h.logger.Error("Failed to trigger rule", zap.String("rule_id", rule.ID.String()), zap.Error(err))
			continue
		}
		if runID != uuid.Nil {
			triggeredRuns = append(triggeredRuns, runID)
		}
	}

	h.logDelivery(integration.ID, nil, eventType, repo, branch, commitSHA, body, signature, models.WebhookDeliveryStatusSuccess, "", triggeredRuns)

	// Async diff analysis for push events
	if eventType == "push" && beforeSHA != "" && beforeSHA != "0000000000000000000000000000000000000000" {
		go h.runDiffAnalysis(context.Background(), integration, repo, beforeSHA, commitSHA)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":           "Gitea webhook processed successfully",
		"repository":        repo,
		"branch":            branch,
		"commit_sha":        commitSHA,
		"event_type":        eventType,
		"matched_rules":     len(rules),
		"triggered_runs":    len(triggeredRuns),
		"triggered_run_ids": triggeredRuns,
	})
}

// GitLab webhook event structures
type GitLabPushEvent struct {
	Ref    string `json:"ref"`
	Before string `json:"before"`
	After  string `json:"after"`
	Project struct {
		PathWithNamespace string `json:"path_with_namespace"`
	} `json:"project"`
	Commits []struct {
		ID string `json:"id"`
	} `json:"commits"`
}

type GitLabMergeRequestEvent struct {
	ObjectAttributes struct {
		SourceBranch string `json:"source_branch"`
		LastCommit   struct {
			ID string `json:"id"`
		} `json:"last_commit"`
	} `json:"object_attributes"`
	Project struct {
		PathWithNamespace string `json:"path_with_namespace"`
	} `json:"project"`
}

// HandleGitLab handles POST /api/v1/webhooks/gitlab
func (h *WebhookHandler) HandleGitLab(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		h.logger.Error("Failed to read GitLab webhook body", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	eventType := c.GetHeader("X-Gitlab-Event")
	if eventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing X-Gitlab-Event header"})
		return
	}

	token := c.GetHeader("X-Gitlab-Token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing X-Gitlab-Token header"})
		return
	}

	// Load GitLab integration
	integration, err := h.integrationRepo.GetByTypeAndProviderWithSecrets(
		models.IntegrationTypeGit,
		models.IntegrationProviderGitLab,
	)
	if err != nil {
		h.logger.Error("GitLab integration not found", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitLab integration not configured"})
		return
	}

	// Verify token via constant-time comparison
	webhookSecret := integration.Secrets["webhook_secret"]
	if !hmac.Equal([]byte(token), []byte(webhookSecret)) {
		h.logger.Warn("Invalid GitLab webhook token")
		h.logDelivery(integration.ID, nil, eventType, "", "", "", body, token, models.WebhookDeliveryStatusRejected, "Invalid token", nil)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON payload"})
		return
	}

	var repo, branch, commitSHA, beforeSHA string

	switch eventType {
	case "Push Hook":
		var pushEvent GitLabPushEvent
		if err := json.Unmarshal(body, &pushEvent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid push event format"})
			return
		}
		repo = pushEvent.Project.PathWithNamespace
		branch = extractBranchFromRef(pushEvent.Ref)
		commitSHA = pushEvent.After
		beforeSHA = pushEvent.Before

	case "Merge Request Hook":
		var mrEvent GitLabMergeRequestEvent
		if err := json.Unmarshal(body, &mrEvent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid merge request event format"})
			return
		}
		repo = mrEvent.Project.PathWithNamespace
		branch = mrEvent.ObjectAttributes.SourceBranch
		commitSHA = mrEvent.ObjectAttributes.LastCommit.ID
		// Use "pull_request" as the canonical event type for rule matching
		eventType = "pull_request"

	default:
		h.logger.Info("Ignoring unsupported GitLab event type", zap.String("event_type", eventType))
		c.JSON(http.StatusOK, gin.H{"message": "Event type not supported"})
		return
	}

	// Find matching trigger rules
	rules, err := h.ruleRepo.FindMatchingRules(repo, branch, eventType)
	if err != nil {
		h.logger.Error("Failed to find matching rules", zap.Error(err))
		h.logDelivery(integration.ID, nil, eventType, repo, branch, commitSHA, body, token, models.WebhookDeliveryStatusFailed, err.Error(), nil)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process webhook"})
		return
	}

	var triggeredRuns []uuid.UUID
	for _, rule := range rules {
		runID, err := h.triggerRule(rule, commitSHA, payload)
		if err != nil {
			h.logger.Error("Failed to trigger rule", zap.String("rule_id", rule.ID.String()), zap.Error(err))
			continue
		}
		if runID != uuid.Nil {
			triggeredRuns = append(triggeredRuns, runID)
		}
	}

	h.logDelivery(integration.ID, nil, eventType, repo, branch, commitSHA, body, token, models.WebhookDeliveryStatusSuccess, "", triggeredRuns)

	// Async diff analysis for push events
	if eventType == "push" && beforeSHA != "" && beforeSHA != "0000000000000000000000000000000000000000" {
		go h.runDiffAnalysis(context.Background(), integration, repo, beforeSHA, commitSHA)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":           "GitLab webhook processed successfully",
		"repository":        repo,
		"branch":            branch,
		"commit_sha":        commitSHA,
		"event_type":        eventType,
		"matched_rules":     len(rules),
		"triggered_runs":    len(triggeredRuns),
		"triggered_run_ids": triggeredRuns,
	})
}

// runDiffAnalysis runs asynchronously after a push webhook to generate code_sync suggestions
func (h *WebhookHandler) runDiffAnalysis(ctx context.Context, integration *models.SystemIntegration, repo, beforeSHA, afterSHA string) {
	if h.diffAnalyzer == nil {
		return
	}

	// Find all repository links for this repo
	links, err := h.repoLinkRepo.FindByRepository(repo)
	if err != nil {
		h.logger.Error("Failed to find repository links for diff analysis", zap.String("repo", repo), zap.Error(err))
		return
	}

	for _, link := range links {
		if !link.AutoAdapt {
			continue
		}

		// Load integration with secrets for the link (may be a different integration than the webhook one)
		linkIntegration, err := h.integrationRepo.GetWithSecrets(link.IntegrationID)
		if err != nil {
			h.logger.Error("Failed to load link integration", zap.String("integration_id", link.IntegrationID.String()), zap.Error(err))
			continue
		}

		provider, err := gitprovider.NewProvider(linkIntegration)
		if err != nil {
			h.logger.Error("Failed to create git provider", zap.Error(err))
			continue
		}

		diff, changedFiles, err := provider.FetchDiff(ctx, repo, beforeSHA, afterSHA)
		if err != nil {
			h.logger.Error("Failed to fetch diff", zap.String("repo", repo), zap.Error(err))
			continue
		}

		suggestions, err := h.diffAnalyzer.AnalyzeCodeChange(ctx, link, afterSHA, diff, changedFiles)
		if err != nil {
			h.logger.Error("Diff analysis failed", zap.String("repo", repo), zap.Error(err))
			continue
		}

		// Auto-apply high-confidence suggestions if threshold is set
		if link.AutoApplyThreshold > 0 && h.selfHealing != nil {
			for _, suggestion := range suggestions {
				if suggestion.Confidence >= link.AutoApplyThreshold {
					if _, err := h.selfHealing.ApplySuggestion(ctx, suggestion.ID, link.WorkspaceID); err != nil {
						h.logger.Error("Failed to auto-apply suggestion",
							zap.String("suggestion_id", suggestion.ID.String()),
							zap.Error(err),
						)
					} else {
						h.logger.Info("Auto-applied code_sync suggestion",
							zap.String("suggestion_id", suggestion.ID.String()),
							zap.Float64("confidence", suggestion.Confidence),
						)
					}
				}
			}
		}
	}
}

// triggerRule triggers a test execution based on a git trigger rule
func (h *WebhookHandler) triggerRule(rule *models.GitTriggerRule, commitSHA string, payload map[string]interface{}) (uuid.UUID, error) {
	h.logger.Info("Triggering rule",
		zap.String("rule_id", rule.ID.String()),
		zap.String("rule_name", rule.Name),
		zap.String("trigger_mode", string(rule.TriggerMode)),
	)

	switch rule.TriggerMode {
	case models.TriggerModeSchedule:
		if rule.ScheduleID == nil {
			return uuid.Nil, fmt.Errorf("schedule_id is nil for schedule trigger mode")
		}
		// Trigger schedule run
		run, err := h.scheduler.TriggerSchedule(*rule.ScheduleID)
		if err != nil {
			return uuid.Nil, err
		}
		if run != nil {
			return run.ID, nil
		}
		return uuid.Nil, nil

	case models.TriggerModeDirect:
		if rule.FlowID == nil {
			return uuid.Nil, fmt.Errorf("flow_id is nil for direct trigger mode")
		}
		// Execute flow directly
		// For now, return a placeholder - the actual execution logic will be implemented
		// when wiring up the webhook handler in main.go
		h.logger.Info("Direct flow execution triggered",
			zap.String("flow_id", rule.FlowID.String()),
			zap.String("commit_sha", commitSHA),
		)
		// TODO: Implement direct flow execution
		return uuid.Nil, nil

	default:
		return uuid.Nil, fmt.Errorf("unknown trigger mode: %s", rule.TriggerMode)
	}
}

// logDelivery logs a webhook delivery to the database
func (h *WebhookHandler) logDelivery(
	integrationID uuid.UUID,
	workspaceID *uuid.UUID,
	eventType, repository, branch, commitSHA string,
	rawBody []byte,
	signature string,
	status models.WebhookDeliveryStatus,
	errorMsg string,
	triggeredRuns []uuid.UUID,
) {
	var payload map[string]interface{}
	json.Unmarshal(rawBody, &payload)

	delivery := &models.WebhookDelivery{
		IntegrationID: integrationID,
		WorkspaceID:   workspaceID,
		EventType:     eventType,
		Repository:    repository,
		Branch:        branch,
		CommitSHA:     commitSHA,
		Payload:       payload,
		Signature:     signature,
		Status:        status,
		Error:         errorMsg,
		TriggeredRuns: triggeredRuns,
		ReceivedAt:    time.Now(),
	}

	if status == models.WebhookDeliveryStatusSuccess {
		now := time.Now()
		delivery.ProcessedAt = &now
	}

	if err := h.deliveryRepo.Create(delivery); err != nil {
		h.logger.Warn("Failed to log webhook delivery", zap.Error(err))
	}
}

// verifyGitHubSignature verifies the HMAC signature from GitHub
func verifyGitHubSignature(payload []byte, secret string, signature string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// extractBranchFromRef extracts branch name from a Git ref (e.g., "refs/heads/main" -> "main")
func extractBranchFromRef(ref string) string {
	const prefix = "refs/heads/"
	if len(ref) > len(prefix) && ref[:len(prefix)] == prefix {
		return ref[len(prefix):]
	}
	return ref
}
