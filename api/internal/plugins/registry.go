package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
)

// PluginType represents the type of plugin
type PluginType string

const (
	PluginTypeAction   PluginType = "action"   // Custom action handlers
	PluginTypeAuth     PluginType = "auth"     // Authentication providers
	PluginTypeExporter PluginType = "exporter" // Export formats
	PluginTypeImporter PluginType = "importer" // Import formats
	PluginTypeReporter PluginType = "reporter" // Report generators
)

// PluginManifest describes a plugin
type PluginManifest struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Description string            `json:"description"`
	Author      string            `json:"author"`
	Homepage    string            `json:"homepage,omitempty"`
	Type        PluginType        `json:"type"`
	EntryPoint  string            `json:"entry_point"`
	Config      map[string]interface{} `json:"config,omitempty"`
	Permissions []string          `json:"permissions,omitempty"`
}

// Plugin represents a loaded plugin
type Plugin struct {
	Manifest *PluginManifest `json:"manifest"`
	Path     string          `json:"path"`
	Enabled  bool            `json:"enabled"`
	Loaded   bool            `json:"loaded"`
	Error    string          `json:"error,omitempty"`
}

// ActionPlugin interface for action handlers
type ActionPlugin interface {
	Name() string
	Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error)
}

// Registry manages plugins
type Registry struct {
	mu        sync.RWMutex
	plugins   map[string]*Plugin
	actions   map[string]ActionPlugin
	pluginDir string
	logger    *zap.Logger
}

// NewRegistry creates a new plugin registry
func NewRegistry(pluginDir string, logger *zap.Logger) *Registry {
	return &Registry{
		plugins:   make(map[string]*Plugin),
		actions:   make(map[string]ActionPlugin),
		pluginDir: pluginDir,
		logger:    logger,
	}
}

// Discover finds all plugins in the plugin directory
func (r *Registry) Discover() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Create plugin directory if it doesn't exist
	if err := os.MkdirAll(r.pluginDir, 0755); err != nil {
		return fmt.Errorf("failed to create plugin directory: %w", err)
	}

	// Scan for plugin directories
	entries, err := os.ReadDir(r.pluginDir)
	if err != nil {
		return fmt.Errorf("failed to read plugin directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		pluginPath := filepath.Join(r.pluginDir, entry.Name())
		manifestPath := filepath.Join(pluginPath, "manifest.json")

		// Check if manifest exists
		if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
			continue
		}

		// Load manifest
		manifest, err := r.loadManifest(manifestPath)
		if err != nil {
			r.logger.Warn("Failed to load plugin manifest",
				zap.String("path", manifestPath),
				zap.Error(err))
			continue
		}

		plugin := &Plugin{
			Manifest: manifest,
			Path:     pluginPath,
			Enabled:  true,
		}

		r.plugins[manifest.ID] = plugin
		r.logger.Info("Discovered plugin",
			zap.String("id", manifest.ID),
			zap.String("name", manifest.Name),
			zap.String("version", manifest.Version))
	}

	return nil
}

// loadManifest loads a plugin manifest from file
func (r *Registry) loadManifest(path string) (*PluginManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var manifest PluginManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}

	return &manifest, nil
}

// Load loads a specific plugin
func (r *Registry) Load(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}

	if plugin.Loaded {
		return nil // Already loaded
	}

	// Load based on type
	switch plugin.Manifest.Type {
	case PluginTypeAction:
		if err := r.loadActionPlugin(plugin); err != nil {
			plugin.Error = err.Error()
			return err
		}
	default:
		return fmt.Errorf("unsupported plugin type: %s", plugin.Manifest.Type)
	}

	plugin.Loaded = true
	plugin.Error = ""
	return nil
}

// loadActionPlugin loads an action plugin using HTTP protocol
func (r *Registry) loadActionPlugin(plugin *Plugin) error {
	// Create HTTP plugin runner
	runner := NewHTTPPluginRunner(plugin.Manifest, plugin.Path, r.logger)

	// Start the plugin process
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if err := runner.Start(ctx); err != nil {
		return fmt.Errorf("failed to start plugin: %w", err)
	}

	// Register the action
	r.actions[plugin.Manifest.ID] = runner

	r.logger.Info("Loaded action plugin",
		zap.String("id", plugin.Manifest.ID),
		zap.String("entry_point", plugin.Manifest.EntryPoint))

	return nil
}

// Unload unloads a specific plugin
func (r *Registry) Unload(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}

	if !plugin.Loaded {
		return nil // Already unloaded
	}

	// Remove from action registry if it's an action plugin
	if plugin.Manifest.Type == PluginTypeAction {
		delete(r.actions, plugin.Manifest.ID)
	}

	plugin.Loaded = false
	return nil
}

// Enable enables a plugin
func (r *Registry) Enable(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}

	plugin.Enabled = true
	return nil
}

// Disable disables a plugin
func (r *Registry) Disable(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}

	plugin.Enabled = false

	// Also unload if loaded
	if plugin.Loaded {
		r.mu.Unlock()
		err := r.Unload(id)
		r.mu.Lock()
		return err
	}

	return nil
}

// List returns all plugins
func (r *Registry) List() []*Plugin {
	r.mu.RLock()
	defer r.mu.RUnlock()

	plugins := make([]*Plugin, 0, len(r.plugins))
	for _, p := range r.plugins {
		plugins = append(plugins, p)
	}
	return plugins
}

// Get returns a specific plugin
func (r *Registry) Get(id string) (*Plugin, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", id)
	}

	return plugin, nil
}

// GetAction returns a registered action plugin
func (r *Registry) GetAction(name string) (ActionPlugin, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	action, ok := r.actions[name]
	return action, ok
}

// RegisterAction registers a custom action plugin
func (r *Registry) RegisterAction(name string, plugin ActionPlugin) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.actions[name] = plugin
	r.logger.Info("Registered action plugin", zap.String("name", name))
}

// Install installs a plugin from a source (URL or local path)
func (r *Registry) Install(source string) (*Plugin, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Determine if source is a URL or local path
	parsedURL, urlErr := url.Parse(source)
	isURL := urlErr == nil && (parsedURL.Scheme == "http" || parsedURL.Scheme == "https")

	var sourcePath string

	if isURL {
		// Download from URL to temp directory
		tempDir, err := os.MkdirTemp("", "testmesh-plugin-*")
		if err != nil {
			return nil, fmt.Errorf("failed to create temp directory: %w", err)
		}
		defer os.RemoveAll(tempDir)

		// For now, we only support direct paths, not URLs
		// URL support would require downloading and extracting archives
		return nil, fmt.Errorf("URL installation not yet supported, use local path")
	} else {
		// Local path
		sourcePath = source
	}

	// Verify source exists
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("plugin source not found: %w", err)
	}

	if !sourceInfo.IsDir() {
		return nil, fmt.Errorf("plugin source must be a directory")
	}

	// Load and validate manifest
	manifestPath := filepath.Join(sourcePath, "manifest.json")
	manifest, err := r.loadManifest(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load manifest: %w", err)
	}

	// Validate manifest has required fields
	if manifest.ID == "" {
		return nil, fmt.Errorf("manifest missing required field: id")
	}
	if manifest.Name == "" {
		return nil, fmt.Errorf("manifest missing required field: name")
	}
	if manifest.EntryPoint == "" {
		return nil, fmt.Errorf("manifest missing required field: entry_point")
	}

	// Check if plugin already exists
	if _, exists := r.plugins[manifest.ID]; exists {
		return nil, fmt.Errorf("plugin already installed: %s", manifest.ID)
	}

	// Verify entry point exists
	entryPointPath := filepath.Join(sourcePath, manifest.EntryPoint)
	if _, err := os.Stat(entryPointPath); err != nil {
		return nil, fmt.Errorf("entry point not found: %s", manifest.EntryPoint)
	}

	// Create plugin directory
	destPath := filepath.Join(r.pluginDir, manifest.ID)
	if err := os.MkdirAll(destPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create plugin directory: %w", err)
	}

	// Copy plugin files
	if err := copyDir(sourcePath, destPath); err != nil {
		os.RemoveAll(destPath) // Cleanup on failure
		return nil, fmt.Errorf("failed to copy plugin files: %w", err)
	}

	// Create plugin record
	plugin := &Plugin{
		Manifest: manifest,
		Path:     destPath,
		Enabled:  true,
		Loaded:   false,
	}

	// Register plugin
	r.plugins[manifest.ID] = plugin

	r.logger.Info("Installed plugin",
		zap.String("id", manifest.ID),
		zap.String("name", manifest.Name),
		zap.String("version", manifest.Version),
	)

	return plugin, nil
}

// copyDir recursively copies a directory
func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := os.MkdirAll(dstPath, 0755); err != nil {
				return err
			}
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// copyFile copies a single file
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	srcInfo, err := srcFile.Stat()
	if err != nil {
		return err
	}

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// Uninstall removes a plugin
func (r *Registry) Uninstall(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	plugin, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}

	// Unload first
	if plugin.Loaded {
		r.mu.Unlock()
		if err := r.Unload(id); err != nil {
			r.mu.Lock()
			return err
		}
		r.mu.Lock()
	}

	// Remove from registry
	delete(r.plugins, id)

	// Remove plugin directory
	if err := os.RemoveAll(plugin.Path); err != nil {
		return fmt.Errorf("failed to remove plugin directory: %w", err)
	}

	r.logger.Info("Uninstalled plugin", zap.String("id", id))

	return nil
}

// LoadAll loads all enabled plugins
func (r *Registry) LoadAll() error {
	for id, plugin := range r.plugins {
		if plugin.Enabled && !plugin.Loaded {
			if err := r.Load(id); err != nil {
				r.logger.Error("Failed to load plugin",
					zap.String("id", id),
					zap.Error(err))
			}
		}
	}
	return nil
}
