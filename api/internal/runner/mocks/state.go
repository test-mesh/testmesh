package mocks

import (
	"fmt"
	"sync"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// StateManager manages stateful behavior for mock servers
type StateManager struct {
	serverID uuid.UUID
	repo     *repository.MockRepository
	logger   *zap.Logger
	cache    map[string]interface{}
	mu       sync.RWMutex
}

// NewStateManager creates a new state manager
func NewStateManager(serverID uuid.UUID, repo *repository.MockRepository, logger *zap.Logger) *StateManager {
	return &StateManager{
		serverID: serverID,
		repo:     repo,
		logger:   logger,
		cache:    make(map[string]interface{}),
	}
}

// UpdateState updates state based on state configuration
func (s *StateManager) UpdateState(config *models.StateConfig) error {
	if config == nil || config.StateKey == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Get current state
	currentValue, err := s.getStateValue(config.StateKey)
	if err != nil {
		// Initialize with default value if not exists
		currentValue = config.InitialValue
	}

	// Apply update rule
	newValue, err := s.applyUpdateRule(config.UpdateRule, currentValue, config.UpdateValue)
	if err != nil {
		return fmt.Errorf("failed to apply update rule: %w", err)
	}

	// Save state
	stateData := map[string]interface{}{
		"value":      newValue,
		"updated_at": time.Now().Unix(),
	}

	state := &models.MockState{
		MockServerID: s.serverID,
		StateKey:     config.StateKey,
		StateValue:   stateData,
	}

	if err := s.repo.UpsertState(state); err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}

	// Update cache
	s.cache[config.StateKey] = newValue

	s.logger.Debug("State updated",
		zap.String("key", config.StateKey),
		zap.String("rule", config.UpdateRule),
		zap.Any("new_value", newValue),
	)

	return nil
}

// GetState retrieves state value
func (s *StateManager) GetState(key string) (interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.getStateValue(key)
}

// getStateValue retrieves state value (internal, not thread-safe)
func (s *StateManager) getStateValue(key string) (interface{}, error) {
	// Check cache first
	if value, exists := s.cache[key]; exists {
		return value, nil
	}

	// Load from database
	state, err := s.repo.GetState(s.serverID, key)
	if err != nil {
		return nil, err
	}

	value := state.StateValue["value"]
	s.cache[key] = value

	return value, nil
}

// applyUpdateRule applies an update rule to a value
func (s *StateManager) applyUpdateRule(rule string, currentValue, updateValue interface{}) (interface{}, error) {
	switch rule {
	case "set":
		return updateValue, nil

	case "increment":
		// Increment numeric value
		current, ok := currentValue.(float64)
		if !ok {
			if currentInt, ok := currentValue.(int); ok {
				current = float64(currentInt)
			} else {
				current = 0
			}
		}

		increment := 1.0
		if updateValue != nil {
			if incFloat, ok := updateValue.(float64); ok {
				increment = incFloat
			} else if incInt, ok := updateValue.(int); ok {
				increment = float64(incInt)
			}
		}

		return current + increment, nil

	case "decrement":
		// Decrement numeric value
		current, ok := currentValue.(float64)
		if !ok {
			if currentInt, ok := currentValue.(int); ok {
				current = float64(currentInt)
			} else {
				current = 0
			}
		}

		decrement := 1.0
		if updateValue != nil {
			if decFloat, ok := updateValue.(float64); ok {
				decrement = decFloat
			} else if decInt, ok := updateValue.(int); ok {
				decrement = float64(decInt)
			}
		}

		return current - decrement, nil

	case "append":
		// Append to array
		currentArray, ok := currentValue.([]interface{})
		if !ok {
			currentArray = []interface{}{}
		}
		return append(currentArray, updateValue), nil

	case "toggle":
		// Toggle boolean
		currentBool, ok := currentValue.(bool)
		if !ok {
			return true, nil
		}
		return !currentBool, nil

	case "":
		// No update rule, return current value
		return currentValue, nil

	default:
		return nil, fmt.Errorf("unknown update rule: %s", rule)
	}
}

// ResetState resets all state for the server
func (s *StateManager) ResetState() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear cache
	s.cache = make(map[string]interface{})

	// Note: We don't delete from database to preserve history
	// In production, you might want to add a "ResetState" endpoint
	s.logger.Info("State cache cleared", zap.String("server_id", s.serverID.String()))

	return nil
}
