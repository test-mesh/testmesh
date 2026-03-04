package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/runner/mocks"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// MockHandler handles mock server-related requests
type MockHandler struct {
	repo        *repository.MockRepository
	mockManager *mocks.Manager
	logger      *zap.Logger
}

// NewMockHandler creates a new mock handler
func NewMockHandler(repo *repository.MockRepository, mockManager *mocks.Manager, logger *zap.Logger) *MockHandler {
	return &MockHandler{
		repo:        repo,
		mockManager: mockManager,
		logger:      logger,
	}
}

// ListServers handles GET /api/v1/mock-servers
func (h *MockHandler) ListServers(c *gin.Context) {
	var executionID *uuid.UUID
	if execIDStr := c.Query("execution_id"); execIDStr != "" {
		id, err := uuid.Parse(execIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution_id"})
			return
		}
		executionID = &id
	}

	status := models.MockServerStatus(c.Query("status"))

	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	servers, total, err := h.repo.ListServers(executionID, status, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list mock servers", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list mock servers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"servers": servers,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// GetServer handles GET /api/v1/mock-servers/:id
func (h *MockHandler) GetServer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	server, err := h.repo.GetServerByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	c.JSON(http.StatusOK, server)
}

// GetEndpoints handles GET /api/v1/mock-servers/:id/endpoints
func (h *MockHandler) GetEndpoints(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	endpoints, err := h.repo.ListEndpoints(serverID)
	if err != nil {
		h.logger.Error("Failed to list endpoints", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list endpoints"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"endpoints": endpoints,
		"total":     len(endpoints),
	})
}

// CreateEndpoint handles POST /api/v1/mock-servers/:id/endpoints
func (h *MockHandler) CreateEndpoint(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	var endpoint models.MockEndpoint
	if err := c.ShouldBindJSON(&endpoint); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	endpoint.MockServerID = serverID

	if err := h.repo.CreateEndpoint(&endpoint); err != nil {
		h.logger.Error("Failed to create endpoint", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create endpoint"})
		return
	}

	c.JSON(http.StatusCreated, endpoint)
}

// UpdateEndpoint handles PUT /api/v1/mock-servers/:id/endpoints/:endpoint_id
func (h *MockHandler) UpdateEndpoint(c *gin.Context) {
	endpointID, err := uuid.Parse(c.Param("endpoint_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endpoint ID"})
		return
	}

	var endpoint models.MockEndpoint
	if err := c.ShouldBindJSON(&endpoint); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	endpoint.ID = endpointID

	if err := h.repo.UpdateEndpoint(&endpoint); err != nil {
		h.logger.Error("Failed to update endpoint", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update endpoint"})
		return
	}

	c.JSON(http.StatusOK, endpoint)
}

// DeleteEndpoint handles DELETE /api/v1/mock-servers/:id/endpoints/:endpoint_id
func (h *MockHandler) DeleteEndpoint(c *gin.Context) {
	endpointID, err := uuid.Parse(c.Param("endpoint_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endpoint ID"})
		return
	}

	if err := h.repo.DeleteEndpoint(endpointID); err != nil {
		h.logger.Error("Failed to delete endpoint", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete endpoint"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "endpoint deleted"})
}

// GetRequests handles GET /api/v1/mock-servers/:id/requests
func (h *MockHandler) GetRequests(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	var matched *bool
	if matchedStr := c.Query("matched"); matchedStr != "" {
		m := matchedStr == "true"
		matched = &m
	}

	limit := 50
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	requests, total, err := h.repo.ListRequests(serverID, matched, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list requests", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// GetStates handles GET /api/v1/mock-servers/:id/state
func (h *MockHandler) GetStates(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	states, err := h.repo.ListStates(serverID)
	if err != nil {
		h.logger.Error("Failed to list states", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list states"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"states": states,
		"total":  len(states),
	})
}

// GetState handles GET /api/v1/mock-servers/:id/state/:key
func (h *MockHandler) GetState(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	stateKey := c.Param("key")
	if stateKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "state key is required"})
		return
	}

	state, err := h.repo.GetState(serverID, stateKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "state not found"})
		return
	}

	c.JSON(http.StatusOK, state)
}

// DeleteServer handles DELETE /api/v1/mock-servers/:id
func (h *MockHandler) DeleteServer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	if err := h.repo.DeleteServer(id); err != nil {
		h.logger.Error("Failed to delete server", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "server deleted"})
}

// CreateState handles POST /api/v1/mock-servers/:id/state
func (h *MockHandler) CreateState(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	var req struct {
		StateKey   string                 `json:"state_key" binding:"required"`
		StateValue map[string]interface{} `json:"state_value" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	state := &models.MockState{
		MockServerID: serverID,
		StateKey:     req.StateKey,
		StateValue:   req.StateValue,
	}

	if err := h.repo.CreateState(state); err != nil {
		h.logger.Error("Failed to create state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create state"})
		return
	}

	c.JSON(http.StatusCreated, state)
}

// UpdateState handles PUT /api/v1/mock-servers/:id/state/:key
func (h *MockHandler) UpdateState(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	stateKey := c.Param("key")
	if stateKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "state key is required"})
		return
	}

	var req struct {
		StateValue map[string]interface{} `json:"state_value" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get existing state or create new one
	state, err := h.repo.GetState(serverID, stateKey)
	if err != nil {
		// Create new state if not found
		state = &models.MockState{
			MockServerID: serverID,
			StateKey:     stateKey,
		}
	}

	state.StateValue = req.StateValue

	if err := h.repo.UpsertState(state); err != nil {
		h.logger.Error("Failed to update state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update state"})
		return
	}

	c.JSON(http.StatusOK, state)
}

// DeleteState handles DELETE /api/v1/mock-servers/:id/state/:key
func (h *MockHandler) DeleteState(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	stateKey := c.Param("key")
	if stateKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "state key is required"})
		return
	}

	if err := h.repo.DeleteState(serverID, stateKey); err != nil {
		h.logger.Error("Failed to delete state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete state"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "state deleted"})
}

// GetRequest handles GET /api/v1/mock-servers/:id/requests/:request_id
func (h *MockHandler) GetRequest(c *gin.Context) {
	requestID, err := uuid.Parse(c.Param("request_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request ID"})
		return
	}

	request, err := h.repo.GetRequestByID(requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}

	c.JSON(http.StatusOK, request)
}

// DeleteRequests handles DELETE /api/v1/mock-servers/:id/requests
func (h *MockHandler) DeleteRequests(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	if err := h.repo.DeleteRequests(serverID); err != nil {
		h.logger.Error("Failed to delete requests", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "request logs cleared"})
}

// CreateServer handles POST /api/v1/mock-servers
func (h *MockHandler) CreateServer(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	serverID := uuid.New()
	if err := h.mockManager.StartServer(context.Background(), serverID, req.Name, nil); err != nil {
		h.logger.Error("Failed to create mock server", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create mock server"})
		return
	}

	server, err := h.repo.GetServerByID(serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve created server"})
		return
	}

	c.JSON(http.StatusCreated, server)
}

// StartServer handles POST /api/v1/mock-servers/:id/start
func (h *MockHandler) StartServer(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	server, err := h.repo.GetServerByID(serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	if err := h.mockManager.StartServer(context.Background(), serverID, server.Name, server.ExecutionID); err != nil {
		h.logger.Error("Failed to start mock server", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start mock server: " + err.Error()})
		return
	}

	updated, err := h.repo.GetServerByID(serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve server"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// StopServer handles POST /api/v1/mock-servers/:id/stop
func (h *MockHandler) StopServer(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
		return
	}

	if err := h.mockManager.StopServer(serverID); err != nil {
		h.logger.Error("Failed to stop mock server", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to stop mock server: " + err.Error()})
		return
	}

	server, err := h.repo.GetServerByID(serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve server"})
		return
	}

	c.JSON(http.StatusOK, server)
}
