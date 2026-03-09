package git

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

// GitHubProvider fetches diffs from the GitHub API
type GitHubProvider struct {
	token string
}

// NewGitHubProvider creates a new GitHub diff provider using the integration's access_token secret
func NewGitHubProvider(integration *models.SystemIntegration) *GitHubProvider {
	return &GitHubProvider{
		token: integration.Secrets["access_token"],
	}
}

// Name returns the provider name
func (p *GitHubProvider) Name() string {
	return "github"
}

// ListRepositories lists repositories accessible via the PAT
func (p *GitHubProvider) ListRepositories(ctx context.Context, search string) ([]Repository, error) {
	var apiURL string
	if search != "" {
		apiURL = fmt.Sprintf("https://api.github.com/search/repositories?q=%s&sort=updated&per_page=30", search)
	} else {
		apiURL = "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if p.token != "" {
		req.Header.Set("Authorization", "token "+p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	type ghRepo struct {
		FullName    string `json:"full_name"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Private     bool   `json:"private"`
		HTMLURL     string `json:"html_url"`
	}

	var repos []ghRepo
	if search != "" {
		var searchResp struct {
			Items []ghRepo `json:"items"`
		}
		if err := json.Unmarshal(body, &searchResp); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub search response: %w", err)
		}
		repos = searchResp.Items
	} else {
		if err := json.Unmarshal(body, &repos); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub repos response: %w", err)
		}
	}

	result := make([]Repository, len(repos))
	for i, r := range repos {
		result[i] = Repository{
			FullName:    r.FullName,
			Name:        r.Name,
			Description: r.Description,
			Private:     r.Private,
			HTMLURL:     r.HTMLURL,
		}
	}
	return result, nil
}

// FetchDiff fetches a diff between two commits using the GitHub compare API
func (p *GitHubProvider) FetchDiff(ctx context.Context, repo, beforeSHA, afterSHA string) (string, []string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/compare/%s...%s", repo, beforeSHA, afterSHA)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if p.token != "" {
		req.Header.Set("Authorization", "token "+p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var compareResp struct {
		Files []struct {
			Filename string `json:"filename"`
			Patch    string `json:"patch"`
		} `json:"files"`
	}
	if err := json.Unmarshal(body, &compareResp); err != nil {
		return "", nil, fmt.Errorf("failed to parse GitHub compare response: %w", err)
	}

	var changedFiles []string
	var diffBuilder string
	for _, f := range compareResp.Files {
		changedFiles = append(changedFiles, f.Filename)
		if f.Patch != "" {
			diffBuilder += fmt.Sprintf("--- a/%s\n+++ b/%s\n%s\n", f.Filename, f.Filename, f.Patch)
		}
	}

	return diffBuilder, changedFiles, nil
}
