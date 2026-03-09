package git

import (
	"context"
	"fmt"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

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
	default:
		return nil, fmt.Errorf("unsupported git provider: %s", integration.Provider)
	}
}
