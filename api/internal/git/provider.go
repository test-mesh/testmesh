package git

import (
	"context"
	"errors"
	"fmt"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

// ErrNotSupported is returned when a provider does not support a write operation
var ErrNotSupported = errors.New("operation not supported by this provider")

// CommitStatus represents a commit status check
type CommitStatus struct {
	State       string // "pending", "success", "failure", "error"
	Context     string // e.g. "testmesh/analysis"
	Description string
	TargetURL   string
}

// PullRequestCreate holds parameters for creating a PR
type PullRequestCreate struct {
	Title string
	Body  string
	Head  string // source branch
	Base  string // target branch
}

// PullRequest represents a created pull request
type PullRequest struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
	Title   string `json:"title"`
}

// FileChange represents a file to create/update in a commit
type FileChange struct {
	Path    string // file path relative to repo root
	Content string // new file content
}

// Repository represents a git repository from a provider
type Repository struct {
	FullName    string `json:"full_name"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Private     bool   `json:"private"`
	HTMLURL     string `json:"html_url"`
}

// GitProvider fetches diff information from a git hosting provider
type GitProvider interface {
	// FetchDiff retrieves the unified diff and changed file list between two commits
	FetchDiff(ctx context.Context, repo, beforeSHA, afterSHA string) (diff string, changedFiles []string, err error)
	// ListRepositories returns repositories accessible via the provider's PAT
	ListRepositories(ctx context.Context, search string) ([]Repository, error)
	// Name returns the provider name (e.g., "github", "gitea")
	Name() string

	// Write methods (return ErrNotSupported if not implemented)
	CreatePRComment(ctx context.Context, repo string, prNumber int, body string) error
	CreateCommitStatus(ctx context.Context, repo, sha string, status CommitStatus) error
	CreatePullRequest(ctx context.Context, repo string, pr PullRequestCreate) (*PullRequest, error)
	CreateBranch(ctx context.Context, repo, branchName, fromSHA string) error
	PushFileChanges(ctx context.Context, repo, branch, message string, changes []FileChange) (commitSHA string, err error)
}

// ProviderFactory is a function that creates a GitProvider from an integration
type ProviderFactory func(integration *models.SystemIntegration) (GitProvider, error)

// NewProvider creates the appropriate GitProvider for the given integration
func NewProvider(integration *models.SystemIntegration) (GitProvider, error) {
	switch integration.Provider {
	case models.IntegrationProviderGitHub:
		return NewGitHubProvider(integration), nil
	case models.IntegrationProviderGitea:
		return NewGiteaProvider(integration), nil
	case models.IntegrationProviderGitLab:
		return NewGitLabProvider(integration), nil
	default:
		return nil, fmt.Errorf("unsupported git provider: %s", integration.Provider)
	}
}
