package websocket

import (
	"encoding/json"
	"sync"

	"github.com/georgi-georgiev/testmesh/internal/runner/debugger"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// EventType represents the type of WebSocket event
type EventType string

const (
	EventExecutionStarted   EventType = "execution.started"
	EventExecutionCompleted EventType = "execution.completed"
	EventExecutionFailed    EventType = "execution.failed"
	EventStepStarted        EventType = "step.started"
	EventStepCompleted      EventType = "step.completed"
	EventStepFailed         EventType = "step.failed"

	// Debug events
	EventDebugPaused         EventType = "debug.paused"
	EventDebugResumed        EventType = "debug.resumed"
	EventDebugStep           EventType = "debug.step"
	EventDebugVariables      EventType = "debug.variables"
	EventDebugBreakpointHit  EventType = "debug.breakpoint.hit"
	EventDebugError          EventType = "debug.error"
	EventDebugSessionStarted EventType = "debug.session.started"
	EventDebugSessionEnded   EventType = "debug.session.ended"
)

// Event represents a WebSocket event
type Event struct {
	Type        EventType              `json:"type"`
	ExecutionID uuid.UUID              `json:"execution_id"`
	Data        map[string]interface{} `json:"data"`
}

// Client represents a WebSocket client connection
type Client struct {
	ID           string
	ExecutionID  uuid.UUID
	Send         chan *Event
	hub          *Hub
	unregister   chan *Client
}

// Hub manages WebSocket connections and broadcasts
type Hub struct {
	// Registered clients per execution ID
	clients map[uuid.UUID]map[*Client]bool

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Broadcast events to clients
	broadcast chan *Event

	// Mutex for thread-safe operations
	mu sync.RWMutex

	// Logger
	logger *zap.Logger
}

// NewHub creates a new WebSocket hub
func NewHub(logger *zap.Logger) *Hub {
	return &Hub{
		clients:    make(map[uuid.UUID]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *Event, 256),
		logger:     logger,
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case event := <-h.broadcast:
			h.broadcastEvent(event)
		}
	}
}

// registerClient registers a new client
func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.ExecutionID] == nil {
		h.clients[client.ExecutionID] = make(map[*Client]bool)
	}

	h.clients[client.ExecutionID][client] = true

	h.logger.Info("WebSocket client registered",
		zap.String("client_id", client.ID),
		zap.String("execution_id", client.ExecutionID.String()),
	)
}

// unregisterClient unregisters a client
func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.clients[client.ExecutionID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			close(client.Send)

			// Clean up empty execution maps
			if len(clients) == 0 {
				delete(h.clients, client.ExecutionID)
			}

			h.logger.Info("WebSocket client unregistered",
				zap.String("client_id", client.ID),
				zap.String("execution_id", client.ExecutionID.String()),
			)
		}
	}
}

// broadcastEvent sends an event to all clients watching the execution
func (h *Hub) broadcastEvent(event *Event) {
	h.mu.RLock()
	clients := h.clients[event.ExecutionID]
	h.mu.RUnlock()

	if len(clients) == 0 {
		return
	}

	h.logger.Debug("Broadcasting event",
		zap.String("type", string(event.Type)),
		zap.String("execution_id", event.ExecutionID.String()),
		zap.Int("clients", len(clients)),
	)

	for client := range clients {
		select {
		case client.Send <- event:
			// Event sent successfully
		default:
			// Client's send channel is full, unregister it
			h.unregisterClient(client)
		}
	}
}

// BroadcastExecutionStarted broadcasts execution started event
func (h *Hub) BroadcastExecutionStarted(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventExecutionStarted,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastExecutionCompleted broadcasts execution completed event
func (h *Hub) BroadcastExecutionCompleted(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventExecutionCompleted,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastExecutionFailed broadcasts execution failed event
func (h *Hub) BroadcastExecutionFailed(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventExecutionFailed,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastStepStarted broadcasts step started event
func (h *Hub) BroadcastStepStarted(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventStepStarted,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastStepCompleted broadcasts step completed event
func (h *Hub) BroadcastStepCompleted(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventStepCompleted,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastStepFailed broadcasts step failed event
func (h *Hub) BroadcastStepFailed(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventStepFailed,
		ExecutionID: executionID,
		Data:        data,
	}
}

// GetClientCount returns the number of connected clients for an execution
func (h *Hub) GetClientCount(executionID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.clients[executionID]; ok {
		return len(clients)
	}

	return 0
}

// MarshalEvent marshals an event to JSON
func MarshalEvent(event *Event) ([]byte, error) {
	return json.Marshal(event)
}

// BroadcastDebugEvent implements the debugger.DebugEventHandler interface
func (h *Hub) BroadcastDebugEvent(executionID uuid.UUID, event *debugger.DebugEvent) {
	// Map debug event type to WebSocket event type
	var eventType EventType
	switch event.Type {
	case "debug.paused":
		eventType = EventDebugPaused
	case "debug.resumed":
		eventType = EventDebugResumed
	case "debug.step":
		eventType = EventDebugStep
	case "debug.variables":
		eventType = EventDebugVariables
	case "debug.breakpoint.hit":
		eventType = EventDebugBreakpointHit
	case "debug.error":
		eventType = EventDebugError
	default:
		eventType = EventType(event.Type)
	}

	data := event.Data
	if data == nil {
		data = make(map[string]interface{})
	}
	data["session_id"] = event.SessionID.String()
	data["timestamp"] = event.Timestamp

	h.broadcast <- &Event{
		Type:        eventType,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastDebugSessionStarted broadcasts when a debug session starts
func (h *Hub) BroadcastDebugSessionStarted(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventDebugSessionStarted,
		ExecutionID: executionID,
		Data:        data,
	}
}

// BroadcastDebugSessionEnded broadcasts when a debug session ends
func (h *Hub) BroadcastDebugSessionEnded(executionID uuid.UUID, data map[string]interface{}) {
	h.broadcast <- &Event{
		Type:        EventDebugSessionEnded,
		ExecutionID: executionID,
		Data:        data,
	}
}
