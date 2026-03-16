package git

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

// GitLabProvider fetches diffs from a GitLab instance
type GitLabProvider struct {
	token   string
	baseURL string
}

// NewGitLabProvider creates a new GitLab diff provider
func NewGitLabProvider(integration *models.SystemIntegration) *GitLabProvider {
	baseURL := integration.Config.BaseURL
	baseURL = strings.TrimRight(baseURL, "/")
	if baseURL == "" {
		baseURL = "https://gitlab.com"
	}
	return &GitLabProvider{
		token:   integration.Secrets["access_token"],
		baseURL: baseURL,
	}
}

// Name returns the provider name
func (p *GitLabProvider) Name() string {
	return "gitlab"
}

// ListRepositories lists repositories accessible via the PAT
func (p *GitLabProvider) ListRepositories(ctx context.Context, search string) ([]Repository, error) {
	apiURL := fmt.Sprintf("%s/api/v4/projects?membership=true&per_page=50&order_by=last_activity_at", p.baseURL)
	if search != "" {
		apiURL += "&search=" + url.QueryEscape(search)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if p.token != "" {
		req.Header.Set("PRIVATE-TOKEN", p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitLab API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitLab API returned %d: %s", resp.StatusCode, string(body))
	}

	var projects []struct {
		PathWithNamespace string `json:"path_with_namespace"`
		Name              string `json:"name"`
		Description       string `json:"description"`
		Visibility        string `json:"visibility"`
		WebURL            string `json:"web_url"`
	}
	if err := json.Unmarshal(body, &projects); err != nil {
		return nil, fmt.Errorf("failed to parse GitLab projects response: %w", err)
	}

	result := make([]Repository, len(projects))
	for i, p := range projects {
		result[i] = Repository{
			FullName:    p.PathWithNamespace,
			Name:        p.Name,
			Description: p.Description,
			Private:     p.Visibility == "private",
			HTMLURL:     p.WebURL,
		}
	}
	return result, nil
}

// FetchDiff fetches a diff between two commits using the GitLab compare API
func (p *GitLabProvider) FetchDiff(ctx context.Context, repo, beforeSHA, afterSHA string) (string, []string, error) {
	// GitLab compare endpoint: GET /api/v4/projects/{encoded-path}/repository/compare?from=...&to=...
	encodedRepo := url.PathEscape(repo)
	apiURL := fmt.Sprintf("%s/api/v4/projects/%s/repository/compare?from=%s&to=%s",
		p.baseURL, encodedRepo, beforeSHA, afterSHA)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return "", nil, fmt.Errorf("failed to create request: %w", err)
	}

	if p.token != "" {
		req.Header.Set("PRIVATE-TOKEN", p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("GitLab API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("GitLab API returned %d: %s", resp.StatusCode, string(body))
	}

	var compareResp struct {
		Diffs []struct {
			Diff    string `json:"diff"`
			NewPath string `json:"new_path"`
		} `json:"diffs"`
	}
	if err := json.Unmarshal(body, &compareResp); err != nil {
		return "", nil, fmt.Errorf("failed to parse GitLab compare response: %w", err)
	}

	var changedFiles []string
	var diffBuilder strings.Builder
	for _, d := range compareResp.Diffs {
		changedFiles = append(changedFiles, d.NewPath)
		if d.Diff != "" {
			diffBuilder.WriteString(fmt.Sprintf("--- a/%s\n+++ b/%s\n%s\n", d.NewPath, d.NewPath, d.Diff))
		}
	}

	return diffBuilder.String(), changedFiles, nil
}
