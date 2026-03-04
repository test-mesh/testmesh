package contracts

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Generator generates Pact contracts from HTTP interactions
type Generator struct {
	repo   *repository.ContractRepository
	logger *zap.Logger
}

// NewGenerator creates a new contract generator
func NewGenerator(repo *repository.ContractRepository, logger *zap.Logger) *Generator {
	return &Generator{
		repo:   repo,
		logger: logger,
	}
}

// GenerateFromExecution generates a contract from an execution's HTTP interactions
func (g *Generator) GenerateFromExecution(consumer, provider, version string, flowID uuid.UUID, steps []models.ExecutionStep) (*models.Contract, error) {
	// Extract HTTP interactions from steps
	interactions := make([]models.Interaction, 0)

	for _, step := range steps {
		if step.Action == "http_request" && step.Status == models.StepStatusCompleted {
			interaction, err := g.convertStepToInteraction(step)
			if err != nil {
				g.logger.Warn("Failed to convert step to interaction",
					zap.String("step_id", step.StepID),
					zap.Error(err),
				)
				continue
			}
			interactions = append(interactions, *interaction)
		}
	}

	if len(interactions) == 0 {
		return nil, fmt.Errorf("no HTTP interactions found in execution")
	}

	// Create contract
	contractData := models.ContractData{
		Consumer: models.ConsumerInfo{Name: consumer},
		Provider: models.ProviderInfo{Name: provider},
		Interactions: []models.Interaction{}, // Will be added separately
		Metadata: models.Metadata{
			PactSpecification: models.PactSpecification{Version: "4.0"},
			Client: models.ClientInfo{
				Name:    "TestMesh",
				Version: "1.0.0",
			},
		},
	}

	contract := &models.Contract{
		Consumer:     consumer,
		Provider:     provider,
		Version:      version,
		PactVersion:  "4.0",
		ContractData: contractData,
		FlowID:       &flowID,
	}

	// Create contract in database
	if err := g.repo.CreateContract(contract); err != nil {
		return nil, fmt.Errorf("failed to create contract: %w", err)
	}

	// Create interactions
	for i := range interactions {
		interactions[i].ContractID = contract.ID
		if err := g.repo.CreateInteraction(&interactions[i]); err != nil {
			g.logger.Error("Failed to create interaction", zap.Error(err))
		}
	}

	g.logger.Info("Contract generated",
		zap.String("consumer", consumer),
		zap.String("provider", provider),
		zap.String("version", version),
		zap.Int("interactions", len(interactions)),
	)

	return contract, nil
}

// convertStepToInteraction converts an execution step to a Pact interaction
func (g *Generator) convertStepToInteraction(step models.ExecutionStep) (*models.Interaction, error) {
	// Extract request from step output
	request, err := g.extractRequest(step)
	if err != nil {
		return nil, fmt.Errorf("failed to extract request: %w", err)
	}

	// Extract response from step output
	response, err := g.extractResponse(step)
	if err != nil {
		return nil, fmt.Errorf("failed to extract response: %w", err)
	}

	interaction := &models.Interaction{
		Description:     step.StepName,
		Request:         *request,
		Response:        *response,
		InteractionType: "http",
	}

	return interaction, nil
}

// extractRequest extracts HTTP request details from step output
func (g *Generator) extractRequest(step models.ExecutionStep) (*models.HTTPRequest, error) {
	// The step output should contain the original request details
	// This would be captured by a modified HTTP handler that records requests

	// For now, we'll use a simplified extraction
	// In a production implementation, you'd enhance the HTTP handler to capture full request details

	request := &models.HTTPRequest{
		Method:  "GET", // Default, should be captured from actual request
		Path:    "/",   // Default, should be captured from actual request
		Headers: make(map[string]interface{}),
		Query:   make(map[string]interface{}),
	}

	// Try to extract from step output if available
	if method, ok := step.Output["request_method"].(string); ok {
		request.Method = method
	}
	if path, ok := step.Output["request_path"].(string); ok {
		request.Path = path
	}
	if headers, ok := step.Output["request_headers"].(map[string]interface{}); ok {
		request.Headers = headers
	}
	if body, ok := step.Output["request_body"]; ok {
		request.Body = body
	}

	return request, nil
}

// extractResponse extracts HTTP response details from step output
func (g *Generator) extractResponse(step models.ExecutionStep) (*models.HTTPResponse, error) {
	response := &models.HTTPResponse{
		Status:  200,
		Headers: make(map[string]interface{}),
	}

	// Extract status code
	if status, ok := step.Output["status"].(float64); ok {
		response.Status = int(status)
	} else if status, ok := step.Output["status"].(int); ok {
		response.Status = status
	}

	// Extract headers
	if headers, ok := step.Output["headers"].(map[string]interface{}); ok {
		response.Headers = headers
	}

	// Extract body
	if body, ok := step.Output["body"]; ok {
		response.Body = body
	}

	return response, nil
}

// GenerateFromManualInteractions generates a contract from manually defined interactions
func (g *Generator) GenerateFromManualInteractions(consumer, provider, version string, interactions []models.Interaction) (*models.Contract, error) {
	contractData := models.ContractData{
		Consumer:     models.ConsumerInfo{Name: consumer},
		Provider:     models.ProviderInfo{Name: provider},
		Interactions: []models.Interaction{},
		Metadata: models.Metadata{
			PactSpecification: models.PactSpecification{Version: "4.0"},
			Client: models.ClientInfo{
				Name:    "TestMesh",
				Version: "1.0.0",
			},
		},
	}

	contract := &models.Contract{
		Consumer:     consumer,
		Provider:     provider,
		Version:      version,
		PactVersion:  "4.0",
		ContractData: contractData,
	}

	// Create contract
	if err := g.repo.CreateContract(contract); err != nil {
		return nil, fmt.Errorf("failed to create contract: %w", err)
	}

	// Create interactions
	for i := range interactions {
		interactions[i].ContractID = contract.ID
		if err := g.repo.CreateInteraction(&interactions[i]); err != nil {
			return nil, fmt.Errorf("failed to create interaction: %w", err)
		}
	}

	g.logger.Info("Contract generated from manual interactions",
		zap.String("consumer", consumer),
		zap.String("provider", provider),
		zap.Int("interactions", len(interactions)),
	)

	return contract, nil
}

// ExportToPactJSON exports a contract to Pact JSON format
func (g *Generator) ExportToPactJSON(contractID uuid.UUID) ([]byte, error) {
	contract, err := g.repo.GetContractByID(contractID)
	if err != nil {
		return nil, fmt.Errorf("contract not found: %w", err)
	}

	interactions, err := g.repo.ListInteractions(contractID)
	if err != nil {
		return nil, fmt.Errorf("failed to load interactions: %w", err)
	}

	// Build Pact-compatible structure
	pactInteractions := make([]map[string]interface{}, len(interactions))
	for i, interaction := range interactions {
		pactInteractions[i] = map[string]interface{}{
			"description":    interaction.Description,
			"providerState":  interaction.ProviderState,
			"request": map[string]interface{}{
				"method":  interaction.Request.Method,
				"path":    interaction.Request.Path,
				"headers": interaction.Request.Headers,
				"query":   interaction.Request.Query,
				"body":    interaction.Request.Body,
			},
			"response": map[string]interface{}{
				"status":  interaction.Response.Status,
				"headers": interaction.Response.Headers,
				"body":    interaction.Response.Body,
			},
		}
	}

	pactDoc := map[string]interface{}{
		"consumer": map[string]interface{}{
			"name": contract.Consumer,
		},
		"provider": map[string]interface{}{
			"name": contract.Provider,
		},
		"interactions": pactInteractions,
		"metadata": map[string]interface{}{
			"pactSpecification": map[string]interface{}{
				"version": contract.PactVersion,
			},
			"client": map[string]interface{}{
				"name":    "TestMesh",
				"version": "1.0.0",
			},
		},
	}

	return json.MarshalIndent(pactDoc, "", "  ")
}

// ImportFromPactJSON imports a contract from Pact JSON format
func (g *Generator) ImportFromPactJSON(pactJSON []byte) (*models.Contract, error) {
	var pactDoc map[string]interface{}
	if err := json.Unmarshal(pactJSON, &pactDoc); err != nil {
		return nil, fmt.Errorf("invalid Pact JSON: %w", err)
	}

	// Extract consumer and provider
	consumer := pactDoc["consumer"].(map[string]interface{})["name"].(string)
	provider := pactDoc["provider"].(map[string]interface{})["name"].(string)

	// Generate version from timestamp
	version := fmt.Sprintf("imported-%d", time.Now().Unix())

	// Extract interactions
	pactInteractions := pactDoc["interactions"].([]interface{})
	interactions := make([]models.Interaction, len(pactInteractions))

	for i, pi := range pactInteractions {
		pactInt := pi.(map[string]interface{})

		reqMap := pactInt["request"].(map[string]interface{})
		respMap := pactInt["response"].(map[string]interface{})

		interactions[i] = models.Interaction{
			Description: pactInt["description"].(string),
			Request: models.HTTPRequest{
				Method:  reqMap["method"].(string),
				Path:    reqMap["path"].(string),
				Headers: getMapOrEmpty(reqMap, "headers"),
				Query:   getMapOrEmpty(reqMap, "query"),
				Body:    reqMap["body"],
			},
			Response: models.HTTPResponse{
				Status:  int(respMap["status"].(float64)),
				Headers: getMapOrEmpty(respMap, "headers"),
				Body:    respMap["body"],
			},
			InteractionType: "http",
		}

		if providerState, ok := pactInt["providerState"].(string); ok {
			interactions[i].ProviderState = providerState
		}
	}

	return g.GenerateFromManualInteractions(consumer, provider, version, interactions)
}

// getMapOrEmpty safely extracts a map or returns empty map
func getMapOrEmpty(m map[string]interface{}, key string) map[string]interface{} {
	if val, ok := m[key].(map[string]interface{}); ok {
		return val
	}
	return make(map[string]interface{})
}
