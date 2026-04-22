package argocd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL:    baseURL,
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// appResponse is the minimal subset of the Argo CD Application GET response we need.
type appResponse struct {
	Status struct {
		Health struct {
			Status  string `json:"status"`
			Message string `json:"message"`
		} `json:"health"`
		Sync struct {
			Status string `json:"status"`
		} `json:"sync"`
	} `json:"status"`
}

// GetApp calls GET /api/v1/applications/{name}
func (c *Client) GetApp(ctx context.Context, appName string) (*appResponse, error) {
	url := fmt.Sprintf("%s/api/v1/applications/%s", c.baseURL, appName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("argocd app %q not found", appName)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("argocd: GET app %q returned %d", appName, resp.StatusCode)
	}

	var result appResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteApp calls DELETE /api/v1/applications/{name}?cascade=true
func (c *Client) DeleteApp(ctx context.Context, appName string) error {
	url := fmt.Sprintf("%s/api/v1/applications/%s?cascade=true", c.baseURL, appName)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("argocd: DELETE app %q returned %d", appName, resp.StatusCode)
	}
	return nil
}
