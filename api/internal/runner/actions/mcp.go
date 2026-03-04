package actions

import (
	"context"
	"fmt"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/mcp"
)

// MCPActionConfig defines configuration for MCP actions
type MCPActionConfig struct {
	Server    string                 `yaml:"server" json:"server"`
	APIKey    string                 `yaml:"api_key,omitempty" json:"api_key,omitempty"`
	Tool      string                 `yaml:"tool" json:"tool"`
	Arguments map[string]interface{} `yaml:"arguments,omitempty" json:"arguments,omitempty"`
	Timeout   string                 `yaml:"timeout,omitempty" json:"timeout,omitempty"`
}

// MCPActionResult holds the result of an MCP action
type MCPActionResult struct {
	Success  bool                   `json:"success"`
	Tool     string                 `json:"tool"`
	Content  []map[string]string    `json:"content"`
	Duration int64                  `json:"duration_ms"`
	Error    string                 `json:"error,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// MCPAction handles MCP tool invocations
type MCPAction struct {
	clients map[string]*mcp.Client
}

// NewMCPAction creates a new MCP action handler
func NewMCPAction() *MCPAction {
	return &MCPAction{
		clients: make(map[string]*mcp.Client),
	}
}

// Execute executes an MCP action
func (a *MCPAction) Execute(ctx context.Context, config *MCPActionConfig) (*MCPActionResult, error) {
	start := time.Now()
	result := &MCPActionResult{
		Tool:     config.Tool,
		Content:  make([]map[string]string, 0),
		Metadata: make(map[string]interface{}),
	}

	// Parse timeout
	timeout := 30 * time.Second
	if config.Timeout != "" {
		if parsed, err := time.ParseDuration(config.Timeout); err == nil {
			timeout = parsed
		}
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Get or create client
	client := a.getClient(config.Server, config.APIKey)

	// Call tool
	toolResult, err := client.CallTool(ctx, config.Tool, config.Arguments)
	if err != nil {
		result.Error = err.Error()
		result.Duration = time.Since(start).Milliseconds()
		return result, err
	}

	// Process result
	for _, block := range toolResult.Content {
		content := map[string]string{
			"type": block.Type,
		}
		if block.Text != "" {
			content["text"] = block.Text
		}
		if block.Data != "" {
			content["data"] = block.Data
		}
		result.Content = append(result.Content, content)
	}

	result.Success = !toolResult.IsError
	result.Duration = time.Since(start).Milliseconds()

	if toolResult.IsError {
		result.Error = "tool returned error"
	}

	return result, nil
}

// ListTools lists available tools from an MCP server
func (a *MCPAction) ListTools(ctx context.Context, serverURL, apiKey string) ([]mcp.Tool, error) {
	client := a.getClient(serverURL, apiKey)
	return client.ListTools(ctx)
}

// ListResources lists available resources from an MCP server
func (a *MCPAction) ListResources(ctx context.Context, serverURL, apiKey string) ([]mcp.Resource, error) {
	client := a.getClient(serverURL, apiKey)
	return client.ListResources(ctx)
}

// ReadResource reads a resource from an MCP server
func (a *MCPAction) ReadResource(ctx context.Context, serverURL, apiKey, uri string) (*mcp.ResourceContent, error) {
	client := a.getClient(serverURL, apiKey)
	return client.ReadResource(ctx, uri)
}

func (a *MCPAction) getClient(serverURL, apiKey string) *mcp.Client {
	key := serverURL + ":" + apiKey
	if client, ok := a.clients[key]; ok {
		return client
	}

	client := mcp.NewClient(&mcp.Config{
		ServerURL: serverURL,
		APIKey:    apiKey,
		Timeout:   30 * time.Second,
	})

	a.clients[key] = client
	return client
}

// MCPTestStep represents an MCP-based test step
type MCPTestStep struct {
	Name        string                 `yaml:"name" json:"name"`
	Description string                 `yaml:"description,omitempty" json:"description,omitempty"`
	Server      string                 `yaml:"server" json:"server"`
	Tool        string                 `yaml:"tool" json:"tool"`
	Arguments   map[string]interface{} `yaml:"arguments" json:"arguments"`
	Assertions  []MCPAssertion         `yaml:"assertions,omitempty" json:"assertions,omitempty"`
	Extract     map[string]string      `yaml:"extract,omitempty" json:"extract,omitempty"`
}

// MCPAssertion represents an assertion on MCP result
type MCPAssertion struct {
	Type     string      `yaml:"type" json:"type"` // "contains", "equals", "not_error"
	Path     string      `yaml:"path,omitempty" json:"path,omitempty"`
	Expected interface{} `yaml:"expected,omitempty" json:"expected,omitempty"`
}

// ExecuteTestStep executes an MCP test step with assertions
func (a *MCPAction) ExecuteTestStep(ctx context.Context, step *MCPTestStep) (*MCPActionResult, error) {
	config := &MCPActionConfig{
		Server:    step.Server,
		Tool:      step.Tool,
		Arguments: step.Arguments,
	}

	result, err := a.Execute(ctx, config)
	if err != nil {
		return result, err
	}

	// Run assertions
	for _, assertion := range step.Assertions {
		if err := a.checkAssertion(result, &assertion); err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("assertion failed: %v", err)
			return result, nil
		}
	}

	return result, nil
}

func (a *MCPAction) checkAssertion(result *MCPActionResult, assertion *MCPAssertion) error {
	switch assertion.Type {
	case "not_error":
		if !result.Success {
			return fmt.Errorf("expected success but got error: %s", result.Error)
		}
	case "contains":
		found := false
		for _, content := range result.Content {
			if text, ok := content["text"]; ok {
				if containsString(text, fmt.Sprintf("%v", assertion.Expected)) {
					found = true
					break
				}
			}
		}
		if !found {
			return fmt.Errorf("expected content to contain %v", assertion.Expected)
		}
	case "equals":
		// Check if any content block matches
		expectedStr := fmt.Sprintf("%v", assertion.Expected)
		found := false
		for _, content := range result.Content {
			if text, ok := content["text"]; ok && text == expectedStr {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("expected content to equal %v", assertion.Expected)
		}
	default:
		return fmt.Errorf("unknown assertion type: %s", assertion.Type)
	}
	return nil
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
