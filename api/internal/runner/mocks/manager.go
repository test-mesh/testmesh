package mocks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Manager manages mock server instances
type Manager struct {
	repo    *repository.MockRepository
	logger  *zap.Logger
	servers map[uuid.UUID]*ServerInstance
	baseURL string
	mu      sync.RWMutex
}

// ServerInstance represents an in-memory mock server (no TCP listener)
type ServerInstance struct {
	ID          uuid.UUID
	ExecutionID *uuid.UUID
	BaseURL     string
	Matcher     *EndpointMatcher
	State       *StateManager
}

// NewManager creates a new mock server manager
func NewManager(repo *repository.MockRepository, logger *zap.Logger, baseURL string) *Manager {
	return &Manager{
		repo:    repo,
		logger:  logger,
		servers: make(map[uuid.UUID]*ServerInstance),
		baseURL: baseURL,
	}
}

// RestoreRunningServers re-registers all DB-persisted running servers into the in-memory map.
// Call this once at startup so servers created in previous process lifetimes keep working.
func (m *Manager) RestoreRunningServers() {
	servers, _, err := m.repo.ListServers(nil, models.MockServerStatusRunning, 10000, 0)
	if err != nil {
		m.logger.Error("Failed to list running servers for restore", zap.Error(err))
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	count := 0
	for _, s := range servers {
		if _, exists := m.servers[s.ID]; exists {
			continue
		}

		endpoints, err := m.repo.ListEndpoints(s.ID)
		if err != nil {
			m.logger.Warn("Failed to load endpoints for server during restore",
				zap.String("server_id", s.ID.String()), zap.Error(err))
			continue
		}

		instance := &ServerInstance{
			ID:          s.ID,
			ExecutionID: s.ExecutionID,
			BaseURL:     s.BaseURL,
			Matcher:     NewEndpointMatcher(endpoints, m.logger),
			State:       NewStateManager(s.ID, m.repo, m.logger),
		}
		m.servers[s.ID] = instance
		count++
	}

	if count > 0 {
		m.logger.Info("Restored running mock servers", zap.Int("count", count))
	}
}

// StartServer starts a new mock server (in-memory only, no TCP listener)
func (m *Manager) StartServer(ctx context.Context, serverID uuid.UUID, name string, executionID *uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if server already exists
	if _, exists := m.servers[serverID]; exists {
		return fmt.Errorf("server %s already running", serverID)
	}

	serverBaseURL := fmt.Sprintf("%s/mocks/%s", m.baseURL, serverID)

	// Create server record
	server := &models.MockServer{
		ID:          serverID,
		ExecutionID: executionID,
		Name:        name,
		Port:        0, // no dedicated port; routing is through main server
		BaseURL:     serverBaseURL,
		Status:      models.MockServerStatusStarting,
	}

	if err := m.repo.CreateServer(server); err != nil {
		return fmt.Errorf("failed to create server record: %w", err)
	}

	// Load endpoints
	endpoints, err := m.repo.ListEndpoints(serverID)
	if err != nil {
		return fmt.Errorf("failed to load endpoints: %w", err)
	}

	// Create matcher and state manager
	matcher := NewEndpointMatcher(endpoints, m.logger)
	stateManager := NewStateManager(serverID, m.repo, m.logger)

	// Store instance
	instance := &ServerInstance{
		ID:          serverID,
		ExecutionID: executionID,
		BaseURL:     serverBaseURL,
		Matcher:     matcher,
		State:       stateManager,
	}
	m.servers[serverID] = instance

	// Update server status
	now := time.Now()
	server.Status = models.MockServerStatusRunning
	server.StartedAt = &now
	if err := m.repo.UpdateServer(server); err != nil {
		return fmt.Errorf("failed to update server status: %w", err)
	}

	m.logger.Info("Mock server started",
		zap.String("server_id", serverID.String()),
		zap.String("name", name),
		zap.String("base_url", serverBaseURL),
		zap.Int("endpoints", len(endpoints)),
	)

	return nil
}

// StopServer stops a running mock server
func (m *Manager) StopServer(serverID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.servers[serverID]; !exists {
		return fmt.Errorf("server %s not running", serverID)
	}

	// Update server record
	server, err := m.repo.GetServerByID(serverID)
	if err != nil {
		return fmt.Errorf("failed to get server record: %w", err)
	}

	now := time.Now()
	server.Status = models.MockServerStatusStopped
	server.StoppedAt = &now
	if err := m.repo.UpdateServer(server); err != nil {
		return fmt.Errorf("failed to update server status: %w", err)
	}

	// Remove from instances
	delete(m.servers, serverID)

	m.logger.Info("Mock server stopped", zap.String("server_id", serverID.String()))

	return nil
}

// StopServersByExecution stops all mock servers belonging to the given execution
func (m *Manager) StopServersByExecution(executionID uuid.UUID) error {
	m.mu.RLock()
	var toStop []uuid.UUID
	for id, instance := range m.servers {
		if instance.ExecutionID != nil && *instance.ExecutionID == executionID {
			toStop = append(toStop, id)
		}
	}
	m.mu.RUnlock()

	var lastErr error
	for _, id := range toStop {
		if err := m.StopServer(id); err != nil {
			lastErr = err
			m.logger.Error("Failed to stop server", zap.Error(err), zap.String("server_id", id.String()))
		}
	}

	return lastErr
}

// AddEndpoint adds a new endpoint to a running mock server
func (m *Manager) AddEndpoint(serverID uuid.UUID, endpoint *models.MockEndpoint) error {
	m.mu.RLock()
	instance, exists := m.servers[serverID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("server %s not running", serverID)
	}

	// Create endpoint in database
	if err := m.repo.CreateEndpoint(endpoint); err != nil {
		return fmt.Errorf("failed to create endpoint: %w", err)
	}

	// Add to matcher
	instance.Matcher.AddEndpoint(endpoint)

	m.logger.Info("Endpoint added to mock server",
		zap.String("server_id", serverID.String()),
		zap.String("method", endpoint.Method),
		zap.String("path", endpoint.Path),
	)

	return nil
}

// GetServer retrieves a server instance
func (m *Manager) GetServer(serverID uuid.UUID) (*ServerInstance, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	instance, exists := m.servers[serverID]
	if !exists {
		return nil, fmt.Errorf("server %s not running", serverID)
	}

	return instance, nil
}

// StopAllServers stops all running mock servers
func (m *Manager) StopAllServers() error {
	m.mu.Lock()
	serverIDs := make([]uuid.UUID, 0, len(m.servers))
	for id := range m.servers {
		serverIDs = append(serverIDs, id)
	}
	m.mu.Unlock()

	var lastErr error
	for _, id := range serverIDs {
		if err := m.StopServer(id); err != nil {
			lastErr = err
			m.logger.Error("Failed to stop server", zap.Error(err), zap.String("server_id", id.String()))
		}
	}

	return lastErr
}

// GinHandler returns a Gin handler that routes requests to the appropriate mock server instance
func (m *Manager) GinHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("server_id")
		serverID, err := uuid.Parse(serverIDStr)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "invalid server ID"})
			return
		}

		m.mu.RLock()
		instance, exists := m.servers[serverID]
		m.mu.RUnlock()

		if !exists {
			c.JSON(http.StatusNotFound, gin.H{"error": "mock server not found or stopped"})
			return
		}

		// *path param includes the leading slash, e.g. "/api/users"
		path := c.Param("path")
		if path == "" {
			path = "/"
		}

		m.handleRequest(serverID, instance, c.Request.Method, path, c.Request, c.Writer)
	}
}

// templateContext holds request data available inside response templates.
// Usage in JSON/text bodies:
//
//	{{.path.id}}            — path parameter named "id"
//	{{.query.page}}         — query parameter named "page"
//	{{.headers.Authorization}} — request header
//	{{.body.amount}}        — field from a JSON request body
type templateContext map[string]interface{}

// renderTemplate applies Go text/template to s using ctx. If s contains no
// template directives the string is returned unchanged; errors are logged and
// the original string is returned as a fallback.
func (m *Manager) renderTemplate(s string, ctx templateContext) string {
	if !strings.Contains(s, "{{") {
		return s
	}
	tmpl, err := template.New("").Option("missingkey=zero").Parse(s)
	if err != nil {
		m.logger.Warn("Failed to parse response template", zap.Error(err))
		return s
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, ctx); err != nil {
		m.logger.Warn("Failed to execute response template", zap.Error(err))
		return s
	}
	return buf.String()
}

// renderBodyJSON marshals bodyJSON to a JSON string, applies template rendering,
// then unmarshals the result. Returns nil on any error so the caller can fall
// through to other body types.
func (m *Manager) renderBodyJSON(bodyJSON map[string]interface{}, ctx templateContext) []byte {
	raw, err := json.Marshal(bodyJSON)
	if err != nil {
		return nil
	}
	rendered := m.renderTemplate(string(raw), ctx)
	// Validate the rendered string is still valid JSON before sending.
	var v interface{}
	if err := json.Unmarshal([]byte(rendered), &v); err != nil {
		m.logger.Warn("Rendered template produced invalid JSON, falling back to unrendered body", zap.Error(err))
		return raw
	}
	return []byte(rendered)
}

// extractPathParams compares an endpoint path template (e.g. /api/users/:id)
// against the actual request path and returns a map of parameter name → value.
func extractPathParams(endpointPath, requestPath string) map[string]string {
	params := map[string]string{}
	endParts := strings.Split(strings.Trim(endpointPath, "/"), "/")
	reqParts := strings.Split(strings.Trim(requestPath, "/"), "/")
	if len(endParts) != len(reqParts) {
		return params
	}
	for i, part := range endParts {
		if strings.HasPrefix(part, ":") {
			params[part[1:]] = reqParts[i]
		}
	}
	return params
}

// handleRequest processes an incoming request against a mock server instance
func (m *Manager) handleRequest(serverID uuid.UUID, instance *ServerInstance, method, path string, r *http.Request, w http.ResponseWriter) {
	// Read request body
	reqBody, _ := io.ReadAll(r.Body)
	r.Body.Close()

	// Convert headers to map
	headers := make(map[string]interface{})
	for k, v := range r.Header {
		if len(v) == 1 {
			headers[k] = v[0]
		} else {
			headers[k] = v
		}
	}

	// Convert query params to map
	queryParams := make(map[string]interface{})
	for k, v := range r.URL.Query() {
		if len(v) == 1 {
			queryParams[k] = v[0]
		} else {
			queryParams[k] = v
		}
	}

	// Match endpoint
	endpoint, matched := instance.Matcher.Match(method, path, headers, queryParams, reqBody)

	mockRequest := &models.MockRequest{
		MockServerID: serverID,
		Method:       method,
		Path:         path,
		Headers:      headers,
		QueryParams:  queryParams,
		Body:         string(reqBody),
		Matched:      matched,
		ResponseCode: http.StatusNotFound,
	}

	var response *models.ResponseConfig
	var tmplCtx templateContext

	if matched && endpoint != nil {
		mockRequest.EndpointID = &endpoint.ID
		response = &endpoint.ResponseConfig

		// Build template context from request data
		pathParams := extractPathParams(endpoint.Path, path)
		var bodyJSON map[string]interface{}
		_ = json.Unmarshal(reqBody, &bodyJSON) // best-effort; nil if not JSON
		tmplCtx = templateContext{
			"path":    pathParams,
			"query":   queryParams,
			"headers": headers,
			"body":    bodyJSON,
		}

		// Handle state updates
		if endpoint.StateConfig != nil {
			if err := instance.State.UpdateState(endpoint.StateConfig); err != nil {
				m.logger.Error("Failed to update state", zap.Error(err))
			}
		}
	} else {
		response = &models.ResponseConfig{
			StatusCode: http.StatusNotFound,
			BodyText:   "No matching endpoint found",
		}
		tmplCtx = templateContext{}
	}

	// Apply response delay
	if response.DelayMs > 0 {
		time.Sleep(time.Duration(response.DelayMs) * time.Millisecond)
	}

	// Set response headers
	for k, v := range response.Headers {
		w.Header().Set(k, v)
	}

	// Set status code
	mockRequest.ResponseCode = response.StatusCode
	w.WriteHeader(response.StatusCode)

	// Write response body — apply template rendering to all body types
	if response.BodyJSON != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write(m.renderBodyJSON(response.BodyJSON, tmplCtx))
	} else if response.BodyText != "" {
		w.Write([]byte(m.renderTemplate(response.BodyText, tmplCtx)))
	} else if response.Body != nil {
		if bodyBytes, err := json.Marshal(response.Body); err == nil {
			w.Header().Set("Content-Type", "application/json")
			rendered := m.renderTemplate(string(bodyBytes), tmplCtx)
			w.Write([]byte(rendered))
		}
	}

	// Log request to database (async)
	go func() {
		if err := m.repo.CreateRequest(mockRequest); err != nil {
			m.logger.Error("Failed to log mock request", zap.Error(err))
		}
	}()

	m.logger.Debug("Mock request handled",
		zap.String("method", method),
		zap.String("path", path),
		zap.Bool("matched", matched),
		zap.Int("status", response.StatusCode),
	)
}
