package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/runner/mocks"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// MockServerStartHandler handles mock server start actions
type MockServerStartHandler struct {
	manager *mocks.Manager
	logger  *zap.Logger
}

// NewMockServerStartHandler creates a new mock server start handler
func NewMockServerStartHandler(manager *mocks.Manager, logger *zap.Logger) *MockServerStartHandler {
	return &MockServerStartHandler{
		manager: manager,
		logger:  logger,
	}
}

// Execute starts a mock server
func (h *MockServerStartHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Extract configuration
	name, ok := config["name"].(string)
	if !ok {
		return nil, fmt.Errorf("name is required")
	}

	serverIDStr, _ := config["server_id"].(string)
	var serverID uuid.UUID
	var err error

	if serverIDStr != "" {
		serverID, err = uuid.Parse(serverIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid server_id: %w", err)
		}
	} else {
		serverID = uuid.New()
	}

	// Get execution ID from context (if available)
	var executionID *uuid.UUID
	if execIDVal := ctx.Value("execution_id"); execIDVal != nil {
		if execID, ok := execIDVal.(uuid.UUID); ok {
			executionID = &execID
		}
	}

	// Parse endpoints configuration
	endpointsConfig, ok := config["endpoints"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("endpoints configuration is required")
	}

	// Start the server
	if err := h.manager.StartServer(ctx, serverID, name, executionID); err != nil {
		return nil, fmt.Errorf("failed to start mock server: %w", err)
	}

	// Add endpoints
	for _, endpointConfig := range endpointsConfig {
		endpoint, err := h.parseEndpointConfig(serverID, endpointConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to parse endpoint config: %w", err)
		}

		if err := h.manager.AddEndpoint(serverID, endpoint); err != nil {
			return nil, fmt.Errorf("failed to add endpoint: %w", err)
		}
	}

	// Get server details
	server, err := h.manager.GetServer(serverID)
	if err != nil {
		return nil, fmt.Errorf("failed to get server: %w", err)
	}

	output := models.OutputData{
		"server_id": serverID.String(),
		"name":      name,
		"base_url":  server.BaseURL,
		"status":    "running",
	}

	h.logger.Info("Mock server started successfully",
		zap.String("server_id", serverID.String()),
		zap.String("name", name),
	)

	return output, nil
}

// parseEndpointConfig parses endpoint configuration
func (h *MockServerStartHandler) parseEndpointConfig(serverID uuid.UUID, config interface{}) (*models.MockEndpoint, error) {
	endpointMap, ok := config.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid endpoint configuration")
	}

	path, ok := endpointMap["path"].(string)
	if !ok {
		return nil, fmt.Errorf("path is required")
	}

	method, ok := endpointMap["method"].(string)
	if !ok {
		method = "GET"
	}

	// Parse response configuration
	responseConfig := models.ResponseConfig{
		StatusCode: 200,
	}

	if respConfig, ok := endpointMap["response"].(map[string]interface{}); ok {
		if statusCode, ok := respConfig["status_code"].(float64); ok {
			responseConfig.StatusCode = int(statusCode)
		} else if statusCode, ok := respConfig["status_code"].(int); ok {
			responseConfig.StatusCode = statusCode
		}

		if headers, ok := respConfig["headers"].(map[string]interface{}); ok {
			responseConfig.Headers = make(map[string]string)
			for k, v := range headers {
				responseConfig.Headers[k] = fmt.Sprintf("%v", v)
			}
		}

		if body, ok := respConfig["body"]; ok {
			responseConfig.Body = body
		}

		if bodyJSON, ok := respConfig["body_json"].(map[string]interface{}); ok {
			responseConfig.BodyJSON = bodyJSON
		}

		if bodyText, ok := respConfig["body_text"].(string); ok {
			responseConfig.BodyText = bodyText
		}

		if delayMs, ok := respConfig["delay_ms"].(float64); ok {
			responseConfig.DelayMs = int(delayMs)
		} else if delayMs, ok := respConfig["delay_ms"].(int); ok {
			responseConfig.DelayMs = delayMs
		}
	}

	// Parse match configuration
	matchConfig := models.MatchConfig{}
	if matchConfigMap, ok := endpointMap["match"].(map[string]interface{}); ok {
		if pathPattern, ok := matchConfigMap["path_pattern"].(string); ok {
			matchConfig.PathPattern = pathPattern
		}

		if headers, ok := matchConfigMap["headers"].(map[string]interface{}); ok {
			matchConfig.Headers = make(map[string]string)
			for k, v := range headers {
				matchConfig.Headers[k] = fmt.Sprintf("%v", v)
			}
		}

		if queryParams, ok := matchConfigMap["query_params"].(map[string]interface{}); ok {
			matchConfig.QueryParams = make(map[string]string)
			for k, v := range queryParams {
				matchConfig.QueryParams[k] = fmt.Sprintf("%v", v)
			}
		}

		if bodyPattern, ok := matchConfigMap["body_pattern"].(string); ok {
			matchConfig.BodyPattern = bodyPattern
		}

		if bodyJSON, ok := matchConfigMap["body_json"].(map[string]interface{}); ok {
			matchConfig.BodyJSON = bodyJSON
		}
	}

	// Parse state configuration
	var stateConfig *models.StateConfig
	if stateConfigMap, ok := endpointMap["state"].(map[string]interface{}); ok {
		stateConfig = &models.StateConfig{}

		if stateKey, ok := stateConfigMap["state_key"].(string); ok {
			stateConfig.StateKey = stateKey
		}

		if initialValue, ok := stateConfigMap["initial_value"]; ok {
			stateConfig.InitialValue = initialValue
		}

		if updateRule, ok := stateConfigMap["update_rule"].(string); ok {
			stateConfig.UpdateRule = updateRule
		}

		if updateValue, ok := stateConfigMap["update_value"]; ok {
			stateConfig.UpdateValue = updateValue
		}
	}

	priority := 0
	if p, ok := endpointMap["priority"].(float64); ok {
		priority = int(p)
	} else if p, ok := endpointMap["priority"].(int); ok {
		priority = p
	}

	endpoint := &models.MockEndpoint{
		MockServerID:   serverID,
		Path:           path,
		Method:         method,
		MatchConfig:    matchConfig,
		ResponseConfig: responseConfig,
		StateConfig:    stateConfig,
		Priority:       priority,
	}

	return endpoint, nil
}

// MockServerStopHandler handles mock server stop actions
type MockServerStopHandler struct {
	manager *mocks.Manager
	logger  *zap.Logger
}

// NewMockServerStopHandler creates a new mock server stop handler
func NewMockServerStopHandler(manager *mocks.Manager, logger *zap.Logger) *MockServerStopHandler {
	return &MockServerStopHandler{
		manager: manager,
		logger:  logger,
	}
}

// Execute stops a mock server
func (h *MockServerStopHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	serverIDStr, ok := config["server_id"].(string)
	if !ok {
		return nil, fmt.Errorf("server_id is required")
	}

	serverID, err := uuid.Parse(serverIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid server_id: %w", err)
	}

	if err := h.manager.StopServer(serverID); err != nil {
		return nil, fmt.Errorf("failed to stop mock server: %w", err)
	}

	output := models.OutputData{
		"server_id": serverID.String(),
		"status":    "stopped",
	}

	h.logger.Info("Mock server stopped successfully", zap.String("server_id", serverID.String()))

	return output, nil
}

// MockServerConfigureHandler handles mock server configuration updates
type MockServerConfigureHandler struct {
	manager *mocks.Manager
	logger  *zap.Logger
}

// NewMockServerConfigureHandler creates a new mock server configure handler
func NewMockServerConfigureHandler(manager *mocks.Manager, logger *zap.Logger) *MockServerConfigureHandler {
	return &MockServerConfigureHandler{
		manager: manager,
		logger:  logger,
	}
}

// Execute configures a running mock server
func (h *MockServerConfigureHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	serverIDStr, ok := config["server_id"].(string)
	if !ok {
		return nil, fmt.Errorf("server_id is required")
	}

	serverID, err := uuid.Parse(serverIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid server_id: %w", err)
	}

	// Parse new endpoints
	endpointsConfig, ok := config["endpoints"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("endpoints configuration is required")
	}

	// Add new endpoints
	addedCount := 0
	for _, endpointConfig := range endpointsConfig {
		endpoint, err := h.parseEndpointConfig(serverID, endpointConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to parse endpoint config: %w", err)
		}

		if err := h.manager.AddEndpoint(serverID, endpoint); err != nil {
			return nil, fmt.Errorf("failed to add endpoint: %w", err)
		}
		addedCount++
	}

	output := models.OutputData{
		"server_id":      serverID.String(),
		"endpoints_added": addedCount,
		"status":         "configured",
	}

	h.logger.Info("Mock server configured successfully",
		zap.String("server_id", serverID.String()),
		zap.Int("endpoints_added", addedCount),
	)

	return output, nil
}

// parseEndpointConfig parses endpoint configuration
func (h *MockServerConfigureHandler) parseEndpointConfig(serverID uuid.UUID, config interface{}) (*models.MockEndpoint, error) {
	// Same implementation as MockServerStartHandler
	handler := &MockServerStartHandler{manager: h.manager, logger: h.logger}
	return handler.parseEndpointConfig(serverID, config)
}
