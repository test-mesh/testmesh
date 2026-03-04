package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// MockRepository handles mock server database operations
type MockRepository struct {
	db *gorm.DB
}

// NewMockRepository creates a new mock repository
func NewMockRepository(db *gorm.DB) *MockRepository {
	return &MockRepository{db: db}
}

// CreateServer creates a new mock server
func (r *MockRepository) CreateServer(server *models.MockServer) error {
	return r.db.Create(server).Error
}

// GetServerByID retrieves a mock server by ID
func (r *MockRepository) GetServerByID(id uuid.UUID) (*models.MockServer, error) {
	var server models.MockServer
	if err := r.db.First(&server, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

// GetServerByPort retrieves a mock server by port
func (r *MockRepository) GetServerByPort(port int) (*models.MockServer, error) {
	var server models.MockServer
	if err := r.db.Where("port = ? AND status = ?", port, models.MockServerStatusRunning).First(&server).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

// UpdateServer updates a mock server
func (r *MockRepository) UpdateServer(server *models.MockServer) error {
	return r.db.Save(server).Error
}

// ListServers retrieves mock servers with optional filters
func (r *MockRepository) ListServers(executionID *uuid.UUID, status models.MockServerStatus, limit, offset int) ([]models.MockServer, int64, error) {
	var servers []models.MockServer
	var total int64

	query := r.db.Model(&models.MockServer{})

	if executionID != nil {
		query = query.Where("execution_id = ?", *executionID)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&servers).Error; err != nil {
		return nil, 0, err
	}

	return servers, total, nil
}

// CreateEndpoint creates a new mock endpoint
func (r *MockRepository) CreateEndpoint(endpoint *models.MockEndpoint) error {
	return r.db.Create(endpoint).Error
}

// GetEndpointByID retrieves a mock endpoint by ID
func (r *MockRepository) GetEndpointByID(id uuid.UUID) (*models.MockEndpoint, error) {
	var endpoint models.MockEndpoint
	if err := r.db.First(&endpoint, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &endpoint, nil
}

// ListEndpoints retrieves endpoints for a mock server
func (r *MockRepository) ListEndpoints(serverID uuid.UUID) ([]models.MockEndpoint, error) {
	var endpoints []models.MockEndpoint
	if err := r.db.Where("mock_server_id = ?", serverID).Order("priority DESC, created_at ASC").Find(&endpoints).Error; err != nil {
		return nil, err
	}
	return endpoints, nil
}

// UpdateEndpoint updates a mock endpoint
func (r *MockRepository) UpdateEndpoint(endpoint *models.MockEndpoint) error {
	return r.db.Save(endpoint).Error
}

// DeleteEndpoint deletes a mock endpoint
func (r *MockRepository) DeleteEndpoint(id uuid.UUID) error {
	return r.db.Delete(&models.MockEndpoint{}, "id = ?", id).Error
}

// CreateRequest creates a new mock request log
func (r *MockRepository) CreateRequest(request *models.MockRequest) error {
	return r.db.Create(request).Error
}

// ListRequests retrieves requests for a mock server
func (r *MockRepository) ListRequests(serverID uuid.UUID, matched *bool, limit, offset int) ([]models.MockRequest, int64, error) {
	var requests []models.MockRequest
	var total int64

	query := r.db.Model(&models.MockRequest{}).Where("mock_server_id = ?", serverID)

	if matched != nil {
		query = query.Where("matched = ?", *matched)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("received_at DESC").Limit(limit).Offset(offset).Find(&requests).Error; err != nil {
		return nil, 0, err
	}

	return requests, total, nil
}

// GetState retrieves state for a mock server
func (r *MockRepository) GetState(serverID uuid.UUID, stateKey string) (*models.MockState, error) {
	var state models.MockState
	if err := r.db.Where("mock_server_id = ? AND state_key = ?", serverID, stateKey).First(&state).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

// UpsertState creates or updates state for a mock server
func (r *MockRepository) UpsertState(state *models.MockState) error {
	return r.db.Save(state).Error
}

// ListStates retrieves all states for a mock server
func (r *MockRepository) ListStates(serverID uuid.UUID) ([]models.MockState, error) {
	var states []models.MockState
	if err := r.db.Where("mock_server_id = ?", serverID).Find(&states).Error; err != nil {
		return nil, err
	}
	return states, nil
}

// DeleteServer deletes a mock server (cascades to endpoints, requests, state)
func (r *MockRepository) DeleteServer(id uuid.UUID) error {
	return r.db.Delete(&models.MockServer{}, "id = ?", id).Error
}

// DeleteState deletes a state entry for a mock server
func (r *MockRepository) DeleteState(serverID uuid.UUID, stateKey string) error {
	return r.db.Delete(&models.MockState{}, "mock_server_id = ? AND state_key = ?", serverID, stateKey).Error
}

// GetRequestByID retrieves a specific mock request by ID
func (r *MockRepository) GetRequestByID(id uuid.UUID) (*models.MockRequest, error) {
	var request models.MockRequest
	if err := r.db.First(&request, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &request, nil
}

// DeleteRequests deletes all request logs for a mock server
func (r *MockRepository) DeleteRequests(serverID uuid.UUID) error {
	return r.db.Delete(&models.MockRequest{}, "mock_server_id = ?", serverID).Error
}

// CreateState creates a new state entry for a mock server
func (r *MockRepository) CreateState(state *models.MockState) error {
	return r.db.Create(state).Error
}
