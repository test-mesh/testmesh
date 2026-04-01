package mcpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// APIClient handles HTTP calls to the TestMesh API.
type APIClient struct {
	baseURL    string
	httpClient *http.Client
}

func newAPIClient(baseURL string) *APIClient {
	return &APIClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *APIClient) do(method, path string, body any) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}
	return data, resp.StatusCode, nil
}

// ListWorkspaces returns all workspaces.
func (c *APIClient) ListWorkspaces() ([]map[string]any, error) {
	data, status, err := c.do("GET", "/api/v1/workspaces", nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result []map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		// Try wrapped format {"workspaces": [...]}
		var wrapped struct {
			Workspaces []map[string]any `json:"workspaces"`
		}
		if err2 := json.Unmarshal(data, &wrapped); err2 != nil {
			return nil, fmt.Errorf("failed to parse workspaces response: %w", err)
		}
		return wrapped.Workspaces, nil
	}
	return result, nil
}

// UploadFlow saves a flow YAML to a workspace. Returns the created flow's ID and name.
func (c *APIClient) UploadFlow(workspaceID, yamlContent string) (string, string, error) {
	body := map[string]string{"yaml": yamlContent}
	data, status, err := c.do("POST", fmt.Sprintf("/api/v1/workspaces/%s/flows", workspaceID), body)
	if err != nil {
		return "", "", err
	}
	if status != 200 && status != 201 {
		return "", "", fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return "", "", fmt.Errorf("failed to parse upload response: %w", err)
	}
	id, _ := result["id"].(string)
	name, _ := result["name"].(string)
	return id, name, nil
}

// ListFlows returns all flows in a workspace.
func (c *APIClient) ListFlows(workspaceID string) ([]map[string]any, error) {
	data, status, err := c.do("GET", fmt.Sprintf("/api/v1/workspaces/%s/flows", workspaceID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result []map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		var wrapped struct {
			Flows []map[string]any `json:"flows"`
		}
		if err2 := json.Unmarshal(data, &wrapped); err2 != nil {
			return nil, fmt.Errorf("failed to parse flows response: %w", err)
		}
		return wrapped.Flows, nil
	}
	return result, nil
}

// TriggerExecution starts a flow execution. Returns the execution ID.
func (c *APIClient) TriggerExecution(workspaceID, flowID, environment string, variables map[string]string) (string, error) {
	body := map[string]any{
		"flow_id": flowID,
	}
	if environment != "" {
		body["environment"] = environment
	}
	if len(variables) > 0 {
		body["variables"] = variables
	}

	data, status, err := c.do("POST", fmt.Sprintf("/api/v1/workspaces/%s/executions", workspaceID), body)
	if err != nil {
		return "", err
	}
	if status != 200 && status != 201 {
		return "", fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("failed to parse execution response: %w", err)
	}
	// Handle both "execution_id" and "id" field names
	if id, ok := result["execution_id"].(string); ok {
		return id, nil
	}
	if id, ok := result["id"].(string); ok {
		return id, nil
	}
	return "", fmt.Errorf("execution ID not found in response: %s", string(data))
}

// GetExecution returns the full execution result including step detail.
func (c *APIClient) GetExecution(executionID string) (map[string]any, error) {
	// Get summary
	sumData, status, err := c.do("GET", fmt.Sprintf("/api/v1/executions/%s", executionID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(sumData))
	}
	var summary map[string]any
	if err := json.Unmarshal(sumData, &summary); err != nil {
		return nil, fmt.Errorf("failed to parse execution: %w", err)
	}

	// Get step detail
	stepsData, stepsStatus, err := c.do("GET", fmt.Sprintf("/api/v1/executions/%s/steps", executionID), nil)
	if err == nil && stepsStatus == 200 {
		var steps any
		if err := json.Unmarshal(stepsData, &steps); err == nil {
			summary["steps_detail"] = steps
		}
	}

	return summary, nil
}

// GetCoverageGaps returns uncovered graph nodes for a workspace.
func (c *APIClient) GetCoverageGaps(workspaceID string) (map[string]any, error) {
	data, status, err := c.do("GET", fmt.Sprintf("/api/v1/workspaces/%s/graph/coverage", workspaceID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to parse coverage response: %w", err)
	}
	return result, nil
}
