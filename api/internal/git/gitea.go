package git

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
)

// GiteaProvider fetches diffs from a Gitea instance
type GiteaProvider struct {
	token   string
	baseURL string
}

// NewGiteaProvider creates a new Gitea diff provider
func NewGiteaProvider(integration *models.SystemIntegration) *GiteaProvider {
	baseURL := integration.Config.BaseURL
	// Normalize: strip trailing slash
	baseURL = strings.TrimRight(baseURL, "/")
	if baseURL == "" {
		baseURL = "https://gitea.com"
	}
	return &GiteaProvider{
		token:   integration.Secrets["access_token"],
		baseURL: baseURL,
	}
}

// Name returns the provider name
func (p *GiteaProvider) Name() string {
	return "gitea"
}

// ListRepositories lists repositories accessible via the PAT
func (p *GiteaProvider) ListRepositories(ctx context.Context, search string) ([]Repository, error) {
	apiURL := fmt.Sprintf("%s/api/v1/repos/search?limit=50&sort=newest", p.baseURL)
	if search != "" {
		apiURL += "&q=" + search
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.token != "" {
		req.Header.Set("Authorization", "token "+p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Gitea API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gitea API returned %d: %s", resp.StatusCode, string(body))
	}

	var searchResp struct {
		Data []struct {
			FullName    string `json:"full_name"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Private     bool   `json:"private"`
			HTMLURL     string `json:"html_url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to parse Gitea repos response: %w", err)
	}

	result := make([]Repository, len(searchResp.Data))
	for i, r := range searchResp.Data {
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

// FetchDiff fetches a diff between two commits using the Gitea compare API
func (p *GiteaProvider) FetchDiff(ctx context.Context, repo, beforeSHA, afterSHA string) (string, []string, error) {
	// Gitea compare endpoint: GET /repos/{owner}/{repo}/compare/{base}...{head}
	url := fmt.Sprintf("%s/api/v1/repos/%s/compare/%s...%s", p.baseURL, repo, beforeSHA, afterSHA)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.token != "" {
		req.Header.Set("Authorization", "token "+p.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("Gitea API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("Gitea API returned %d: %s", resp.StatusCode, string(body))
	}

	var compareResp struct {
		Files []struct {
			Filename string `json:"filename"`
			Patch    string `json:"patch"`
		} `json:"files"`
		Diff string `json:"diff"`
	}
	if err := json.Unmarshal(body, &compareResp); err != nil {
		return "", nil, fmt.Errorf("failed to parse Gitea compare response: %w", err)
	}

	// Gitea may return a raw diff string or structured files
	if compareResp.Diff != "" {
		// Extract changed files from raw diff headers
		var changedFiles []string
		seen := map[string]bool{}
		for _, line := range strings.Split(compareResp.Diff, "\n") {
			if strings.HasPrefix(line, "+++ b/") {
				filename := strings.TrimPrefix(line, "+++ b/")
				if !seen[filename] {
					seen[filename] = true
					changedFiles = append(changedFiles, filename)
				}
			}
		}
		return compareResp.Diff, changedFiles, nil
	}

	// Structured files response
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

// CreatePRComment is not supported by the Gitea provider
func (p *GiteaProvider) CreatePRComment(ctx context.Context, repo string, prNumber int, body string) error {
	return ErrNotSupported
}

// CreateCommitStatus is not supported by the Gitea provider
func (p *GiteaProvider) CreateCommitStatus(ctx context.Context, repo, sha string, status CommitStatus) error {
	return ErrNotSupported
}

// CreatePullRequest is not supported by the Gitea provider
func (p *GiteaProvider) CreatePullRequest(ctx context.Context, repo string, pr PullRequestCreate) (*PullRequest, error) {
	return nil, ErrNotSupported
}

// CreateBranch is not supported by the Gitea provider
func (p *GiteaProvider) CreateBranch(ctx context.Context, repo, branchName, fromSHA string) error {
	return ErrNotSupported
}

// PushFileChanges is not supported by the Gitea provider
func (p *GiteaProvider) PushFileChanges(ctx context.Context, repo, branch, message string, changes []FileChange) (string, error) {
	return "", ErrNotSupported
}
