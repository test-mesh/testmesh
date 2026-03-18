// Package connection manages the outbound WebSocket connection to the
// TestMesh cloud control plane and dispatches incoming jobs to workers.
package connection

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/test-mesh/testmesh/agent/internal/worker"
	"go.uber.org/zap"
)

// Config holds agent startup configuration.
type Config struct {
	CloudURL string
	Token    string
	Workers  int
	Logger   *zap.Logger
}

// Agent manages the lifecycle of the connection and worker pool.
type Agent struct {
	cfg    Config
	pool   *worker.Pool
	conn   *websocket.Conn
	stopCh chan struct{}
	mu     sync.Mutex
}

// NewAgent creates an Agent but does not connect yet.
func NewAgent(cfg Config) *Agent {
	return &Agent{
		cfg:    cfg,
		pool:   worker.NewPool(cfg.Workers, cfg.Logger),
		stopCh: make(chan struct{}),
	}
}

// Run connects to the cloud and blocks until Stop is called or a fatal error occurs.
// It reconnects automatically on transient failures.
func (a *Agent) Run() error {
	for {
		select {
		case <-a.stopCh:
			return nil
		default:
		}

		if err := a.connect(); err != nil {
			a.cfg.Logger.Warn("connection failed, retrying in 5s", zap.Error(err))
			select {
			case <-time.After(5 * time.Second):
			case <-a.stopCh:
				return nil
			}
			continue
		}

		a.cfg.Logger.Info("connected to cloud control plane", zap.String("url", a.cfg.CloudURL))
		a.pool.Start()

		if err := a.readLoop(); err != nil {
			a.cfg.Logger.Warn("connection lost, reconnecting", zap.Error(err))
		}

		a.pool.Stop()
	}
}

// Stop signals the agent to shut down cleanly.
func (a *Agent) Stop() {
	close(a.stopCh)
	a.mu.Lock()
	if a.conn != nil {
		a.conn.Close()
	}
	a.mu.Unlock()
}

// connect dials the control plane WebSocket endpoint.
func (a *Agent) connect() error {
	wsURL := toWebSocketURL(a.cfg.CloudURL) + "/api/v1/agent/connect"

	header := map[string][]string{
		"Authorization": {"Bearer " + a.cfg.Token},
		"User-Agent":    {"testmesh-agent/0.1.0"},
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		return fmt.Errorf("dial %s: %w", wsURL, err)
	}

	a.mu.Lock()
	a.conn = conn
	a.mu.Unlock()

	// Send registration message so the control plane knows our capacity
	reg := Message{
		Type: MsgTypeRegister,
		Payload: mustMarshal(RegisterPayload{
			Workers: a.cfg.Workers,
			Version: "0.1.0",
		}),
	}
	return conn.WriteJSON(reg)
}

// readLoop reads messages from the control plane until the connection closes.
func (a *Agent) readLoop() error {
	a.mu.Lock()
	conn := a.conn
	a.mu.Unlock()

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			return err
		}

		switch msg.Type {

		case MsgTypeJob:
			var job worker.Job
			if err := json.Unmarshal(msg.Payload, &job); err != nil {
				a.cfg.Logger.Error("failed to parse job", zap.Error(err))
				continue
			}
			// Attach result callback so the worker can stream back to cloud
			job.ResultFn = a.sendResult(conn, job.ID)
			a.pool.Enqueue(job)

		case MsgTypePing:
			_ = conn.WriteJSON(Message{Type: MsgTypePong})

		default:
			a.cfg.Logger.Warn("unknown message type", zap.String("type", string(msg.Type)))
		}
	}
}

// sendResult returns a callback that the worker calls after each step and on completion.
func (a *Agent) sendResult(conn *websocket.Conn, jobID string) worker.ResultFn {
	return func(result worker.Result) {
		msg := Message{
			Type:    MsgTypeResult,
			Payload: mustMarshal(result),
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if err := conn.WriteJSON(msg); err != nil {
			a.cfg.Logger.Warn("failed to send result", zap.String("job_id", jobID), zap.Error(err))
		}
	}
}

// ── message types ────────────────────────────────────────────────────────────

type MsgType string

const (
	MsgTypeRegister MsgType = "register"
	MsgTypeJob      MsgType = "job"
	MsgTypeResult   MsgType = "result"
	MsgTypePing     MsgType = "ping"
	MsgTypePong     MsgType = "pong"
)

// Message is the envelope for all control plane ↔ agent communication.
type Message struct {
	Type    MsgType         `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// RegisterPayload is sent once on connect.
type RegisterPayload struct {
	Workers int    `json:"workers"`
	Version string `json:"version"`
}

// ── helpers ──────────────────────────────────────────────────────────────────

func toWebSocketURL(u string) string {
	u = strings.TrimRight(u, "/")
	u = strings.Replace(u, "https://", "wss://", 1)
	u = strings.Replace(u, "http://", "ws://", 1)
	return u
}

func mustMarshal(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// contextKey is unexported to avoid collisions.
type contextKey struct{}

var _ context.Context = context.Background() // compile-time check
