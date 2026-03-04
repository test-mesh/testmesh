package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client handles communication with MCP servers
type Client struct {
	serverURL  string
	apiKey     string
	httpClient *http.Client
}

// Config holds MCP client configuration
type Config struct {
	ServerURL string
	APIKey    string
	Timeout   time.Duration
}

// NewClient creates a new MCP client
func NewClient(config *Config) *Client {
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return &Client{
		serverURL: config.ServerURL,
		apiKey:    config.APIKey,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// Tool represents an MCP tool
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// ToolResult represents the result of a tool invocation
type ToolResult struct {
	Content []ContentBlock `json:"content"`
	IsError bool           `json:"isError"`
}

// ContentBlock represents a content block in tool result
type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	Data string `json:"data,omitempty"`
}

// ListTools lists available tools from the MCP server
func (c *Client) ListTools(ctx context.Context) ([]Tool, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "tools/list",
		"id":      1,
	}

	var resp struct {
		Result struct {
			Tools []Tool `json:"tools"`
		} `json:"result"`
		Error *RPCError `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	return resp.Result.Tools, nil
}

// CallTool invokes a tool on the MCP server
func (c *Client) CallTool(ctx context.Context, name string, arguments map[string]interface{}) (*ToolResult, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "tools/call",
		"id":      1,
		"params": map[string]interface{}{
			"name":      name,
			"arguments": arguments,
		},
	}

	var resp struct {
		Result *ToolResult `json:"result"`
		Error  *RPCError   `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	return resp.Result, nil
}

// Resource represents an MCP resource
type Resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// ResourceContent represents resource content
type ResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}

// ListResources lists available resources
func (c *Client) ListResources(ctx context.Context) ([]Resource, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "resources/list",
		"id":      1,
	}

	var resp struct {
		Result struct {
			Resources []Resource `json:"resources"`
		} `json:"result"`
		Error *RPCError `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	return resp.Result.Resources, nil
}

// ReadResource reads a resource
func (c *Client) ReadResource(ctx context.Context, uri string) (*ResourceContent, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "resources/read",
		"id":      1,
		"params": map[string]interface{}{
			"uri": uri,
		},
	}

	var resp struct {
		Result struct {
			Contents []ResourceContent `json:"contents"`
		} `json:"result"`
		Error *RPCError `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	if len(resp.Result.Contents) == 0 {
		return nil, fmt.Errorf("resource not found: %s", uri)
	}

	return &resp.Result.Contents[0], nil
}

// Prompt represents an MCP prompt
type Prompt struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Arguments   []PromptArgument `json:"arguments,omitempty"`
}

// PromptArgument represents a prompt argument
type PromptArgument struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// PromptMessage represents a prompt message
type PromptMessage struct {
	Role    string         `json:"role"`
	Content ContentBlock   `json:"content"`
}

// ListPrompts lists available prompts
func (c *Client) ListPrompts(ctx context.Context) ([]Prompt, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "prompts/list",
		"id":      1,
	}

	var resp struct {
		Result struct {
			Prompts []Prompt `json:"prompts"`
		} `json:"result"`
		Error *RPCError `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	return resp.Result.Prompts, nil
}

// GetPrompt gets a prompt with arguments
func (c *Client) GetPrompt(ctx context.Context, name string, arguments map[string]string) ([]PromptMessage, error) {
	req := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "prompts/get",
		"id":      1,
		"params": map[string]interface{}{
			"name":      name,
			"arguments": arguments,
		},
	}

	var resp struct {
		Result struct {
			Messages []PromptMessage `json:"messages"`
		} `json:"result"`
		Error *RPCError `json:"error"`
	}

	if err := c.call(ctx, req, &resp); err != nil {
		return nil, err
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
	}

	return resp.Result.Messages, nil
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (c *Client) call(ctx context.Context, request interface{}, response interface{}) error {
	body, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.serverURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server error: %s", string(respBody))
	}

	if err := json.Unmarshal(respBody, response); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	return nil
}
