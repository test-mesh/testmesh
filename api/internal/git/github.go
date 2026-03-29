package git

import (
	"bytes"
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

// setGitHubHeaders sets common GitHub API headers on a request
func (p *GitHubProvider) setGitHubHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if p.token != "" {
		req.Header.Set("Authorization", "token "+p.token)
	}
}

// CreatePRComment creates a comment on a pull request
func (p *GitHubProvider) CreatePRComment(ctx context.Context, repo string, prNumber int, body string) error {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments", repo, prNumber)

	payload, err := json.Marshal(map[string]string{"body": body})
	if err != nil {
		return fmt.Errorf("failed to marshal comment body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// CreateCommitStatus creates a status check on a commit
func (p *GitHubProvider) CreateCommitStatus(ctx context.Context, repo, sha string, status CommitStatus) error {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/statuses/%s", repo, sha)

	payload, err := json.Marshal(map[string]string{
		"state":       status.State,
		"context":     status.Context,
		"description": status.Description,
		"target_url":  status.TargetURL,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal status body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// CreatePullRequest creates a new pull request
func (p *GitHubProvider) CreatePullRequest(ctx context.Context, repo string, pr PullRequestCreate) (*PullRequest, error) {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/pulls", repo)

	payload, err := json.Marshal(map[string]string{
		"title": pr.Title,
		"body":  pr.Body,
		"head":  pr.Head,
		"base":  pr.Base,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal PR body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result PullRequest
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse GitHub PR response: %w", err)
	}

	return &result, nil
}

// CreateBranch creates a new branch from a given SHA
func (p *GitHubProvider) CreateBranch(ctx context.Context, repo, branchName, fromSHA string) error {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/git/refs", repo)

	payload, err := json.Marshal(map[string]string{
		"ref": "refs/heads/" + branchName,
		"sha": fromSHA,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal branch body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// PushFileChanges atomically pushes file changes to a branch using the Git Data API
func (p *GitHubProvider) PushFileChanges(ctx context.Context, repo, branch, message string, changes []FileChange) (string, error) {
	// Step 1: Get current commit SHA for the branch
	refURL := fmt.Sprintf("https://api.github.com/repos/%s/git/ref/heads/%s", repo, branch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, refURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var refResp struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.Unmarshal(body, &refResp); err != nil {
		return "", fmt.Errorf("failed to parse ref response: %w", err)
	}
	currentCommitSHA := refResp.Object.SHA

	// Step 2: Get the tree SHA from the current commit
	commitURL := fmt.Sprintf("https://api.github.com/repos/%s/git/commits/%s", repo, currentCommitSHA)
	req, err = http.NewRequestWithContext(ctx, http.MethodGet, commitURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp2.Body.Close()

	body, err = io.ReadAll(resp2.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	if resp2.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d: %s", resp2.StatusCode, string(body))
	}

	var commitResp struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(body, &commitResp); err != nil {
		return "", fmt.Errorf("failed to parse commit response: %w", err)
	}
	baseTreeSHA := commitResp.Tree.SHA

	// Step 3: Create blobs for each file change
	type treeEntry struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
		Type string `json:"type"`
		SHA  string `json:"sha"`
	}
	var treeEntries []treeEntry

	for _, change := range changes {
		blobURL := fmt.Sprintf("https://api.github.com/repos/%s/git/blobs", repo)
		blobPayload, err := json.Marshal(map[string]string{
			"content":  change.Content,
			"encoding": "utf-8",
		})
		if err != nil {
			return "", fmt.Errorf("failed to marshal blob body: %w", err)
		}

		req, err = http.NewRequestWithContext(ctx, http.MethodPost, blobURL, bytes.NewReader(blobPayload))
		if err != nil {
			return "", fmt.Errorf("failed to create request: %w", err)
		}
		p.setGitHubHeaders(req)

		blobResp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("GitHub API request failed: %w", err)
		}
		defer blobResp.Body.Close()

		blobBody, err := io.ReadAll(blobResp.Body)
		if err != nil {
			return "", fmt.Errorf("failed to read response: %w", err)
		}
		if blobResp.StatusCode != http.StatusCreated {
			return "", fmt.Errorf("GitHub API returned %d: %s", blobResp.StatusCode, string(blobBody))
		}

		var blobResult struct {
			SHA string `json:"sha"`
		}
		if err := json.Unmarshal(blobBody, &blobResult); err != nil {
			return "", fmt.Errorf("failed to parse blob response: %w", err)
		}

		treeEntries = append(treeEntries, treeEntry{
			Path: change.Path,
			Mode: "100644",
			Type: "blob",
			SHA:  blobResult.SHA,
		})
	}

	// Step 4: Create a new tree
	treeURL := fmt.Sprintf("https://api.github.com/repos/%s/git/trees", repo)
	treePayload, err := json.Marshal(map[string]interface{}{
		"base_tree": baseTreeSHA,
		"tree":      treeEntries,
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal tree body: %w", err)
	}

	req, err = http.NewRequestWithContext(ctx, http.MethodPost, treeURL, bytes.NewReader(treePayload))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	treeResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer treeResp.Body.Close()

	treeBody, err := io.ReadAll(treeResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	if treeResp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub API returned %d: %s", treeResp.StatusCode, string(treeBody))
	}

	var treeResult struct {
		SHA string `json:"sha"`
	}
	if err := json.Unmarshal(treeBody, &treeResult); err != nil {
		return "", fmt.Errorf("failed to parse tree response: %w", err)
	}

	// Step 5: Create a new commit
	newCommitURL := fmt.Sprintf("https://api.github.com/repos/%s/git/commits", repo)
	newCommitPayload, err := json.Marshal(map[string]interface{}{
		"message": message,
		"tree":    treeResult.SHA,
		"parents": []string{currentCommitSHA},
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal commit body: %w", err)
	}

	req, err = http.NewRequestWithContext(ctx, http.MethodPost, newCommitURL, bytes.NewReader(newCommitPayload))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	newCommitResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer newCommitResp.Body.Close()

	newCommitBody, err := io.ReadAll(newCommitResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	if newCommitResp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub API returned %d: %s", newCommitResp.StatusCode, string(newCommitBody))
	}

	var newCommitResult struct {
		SHA string `json:"sha"`
	}
	if err := json.Unmarshal(newCommitBody, &newCommitResult); err != nil {
		return "", fmt.Errorf("failed to parse commit response: %w", err)
	}

	// Step 6: Update the branch reference to point to the new commit
	updateRefURL := fmt.Sprintf("https://api.github.com/repos/%s/git/refs/heads/%s", repo, branch)
	updateRefPayload, err := json.Marshal(map[string]string{
		"sha": newCommitResult.SHA,
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal ref update body: %w", err)
	}

	req, err = http.NewRequestWithContext(ctx, http.MethodPatch, updateRefURL, bytes.NewReader(updateRefPayload))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	p.setGitHubHeaders(req)

	updateResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer updateResp.Body.Close()

	if updateResp.StatusCode != http.StatusOK {
		updateBody, _ := io.ReadAll(updateResp.Body)
		return "", fmt.Errorf("GitHub API returned %d: %s", updateResp.StatusCode, string(updateBody))
	}

	return newCommitResult.SHA, nil
}
