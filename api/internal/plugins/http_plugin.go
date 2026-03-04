package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
)

// HTTPPluginRunner manages an HTTP-based plugin process
type HTTPPluginRunner struct {
	manifest   *PluginManifest
	pluginPath string
	logger     *zap.Logger

	mu      sync.RWMutex
	cmd     *exec.Cmd
	port    int
	client  *http.Client
	running bool
	baseURL string
}

// NewHTTPPluginRunner creates a new HTTP plugin runner
func NewHTTPPluginRunner(manifest *PluginManifest, pluginPath string, logger *zap.Logger) *HTTPPluginRunner {
	return &HTTPPluginRunner{
		manifest:   manifest,
		pluginPath: pluginPath,
		logger:     logger,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Name returns the plugin action name
func (r *HTTPPluginRunner) Name() string {
	return r.manifest.ID
}

// Start spawns the plugin process and waits for it to be healthy
func (r *HTTPPluginRunner) Start(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running {
		return nil // Already running
	}

	// Find an available port
	port, err := findAvailablePort()
	if err != nil {
		return fmt.Errorf("failed to find available port: %w", err)
	}
	r.port = port
	r.baseURL = fmt.Sprintf("http://127.0.0.1:%d", port)

	// Determine the command to run based on entry point
	entryPoint := r.manifest.EntryPoint
	entryPath := filepath.Join(r.pluginPath, entryPoint)

	var cmd *exec.Cmd

	// Detect runtime based on file extension or entry point
	switch {
	case filepath.Ext(entryPoint) == ".js":
		cmd = exec.CommandContext(ctx, "node", entryPath)
	case filepath.Ext(entryPoint) == ".py":
		cmd = exec.CommandContext(ctx, "python3", entryPath)
	case filepath.Ext(entryPoint) == ".sh":
		cmd = exec.CommandContext(ctx, "bash", entryPath)
	default:
		// Assume it's an executable
		cmd = exec.CommandContext(ctx, entryPath)
	}

	// Set environment variables
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("PLUGIN_PORT=%d", port),
		fmt.Sprintf("PLUGIN_ID=%s", r.manifest.ID),
	)
	cmd.Dir = r.pluginPath

	// Capture stdout/stderr for logging
	cmd.Stdout = &pluginLogWriter{logger: r.logger, level: "info", pluginID: r.manifest.ID}
	cmd.Stderr = &pluginLogWriter{logger: r.logger, level: "error", pluginID: r.manifest.ID}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start plugin process: %w", err)
	}

	r.cmd = cmd
	r.running = true

	// Wait for plugin to become healthy
	if err := r.waitForHealthy(ctx); err != nil {
		r.Stop()
		return fmt.Errorf("plugin failed to become healthy: %w", err)
	}

	r.logger.Info("Plugin started successfully",
		zap.String("plugin_id", r.manifest.ID),
		zap.Int("port", port),
	)

	return nil
}

// waitForHealthy polls the health endpoint until the plugin is ready
func (r *HTTPPluginRunner) waitForHealthy(ctx context.Context) error {
	healthURL := r.baseURL + "/health"

	// Poll for up to 30 seconds
	timeout := time.After(30 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("timeout waiting for plugin to become healthy")
		case <-ticker.C:
			resp, err := r.client.Get(healthURL)
			if err != nil {
				continue // Plugin not ready yet
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var health PluginHealthResponse
				if err := json.NewDecoder(resp.Body).Decode(&health); err == nil {
					if health.Status == "healthy" {
						return nil
					}
				}
			}
		}
	}
}

// Execute sends an action request to the plugin
func (r *HTTPPluginRunner) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	r.mu.RLock()
	if !r.running {
		r.mu.RUnlock()
		return nil, fmt.Errorf("plugin is not running")
	}
	baseURL := r.baseURL
	r.mu.RUnlock()

	// Build the request
	req := &PluginExecuteRequest{
		Action:  r.manifest.ID,
		Config:  config,
		Context: extractPluginContext(ctx),
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Send to plugin
	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/execute", bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute plugin action: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var pluginResp PluginExecuteResponse
	if err := json.Unmarshal(body, &pluginResp); err != nil {
		return nil, fmt.Errorf("failed to parse plugin response: %w", err)
	}

	// Log any messages from the plugin
	for _, log := range pluginResp.Logs {
		r.logPluginMessage(log)
	}

	// Check for errors
	if !pluginResp.Success {
		if pluginResp.Error != nil {
			return nil, pluginResp.Error
		}
		return nil, fmt.Errorf("plugin action failed")
	}

	return pluginResp.Output, nil
}

// Stop gracefully shuts down the plugin process
func (r *HTTPPluginRunner) Stop() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.running {
		return nil
	}

	// Try graceful shutdown first
	if r.cmd != nil && r.cmd.Process != nil {
		// Send shutdown signal via HTTP
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		req, _ := http.NewRequestWithContext(shutdownCtx, "POST", r.baseURL+"/shutdown", nil)
		r.client.Do(req) // Ignore errors, we'll force kill if needed

		// Wait briefly for graceful shutdown
		done := make(chan error, 1)
		go func() { done <- r.cmd.Wait() }()

		select {
		case <-done:
			// Process exited gracefully
		case <-time.After(5 * time.Second):
			// Force kill
			r.cmd.Process.Kill()
		}
	}

	r.running = false
	r.logger.Info("Plugin stopped", zap.String("plugin_id", r.manifest.ID))
	return nil
}

// IsRunning returns whether the plugin is currently running
func (r *HTTPPluginRunner) IsRunning() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.running
}

// logPluginMessage logs a message from the plugin
func (r *HTTPPluginRunner) logPluginMessage(log PluginLog) {
	switch log.Level {
	case "debug":
		r.logger.Debug(log.Message, zap.String("plugin_id", r.manifest.ID))
	case "info":
		r.logger.Info(log.Message, zap.String("plugin_id", r.manifest.ID))
	case "warn":
		r.logger.Warn(log.Message, zap.String("plugin_id", r.manifest.ID))
	case "error":
		r.logger.Error(log.Message, zap.String("plugin_id", r.manifest.ID))
	default:
		r.logger.Info(log.Message, zap.String("plugin_id", r.manifest.ID))
	}
}

// findAvailablePort finds an available TCP port
func findAvailablePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

// extractPluginContext extracts plugin context from the Go context
func extractPluginContext(ctx context.Context) *PluginContext {
	// Extract context values if set (these would be set by the executor)
	pc := &PluginContext{
		Variables:   make(map[string]string),
		StepOutputs: make(map[string]map[string]interface{}),
	}

	if executionID, ok := ctx.Value(contextKeyExecutionID).(string); ok {
		pc.ExecutionID = executionID
	}
	if flowID, ok := ctx.Value(contextKeyFlowID).(string); ok {
		pc.FlowID = flowID
	}
	if stepID, ok := ctx.Value(contextKeyStepID).(string); ok {
		pc.StepID = stepID
	}
	if vars, ok := ctx.Value(contextKeyVariables).(map[string]string); ok {
		pc.Variables = vars
	}

	return pc
}

// Context keys for plugin context
type contextKey string

const (
	contextKeyExecutionID contextKey = "execution_id"
	contextKeyFlowID      contextKey = "flow_id"
	contextKeyStepID      contextKey = "step_id"
	contextKeyVariables   contextKey = "variables"
)

// WithPluginContext adds plugin context values to a context
func WithPluginContext(ctx context.Context, executionID, flowID, stepID string, variables map[string]string) context.Context {
	ctx = context.WithValue(ctx, contextKeyExecutionID, executionID)
	ctx = context.WithValue(ctx, contextKeyFlowID, flowID)
	ctx = context.WithValue(ctx, contextKeyStepID, stepID)
	ctx = context.WithValue(ctx, contextKeyVariables, variables)
	return ctx
}

// pluginLogWriter wraps plugin stdout/stderr and logs to zap
type pluginLogWriter struct {
	logger   *zap.Logger
	level    string
	pluginID string
}

func (w *pluginLogWriter) Write(p []byte) (n int, err error) {
	msg := string(bytes.TrimSpace(p))
	if msg == "" {
		return len(p), nil
	}

	switch w.level {
	case "error":
		w.logger.Error(msg, zap.String("plugin_id", w.pluginID), zap.String("source", "stderr"))
	default:
		w.logger.Info(msg, zap.String("plugin_id", w.pluginID), zap.String("source", "stdout"))
	}
	return len(p), nil
}
