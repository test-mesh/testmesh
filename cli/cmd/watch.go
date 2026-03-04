package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/cobra"
)

var (
	watchPattern string
	watchDebounce int
)

var watchCmd = &cobra.Command{
	Use:   "watch [directory]",
	Short: "Watch for changes and run tests automatically",
	Long: `Watch for file changes in a directory and automatically run tests.

Monitors YAML files for changes and re-executes flows when modified.
Press Ctrl+C to stop watching.`,
	Args: cobra.MaximumNArgs(1),
	RunE: watchFiles,
}

func init() {
	rootCmd.AddCommand(watchCmd)
	watchCmd.Flags().StringVarP(&watchPattern, "pattern", "p", "*.yaml", "File pattern to watch")
	watchCmd.Flags().IntVarP(&watchDebounce, "debounce", "d", 500, "Debounce time in milliseconds")
}

func watchFiles(cmd *cobra.Command, args []string) error {
	dir := "."
	if len(args) > 0 {
		dir = args[0]
	}

	// Resolve absolute path
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("failed to resolve path: %w", err)
	}

	// Create watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("failed to create watcher: %w", err)
	}
	defer watcher.Close()

	// Add directory to watch
	if err := addDirRecursive(watcher, absDir); err != nil {
		return fmt.Errorf("failed to add directories to watch: %w", err)
	}

	fmt.Printf("👁️  Watching for changes in %s\n", absDir)
	fmt.Printf("   Pattern: %s\n", watchPattern)
	fmt.Println("   Press Ctrl+C to stop")
	fmt.Println()

	// Handle signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Debounce timer
	var debounceTimer *time.Timer
	pendingFiles := make(map[string]bool)

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}

			// Check if file matches pattern
			if !matchesPattern(event.Name, watchPattern) {
				continue
			}

			// Only handle write and create events
			if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}

			// Add to pending files
			pendingFiles[event.Name] = true

			// Reset debounce timer
			if debounceTimer != nil {
				debounceTimer.Stop()
			}

			debounceTimer = time.AfterFunc(time.Duration(watchDebounce)*time.Millisecond, func() {
				for file := range pendingFiles {
					runChangedFile(file)
				}
				pendingFiles = make(map[string]bool)
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			fmt.Printf("❌ Watch error: %v\n", err)

		case <-sigChan:
			fmt.Println("\n👋 Stopping watch...")
			return nil
		}
	}
}

func addDirRecursive(watcher *fsnotify.Watcher, dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			// Skip hidden directories
			if strings.HasPrefix(info.Name(), ".") && path != dir {
				return filepath.SkipDir
			}
			return watcher.Add(path)
		}
		return nil
	})
}

func matchesPattern(filename, pattern string) bool {
	base := filepath.Base(filename)
	matched, _ := filepath.Match(pattern, base)
	return matched
}

func runChangedFile(file string) {
	fmt.Println()
	fmt.Printf("📝 File changed: %s\n", file)
	fmt.Printf("🔄 Running at %s\n", time.Now().Format("15:04:05"))
	fmt.Println()

	// Execute the flow
	args := []string{file}
	if err := runFlow(nil, args); err != nil {
		fmt.Printf("\n❌ Execution failed: %v\n", err)
	}

	fmt.Println()
	fmt.Println("👁️  Watching for changes...")
}
