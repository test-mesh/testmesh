package repo

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// Manager handles repository lifecycle — clone, pull, diff, and cleanup.
type Manager struct {
	engine    graph.Engine
	clonePath string
	logger    *zap.Logger
}

// NewManager creates a repository manager.
func NewManager(engine graph.Engine, clonePath string, logger *zap.Logger) *Manager {
	return &Manager{
		engine:    engine,
		clonePath: clonePath,
		logger:    logger,
	}
}

// RepoInfo holds resolved repository info for scanning.
type RepoInfo struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	LocalPath   string
	Branch      string
	IsTemp      bool // If true, cleaned up after scan
}

// PrepareRepo ensures a repository is available locally for scanning.
// For CLI scans, localPath is provided directly. For Git URL repos, it clones.
func (m *Manager) PrepareRepo(ctx context.Context, repo *graph.GraphRepo) (*RepoInfo, error) {
	if repo.URL == "" {
		return nil, fmt.Errorf("repo URL is empty — use PrepareLocalPath for CLI scans")
	}

	localPath := filepath.Join(m.clonePath, repo.WorkspaceID.String(), repo.ID.String())

	git := NewGitClient(localPath, m.logger)

	if _, err := os.Stat(filepath.Join(localPath, ".git")); os.IsNotExist(err) {
		// Clone
		m.logger.Info("Cloning repository",
			zap.String("url", repo.URL),
			zap.String("branch", repo.Branch),
		)

		if err := git.Clone(ctx, repo.URL, repo.Branch); err != nil {
			return nil, fmt.Errorf("clone failed: %w", err)
		}
	} else {
		// Pull latest
		m.logger.Info("Pulling latest changes",
			zap.String("repo", repo.Name),
			zap.String("branch", repo.Branch),
		)

		if err := git.Pull(ctx, repo.Branch); err != nil {
			m.logger.Warn("Pull failed, will re-clone", zap.Error(err))
			os.RemoveAll(localPath)
			if err := git.Clone(ctx, repo.URL, repo.Branch); err != nil {
				return nil, fmt.Errorf("re-clone failed: %w", err)
			}
		}
	}

	// Update repo's last scan timestamp
	now := time.Now().UTC()
	repo.LastScanAt = &now
	repo.LastScanStatus = "scanning"
	m.engine.UpdateRepo(ctx, repo)

	return &RepoInfo{
		ID:          repo.ID,
		WorkspaceID: repo.WorkspaceID,
		LocalPath:   localPath,
		Branch:      repo.Branch,
		IsTemp:      false,
	}, nil
}

// PrepareLocalPath creates a RepoInfo from a local directory (CLI scan mode).
func (m *Manager) PrepareLocalPath(workspaceID uuid.UUID, localPath string) (*RepoInfo, error) {
	info, err := os.Stat(localPath)
	if err != nil {
		return nil, fmt.Errorf("local path not accessible: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("local path is not a directory: %s", localPath)
	}

	return &RepoInfo{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		LocalPath:   localPath,
		Branch:      "local",
		IsTemp:      false,
	}, nil
}

// Cleanup removes temporary repository clones.
func (m *Manager) Cleanup(info *RepoInfo) {
	if info.IsTemp {
		os.RemoveAll(info.LocalPath)
		m.logger.Debug("Cleaned up temp repo", zap.String("path", info.LocalPath))
	}
}

// GetChangedFiles returns files changed since the last scan commit.
func (m *Manager) GetChangedFiles(ctx context.Context, info *RepoInfo, sinceCommit string) ([]string, error) {
	git := NewGitClient(info.LocalPath, m.logger)
	return git.ChangedFilesSince(ctx, sinceCommit)
}

// GetCurrentCommit returns the current HEAD commit SHA.
func (m *Manager) GetCurrentCommit(ctx context.Context, info *RepoInfo) (string, error) {
	git := NewGitClient(info.LocalPath, m.logger)
	return git.CurrentCommit(ctx)
}
