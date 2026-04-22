package gitops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// CommitStatus values for Gitea's commit status API
type CommitStatus string

const (
	CommitStatusPending CommitStatus = "pending"
	CommitStatusSuccess CommitStatus = "success"
	CommitStatusFailure CommitStatus = "failure"
	CommitStatusError   CommitStatus = "error"
)

var commitStatusDescriptions = map[CommitStatus]string{
	CommitStatusPending: "TestMesh: tests running...",
	CommitStatusSuccess: "TestMesh: all tests passed",
	CommitStatusFailure: "TestMesh: tests failed",
	CommitStatusError:   "TestMesh: execution error",
}

// StatusReporter posts test results to Gitea commit status API.
// Gitea API: POST /api/v1/repos/{owner}/{repo}/statuses/{sha}
type StatusReporter struct {
	baseURL    string // e.g. "https://gitea.company.com"
	token      string // Gitea API token
	httpClient *http.Client
}

// NewStatusReporter creates a new StatusReporter with a 10s HTTP timeout.
func NewStatusReporter(baseURL, token string) *StatusReporter {
	return &StatusReporter{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// statusPayload is the JSON body sent to Gitea's commit status API.
type statusPayload struct {
	State       string `json:"state"`
	TargetURL   string `json:"target_url"`
	Description string `json:"description"`
	Context     string `json:"context"`
}

// Report posts a commit status to Gitea.
//
//	ownerRepo:        "owner/repo" e.g. "myorg/order-service"
//	sha:              commit SHA from the trigger event
//	status:           CommitStatus value
//	suiteName:        used as the "context" field e.g. "testmesh/smoke"
//	runID:            suite run UUID for the target URL
//	dashboardBaseURL: e.g. "https://testmesh.company.com"
func (r *StatusReporter) Report(ctx context.Context, ownerRepo, sha string, status CommitStatus, suiteName, runID, dashboardBaseURL string) error {
	description, ok := commitStatusDescriptions[status]
	if !ok {
		description = fmt.Sprintf("TestMesh: %s", status)
	}

	payload := statusPayload{
		State:       string(status),
		TargetURL:   fmt.Sprintf("%s/suite-runs/%s", dashboardBaseURL, runID),
		Description: description,
		Context:     fmt.Sprintf("testmesh/%s", suiteName),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("gitops: failed to marshal status payload: %w", err)
	}

	apiURL := fmt.Sprintf("%s/api/v1/repos/%s/statuses/%s", r.baseURL, ownerRepo, sha)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("gitops: failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "token "+r.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("gitops: failed to post commit status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gitops: Gitea commit status POST returned %d for %s@%s", resp.StatusCode, ownerRepo, sha)
	}

	return nil
}
