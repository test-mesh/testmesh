package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// Provider defines the interface for AI providers
type Provider interface {
	// Name returns the provider identifier
	Name() models.AIProviderType

	// Generate sends a prompt and returns generated text
	Generate(ctx context.Context, request GenerateRequest) (*GenerateResponse, error)

	// IsConfigured returns true if the provider has valid credentials
	IsConfigured() bool
}

// GenerateRequest represents a request to generate text
type GenerateRequest struct {
	Prompt       string
	SystemPrompt string
	MaxTokens    int
	Temperature  float64
	Model        string
}

// GenerateResponse represents the response from an AI provider
type GenerateResponse struct {
	Content      string
	Model        string
	TokensUsed   int
	LatencyMs    int64
	FinishReason string
}

// ProviderConfig holds configuration for AI providers
type ProviderConfig struct {
	AnthropicAPIKey string
	OpenAIAPIKey    string
	LocalEndpoint   string
	DefaultModel    string
	Timeout         time.Duration
}

// ----- Anthropic Provider -----

// AnthropicProvider implements Provider for Anthropic's Claude API
type AnthropicProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
	logger  *zap.Logger
}

// NewAnthropicProvider creates a new Anthropic provider
func NewAnthropicProvider(apiKey string, logger *zap.Logger) *AnthropicProvider {
	return &AnthropicProvider{
		apiKey:  apiKey,
		baseURL: "https://api.anthropic.com/v1",
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
		logger: logger,
	}
}

func (p *AnthropicProvider) Name() models.AIProviderType {
	return models.AIProviderAnthropic
}

func (p *AnthropicProvider) IsConfigured() bool {
	return p.apiKey != ""
}

func (p *AnthropicProvider) Generate(ctx context.Context, request GenerateRequest) (*GenerateResponse, error) {
	if !p.IsConfigured() {
		return nil, fmt.Errorf("anthropic API key not configured")
	}

	start := time.Now()

	model := request.Model
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}

	maxTokens := request.MaxTokens
	if maxTokens == 0 {
		maxTokens = 4096
	}

	temperature := request.Temperature
	if temperature == 0 {
		temperature = 0.7
	}

	// Build request body
	reqBody := map[string]interface{}{
		"model":      model,
		"max_tokens": maxTokens,
		"messages": []map[string]string{
			{"role": "user", "content": request.Prompt},
		},
	}

	if request.SystemPrompt != "" {
		reqBody["system"] = request.SystemPrompt
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Model   string `json:"model"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
		Usage      struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	content := ""
	if len(result.Content) > 0 {
		content = result.Content[0].Text
	}

	return &GenerateResponse{
		Content:      content,
		Model:        result.Model,
		TokensUsed:   result.Usage.InputTokens + result.Usage.OutputTokens,
		LatencyMs:    time.Since(start).Milliseconds(),
		FinishReason: result.StopReason,
	}, nil
}

// ----- OpenAI Provider -----

// OpenAIProvider implements Provider for OpenAI's API
type OpenAIProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
	logger  *zap.Logger
}

// NewOpenAIProvider creates a new OpenAI provider
func NewOpenAIProvider(apiKey string, logger *zap.Logger) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: "https://api.openai.com/v1",
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
		logger: logger,
	}
}

func (p *OpenAIProvider) Name() models.AIProviderType {
	return models.AIProviderOpenAI
}

func (p *OpenAIProvider) IsConfigured() bool {
	return p.apiKey != ""
}

func (p *OpenAIProvider) Generate(ctx context.Context, request GenerateRequest) (*GenerateResponse, error) {
	if !p.IsConfigured() {
		return nil, fmt.Errorf("openai API key not configured")
	}

	start := time.Now()

	model := request.Model
	if model == "" {
		model = "gpt-4o"
	}

	maxTokens := request.MaxTokens
	if maxTokens == 0 {
		maxTokens = 4096
	}

	temperature := request.Temperature
	if temperature == 0 {
		temperature = 0.7
	}

	// Build messages
	messages := []map[string]string{}
	if request.SystemPrompt != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": request.SystemPrompt,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": request.Prompt,
	})

	reqBody := map[string]interface{}{
		"model":       model,
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"messages":    messages,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	content := ""
	finishReason := ""
	if len(result.Choices) > 0 {
		content = result.Choices[0].Message.Content
		finishReason = result.Choices[0].FinishReason
	}

	return &GenerateResponse{
		Content:      content,
		Model:        result.Model,
		TokensUsed:   result.Usage.TotalTokens,
		LatencyMs:    time.Since(start).Milliseconds(),
		FinishReason: finishReason,
	}, nil
}

// ----- Local Provider -----

// LocalProvider implements Provider for local/self-hosted LLM endpoints
type LocalProvider struct {
	endpoint string
	client   *http.Client
	logger   *zap.Logger
}

// NewLocalProvider creates a new local provider (e.g., for Ollama, vLLM)
func NewLocalProvider(endpoint string, logger *zap.Logger) *LocalProvider {
	return &LocalProvider{
		endpoint: endpoint,
		client: &http.Client{
			Timeout: 300 * time.Second,
		},
		logger: logger,
	}
}

func (p *LocalProvider) Name() models.AIProviderType {
	return models.AIProviderLocal
}

func (p *LocalProvider) IsConfigured() bool {
	return p.endpoint != ""
}

func (p *LocalProvider) Generate(ctx context.Context, request GenerateRequest) (*GenerateResponse, error) {
	if !p.IsConfigured() {
		return nil, fmt.Errorf("local endpoint not configured")
	}

	start := time.Now()

	model := request.Model
	if model == "" {
		model = "llama3.1"
	}

	// Using OpenAI-compatible API format (common for local LLMs)
	messages := []map[string]string{}
	if request.SystemPrompt != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": request.SystemPrompt,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": request.Prompt,
	})

	reqBody := map[string]interface{}{
		"model":    model,
		"messages": messages,
		"stream":   false,
	}

	if request.MaxTokens > 0 {
		reqBody["max_tokens"] = request.MaxTokens
	}
	if request.Temperature > 0 {
		reqBody["temperature"] = request.Temperature
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/v1/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	content := ""
	finishReason := ""
	if len(result.Choices) > 0 {
		content = result.Choices[0].Message.Content
		finishReason = result.Choices[0].FinishReason
	}

	return &GenerateResponse{
		Content:      content,
		Model:        result.Model,
		TokensUsed:   result.Usage.TotalTokens,
		LatencyMs:    time.Since(start).Milliseconds(),
		FinishReason: finishReason,
	}, nil
}

// ----- Provider Manager -----

// ProviderManager manages multiple AI providers
type ProviderManager struct {
	providers map[models.AIProviderType]Provider
	primary   models.AIProviderType
	logger    *zap.Logger
}

// NewProviderManager creates a new provider manager
func NewProviderManager(config ProviderConfig, logger *zap.Logger) *ProviderManager {
	pm := &ProviderManager{
		providers: make(map[models.AIProviderType]Provider),
		logger:    logger,
	}

	// Initialize providers
	if config.AnthropicAPIKey != "" {
		pm.providers[models.AIProviderAnthropic] = NewAnthropicProvider(config.AnthropicAPIKey, logger)
		pm.primary = models.AIProviderAnthropic
	}

	if config.OpenAIAPIKey != "" {
		pm.providers[models.AIProviderOpenAI] = NewOpenAIProvider(config.OpenAIAPIKey, logger)
		if pm.primary == "" {
			pm.primary = models.AIProviderOpenAI
		}
	}

	if config.LocalEndpoint != "" {
		pm.providers[models.AIProviderLocal] = NewLocalProvider(config.LocalEndpoint, logger)
		if pm.primary == "" {
			pm.primary = models.AIProviderLocal
		}
	}

	return pm
}

// GetProvider returns a specific provider
func (pm *ProviderManager) GetProvider(name models.AIProviderType) (Provider, error) {
	p, ok := pm.providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %s not found", name)
	}
	if !p.IsConfigured() {
		return nil, fmt.Errorf("provider %s not configured", name)
	}
	return p, nil
}

// GetPrimaryProvider returns the primary configured provider
func (pm *ProviderManager) GetPrimaryProvider() (Provider, error) {
	if pm.primary == "" {
		return nil, fmt.Errorf("no AI provider configured")
	}
	return pm.GetProvider(pm.primary)
}

// ListProviders returns all configured providers
func (pm *ProviderManager) ListProviders() []models.AIProviderType {
	var result []models.AIProviderType
	for name, p := range pm.providers {
		if p.IsConfigured() {
			result = append(result, name)
		}
	}
	return result
}

// IntegrationData is a minimal interface to avoid circular dependencies
type IntegrationData struct {
	Provider string
	Config   IntegrationConfig
	Secrets  map[string]string
}

// IntegrationConfig holds integration configuration
type IntegrationConfig struct {
	Model       string
	Endpoint    string
	Temperature float64
	MaxTokens   int
}

// IntegrationProvider interface to avoid circular dependency with repository package
type IntegrationProvider interface {
	GetAIIntegrations() ([]*IntegrationData, error)
}

// ReloadFromDatabase reloads AI providers from the database integrations
// This allows dynamic configuration of AI providers without restart
func (pm *ProviderManager) ReloadFromDatabase(repo IntegrationProvider) error {
	pm.logger.Info("Reloading AI providers from database")

	// Get all active AI provider integrations
	integrations, err := repo.GetAIIntegrations()
	if err != nil {
		pm.logger.Warn("Failed to load AI integrations from database", zap.Error(err))
		return err
	}

	// Clear existing providers
	pm.providers = make(map[models.AIProviderType]Provider)
	pm.primary = ""

	// Load each integration
	for _, integration := range integrations {
		apiKey := integration.Secrets["api_key"]

		var provider Provider
		var providerType models.AIProviderType

		switch integration.Provider {
		case "openai":
			provider = NewOpenAIProvider(apiKey, pm.logger)
			providerType = models.AIProviderOpenAI
		case "anthropic":
			provider = NewAnthropicProvider(apiKey, pm.logger)
			providerType = models.AIProviderAnthropic
		case "local":
			endpoint := integration.Config.Endpoint
			if endpoint == "" {
				pm.logger.Warn("Local provider missing endpoint, skipping")
				continue
			}
			provider = NewLocalProvider(endpoint, pm.logger)
			providerType = models.AIProviderLocal
		default:
			pm.logger.Warn("Unknown AI provider", zap.String("provider", integration.Provider))
			continue
		}

		if provider.IsConfigured() {
			pm.providers[providerType] = provider
			// Set first configured provider as primary
			if pm.primary == "" {
				pm.primary = providerType
			}
			pm.logger.Info("Loaded AI provider", zap.String("provider", string(providerType)))
		}
	}

	if len(pm.providers) == 0 {
		pm.logger.Warn("No AI providers configured in database")
	}

	return nil
}
