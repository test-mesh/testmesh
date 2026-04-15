package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/git"
	"github.com/test-mesh/testmesh/internal/shared/config"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// GitHubOAuthHandler handles GitHub App OAuth flows
type GitHubOAuthHandler struct {
	db           *gorm.DB
	cfg          config.GitHubAppConfig
	integRepo    *repository.IntegrationRepository
	dashboardURL string
	logger       *zap.Logger
}

// NewGitHubOAuthHandler creates a new GitHubOAuthHandler
func NewGitHubOAuthHandler(
	db *gorm.DB,
	cfg config.GitHubAppConfig,
	integRepo *repository.IntegrationRepository,
	dashboardURL string,
	logger *zap.Logger,
) *GitHubOAuthHandler {
	return &GitHubOAuthHandler{
		db:           db,
		cfg:          cfg,
		integRepo:    integRepo,
		dashboardURL: dashboardURL,
		logger:       logger,
	}
}

// Authorize generates an OAuth state token, stores it in the DB, and returns the
// GitHub OAuth authorization URL.
//
// GET /api/v1/workspaces/:workspace_id/github/oauth/authorize
func (h *GitHubOAuthHandler) Authorize(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}

	if h.cfg.ClientID == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GitHub App is not configured"})
		return
	}

	state, err := git.GenerateOAuthState()
	if err != nil {
		h.logger.Error("failed to generate OAuth state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate state"})
		return
	}

	// Store state in DB with 15-minute expiry
	expiresAt := time.Now().Add(15 * time.Minute)
	if err := h.db.Exec(
		"INSERT INTO oauth_states (state, workspace_id, expires_at) VALUES (?, ?, ?)",
		state, workspaceID, expiresAt,
	).Error; err != nil {
		h.logger.Error("failed to store OAuth state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store state"})
		return
	}

	authURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&state=%s&scope=read:user",
		h.cfg.ClientID,
		state,
	)

	c.JSON(http.StatusOK, gin.H{"url": authURL})
}

// Callback handles the OAuth callback from GitHub, exchanges the code for an access
// token, and creates or updates the workspace's GitHub integration.
//
// GET /api/v1/github/callback
func (h *GitHubOAuthHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" || state == "" {
		c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=missing_params")
		return
	}

	// Atomically consume the state and retrieve workspace ID + expiry in one query
	var workspaceID uuid.UUID
	var expiresAt time.Time
	row := h.db.Raw(
		"DELETE FROM oauth_states WHERE state = ? RETURNING workspace_id, expires_at",
		state,
	).Row()
	if err := row.Scan(&workspaceID, &expiresAt); err != nil {
		h.logger.Warn("OAuth state not found or already used", zap.String("state", state))
		c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=invalid_state")
		return
	}

	if time.Now().After(expiresAt) {
		c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=state_expired")
		return
	}

	// Exchange code for access token
	accessToken, userLogin, err := git.ExchangeOAuthCode(c.Request.Context(), h.cfg.ClientID, h.cfg.ClientSecret, code)
	if err != nil {
		h.logger.Error("failed to exchange OAuth code", zap.Error(err))
		c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=exchange_failed")
		return
	}

	// Create or update the GitHub integration for this workspace (workspace-scoped)
	existing, err := h.integRepo.GetByTypeAndProviderForWorkspace(models.IntegrationTypeGit, models.IntegrationProviderGitHub, workspaceID)
	if err != nil && err != gorm.ErrRecordNotFound {
		h.logger.Error("failed to look up existing GitHub integration", zap.Error(err))
		c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=db_error")
		return
	}

	if existing != nil {
		// Update existing integration config and secrets
		existing.Config.GitHubUserLogin = userLogin
		existing.Status = models.IntegrationStatusActive

		if err := h.integRepo.Update(existing); err != nil {
			h.logger.Error("failed to update GitHub integration", zap.Error(err))
			c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=db_error")
			return
		}

		if err := h.integRepo.UpdateSecrets(existing.ID, map[string]string{
			"access_token": accessToken,
		}); err != nil {
			h.logger.Error("failed to update GitHub integration secrets", zap.Error(err))
			c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=db_error")
			return
		}
	} else {
		// Create new integration
		wsID := workspaceID
		integration := &models.SystemIntegration{
			Name:        "GitHub",
			Type:        models.IntegrationTypeGit,
			Provider:    models.IntegrationProviderGitHub,
			Status:      models.IntegrationStatusActive,
			WorkspaceID: &wsID,
			Config: models.IntegrationConfig{
				GitHubUserLogin: userLogin,
			},
		}

		if err := h.integRepo.Create(integration, map[string]string{
			"access_token": accessToken,
		}); err != nil {
			h.logger.Error("failed to create GitHub integration", zap.Error(err))
			c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_error=db_error")
			return
		}
	}

	c.Redirect(http.StatusFound, h.dashboardURL+"/integrations?github_connected=true")
}

// ListInstallations lists GitHub App installations accessible to the connected user.
//
// GET /api/v1/workspaces/:workspace_id/github/installations
func (h *GitHubOAuthHandler) ListInstallations(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}

	integration, err := h.integRepo.GetByTypeAndProviderForWorkspaceWithSecrets(models.IntegrationTypeGit, models.IntegrationProviderGitHub, workspaceID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "GitHub integration not connected"})
			return
		}
		h.logger.Error("failed to load GitHub integration", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load integration"})
		return
	}

	accessToken, ok := integration.Secrets["access_token"]
	if !ok || accessToken == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "GitHub integration has no access token"})
		return
	}

	installations, err := git.ListAppInstallations(c.Request.Context(), accessToken)
	if err != nil {
		h.logger.Error("failed to list GitHub App installations", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch installations from GitHub"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"installations": installations})
}

// AppStatus returns whether the GitHub App is configured and its client_id.
//
// GET /api/v1/github/app-status
func (h *GitHubOAuthHandler) AppStatus(c *gin.Context) {
	configured := h.cfg.ClientID != "" && h.cfg.ClientSecret != ""
	c.JSON(http.StatusOK, gin.H{
		"configured": configured,
		"client_id":  h.cfg.ClientID,
	})
}
