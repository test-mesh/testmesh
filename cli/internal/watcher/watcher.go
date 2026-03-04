package watcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Config holds watcher configuration
type Config struct {
	// Paths to watch (files or directories)
	Paths []string

	// Pattern to match files (e.g., "*.yaml")
	Pattern string

	// Debounce delay between changes
	Debounce time.Duration

	// Recursive watch subdirectories
	Recursive bool

	// IgnoreHidden skips hidden files and directories
	IgnoreHidden bool

	// IgnorePatterns for files/directories to skip
	IgnorePatterns []string
}

// DefaultConfig returns sensible defaults
func DefaultConfig() *Config {
	return &Config{
		Paths:        []string{"."},
		Pattern:      "*.yaml",
		Debounce:     500 * time.Millisecond,
		Recursive:    true,
		IgnoreHidden: true,
		IgnorePatterns: []string{
			"node_modules",
			"vendor",
			".git",
			"__pycache__",
			".pytest_cache",
		},
	}
}

// Event represents a file change event
type Event struct {
	Path      string
	Operation string
	Time      time.Time
}

// Callback is the function called when files change
type Callback func(events []Event)

// Watcher watches files for changes
type Watcher struct {
	config    *Config
	watcher   *fsnotify.Watcher
	callback  Callback
	stopChan  chan struct{}
	doneChan  chan struct{}
	mu        sync.Mutex
	running   bool
	pending   map[string]Event
	timer     *time.Timer
}

// New creates a new file watcher
func New(config *Config) (*Watcher, error) {
	if config == nil {
		config = DefaultConfig()
	}

	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	return &Watcher{
		config:   config,
		watcher:  fsWatcher,
		stopChan: make(chan struct{}),
		doneChan: make(chan struct{}),
		pending:  make(map[string]Event),
	}, nil
}

// Start begins watching for file changes
func (w *Watcher) Start(callback Callback) error {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return fmt.Errorf("watcher already running")
	}
	w.running = true
	w.callback = callback
	w.mu.Unlock()

	// Add paths to watch
	for _, path := range w.config.Paths {
		if err := w.addPath(path); err != nil {
			return err
		}
	}

	// Start event loop
	go w.eventLoop()

	return nil
}

// Stop stops the watcher
func (w *Watcher) Stop() {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return
	}
	w.running = false
	w.mu.Unlock()

	close(w.stopChan)
	<-w.doneChan
	w.watcher.Close()
}

// addPath adds a path (file or directory) to watch
func (w *Watcher) addPath(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("failed to resolve path %s: %w", path, err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("failed to stat path %s: %w", path, err)
	}

	if info.IsDir() {
		if w.config.Recursive {
			return w.addDirRecursive(absPath)
		}
		return w.watcher.Add(absPath)
	}

	return w.watcher.Add(absPath)
}

// addDirRecursive adds a directory and all subdirectories to watch
func (w *Watcher) addDirRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() {
			return nil
		}

		name := info.Name()

		// Skip hidden directories
		if w.config.IgnoreHidden && strings.HasPrefix(name, ".") && path != dir {
			return filepath.SkipDir
		}

		// Skip ignored patterns
		for _, pattern := range w.config.IgnorePatterns {
			if matched, _ := filepath.Match(pattern, name); matched {
				return filepath.SkipDir
			}
		}

		return w.watcher.Add(path)
	})
}

// eventLoop handles file system events
func (w *Watcher) eventLoop() {
	defer close(w.doneChan)

	for {
		select {
		case <-w.stopChan:
			return

		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}

			// Check if file matches pattern
			if !w.matchesPattern(event.Name) {
				continue
			}

			// Only handle write and create events
			if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}

			w.queueEvent(Event{
				Path:      event.Name,
				Operation: event.Op.String(),
				Time:      time.Now(),
			})

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			fmt.Fprintf(os.Stderr, "Watch error: %v\n", err)
		}
	}
}

// matchesPattern checks if a file matches the configured pattern
func (w *Watcher) matchesPattern(path string) bool {
	if w.config.Pattern == "" || w.config.Pattern == "*" {
		return true
	}

	base := filepath.Base(path)

	// Check ignore hidden
	if w.config.IgnoreHidden && strings.HasPrefix(base, ".") {
		return false
	}

	matched, _ := filepath.Match(w.config.Pattern, base)
	return matched
}

// queueEvent adds an event to pending and schedules callback
func (w *Watcher) queueEvent(event Event) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.pending[event.Path] = event

	// Reset debounce timer
	if w.timer != nil {
		w.timer.Stop()
	}

	w.timer = time.AfterFunc(w.config.Debounce, func() {
		w.flushEvents()
	})
}

// flushEvents processes all pending events
func (w *Watcher) flushEvents() {
	w.mu.Lock()
	if len(w.pending) == 0 {
		w.mu.Unlock()
		return
	}

	events := make([]Event, 0, len(w.pending))
	for _, event := range w.pending {
		events = append(events, event)
	}
	w.pending = make(map[string]Event)
	callback := w.callback
	w.mu.Unlock()

	if callback != nil {
		callback(events)
	}
}

// WatchedPaths returns the list of currently watched paths
func (w *Watcher) WatchedPaths() []string {
	return w.watcher.WatchList()
}
