package repo

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"go.uber.org/zap"
)

// WebhookPayload represents a normalized push webhook from GitHub/GitLab.
type WebhookPayload struct {
	RepoID       uuid.UUID `json:"repo_id"`
	WorkspaceID  uuid.UUID `json:"workspace_id"`
	Branch       string    `json:"branch"`
	CommitSHA    string    `json:"commit_sha"`
	PrevCommit   string    `json:"prev_commit"`
	ChangedFiles []string  `json:"changed_files"`
	Sender       string    `json:"sender"`
}

// WebhookHandler processes push webhooks and triggers incremental scans.
type WebhookHandler struct {
	repoManager  *Manager
	orchestrator *scanner.Orchestrator
	engine       graph.Engine
	logger       *zap.Logger
}

// NewWebhookHandler creates a webhook handler.
func NewWebhookHandler(repoManager *Manager, orchestrator *scanner.Orchestrator, engine graph.Engine, logger *zap.Logger) *WebhookHandler {
	return &WebhookHandler{
		repoManager:  repoManager,
		orchestrator: orchestrator,
		engine:       engine,
		logger:       logger,
	}
}

// HandlePush processes a push webhook and triggers an incremental scan.
func (h *WebhookHandler) HandlePush(ctx context.Context, payload WebhookPayload) (*graph.GraphScan, error) {
	h.logger.Info("Processing push webhook",
		zap.String("repo_id", payload.RepoID.String()),
		zap.String("branch", payload.Branch),
		zap.String("commit", payload.CommitSHA),
		zap.Int("changed_files", len(payload.ChangedFiles)),
	)

	// Load the repo
	repo, err := h.engine.GetRepo(ctx, payload.RepoID, payload.WorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("repo not found: %w", err)
	}

	// Only scan if the push is to the tracked branch
	if repo.Branch != "" && repo.Branch != payload.Branch {
		h.logger.Debug("Skipping push to non-tracked branch",
			zap.String("pushed", payload.Branch),
			zap.String("tracked", repo.Branch),
		)
		return nil, nil
	}

	// Prepare the repo (pull latest)
	repoInfo, err := h.repoManager.PrepareRepo(ctx, repo)
	if err != nil {
		return nil, fmt.Errorf("prepare repo: %w", err)
	}
	defer h.repoManager.Cleanup(repoInfo)

	// Determine changed files
	changedFiles := payload.ChangedFiles
	if len(changedFiles) == 0 && payload.PrevCommit != "" {
		changedFiles, err = h.repoManager.GetChangedFiles(ctx, repoInfo, payload.PrevCommit)
		if err != nil {
			h.logger.Warn("Failed to get changed files from git, falling back to full scan", zap.Error(err))
			// Fall back to full scan
			input := scanner.ScanInput{
				RepoPath:    repoInfo.LocalPath,
				RepoID:      repoInfo.ID,
				WorkspaceID: repoInfo.WorkspaceID,
				Config:      scanner.ScannerConfig{},
			}
			return h.orchestrator.RunFullScan(ctx, input)
		}
	}

	// Run incremental scan
	input := scanner.DiffInput{
		ScanInput: scanner.ScanInput{
			RepoPath:    repoInfo.LocalPath,
			RepoID:      repoInfo.ID,
			WorkspaceID: repoInfo.WorkspaceID,
			Config:      scanner.ScannerConfig{},
		},
		ChangedFiles: changedFiles,
	}

	scan, err := h.orchestrator.RunIncrementalScan(ctx, input)
	if err != nil {
		repo.LastScanStatus = "failed"
		h.engine.UpdateRepo(ctx, repo)
		return scan, err
	}

	repo.LastScanStatus = "completed"
	h.engine.UpdateRepo(ctx, repo)

	return scan, nil
}
