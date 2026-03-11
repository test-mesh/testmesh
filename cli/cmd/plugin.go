package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"text/tabwriter"

	"github.com/spf13/cobra"
	"go.uber.org/zap"

	"github.com/test-mesh/testmesh/internal/plugins"
)

// pluginDir is where the CLI stores installed external plugins.
func pluginDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "testmesh", "plugins")
	}
	return filepath.Join(home, ".testmesh", "plugins")
}

func newRegistry() *plugins.Registry {
	logger := zap.NewNop()
	r := plugins.NewRegistry(pluginDir(), logger)
	// Register native built-ins so they show in list output.
	r.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
	r.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))
	r.RegisterAction("redis", plugins.NewRedisNativePlugin(logger))
	// Discover external plugins already installed.
	_ = r.Discover()
	return r
}

// ---------------------------------------------------------------------------
// plugin (parent)
// ---------------------------------------------------------------------------

var pluginCmd = &cobra.Command{
	Use:   "plugin",
	Short: "Manage TestMesh plugins",
	Long: `Install, list, and uninstall TestMesh plugins.

Native built-in plugins (always available):
  kafka       kafka.produce, kafka.consume, kafka.admin.*
  postgresql  postgresql.query, postgresql.insert, postgresql.update, ...
  redis       redis.get, redis.set, redis.del, redis.exists

External plugins are installed from a local directory containing manifest.json
and loaded as HTTP sub-processes at runtime.`,
}

// ---------------------------------------------------------------------------
// plugin list
// ---------------------------------------------------------------------------

var pluginListCmd = &cobra.Command{
	Use:   "list",
	Short: "List installed plugins",
	RunE: func(cmd *cobra.Command, args []string) error {
		r := newRegistry()
		list := r.List()

		fmt.Printf("\nNative built-in plugins (always available):\n\n")
		tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(tw, "  PLUGIN\tACTIONS")
		for _, name := range []string{"kafka", "postgresql", "redis"} {
			var actions string
			switch name {
			case "kafka":
				actions = "kafka.produce, kafka.consume, kafka.admin.*"
			case "postgresql":
				actions = "postgresql.query, postgresql.insert, postgresql.update, postgresql.delete, ..."
			case "redis":
				actions = "redis.get, redis.set, redis.del, redis.exists"
			}
			fmt.Fprintf(tw, "  %s\t%s\n", name, actions)
		}
		tw.Flush()

		if len(list) == 0 {
			fmt.Printf("\nExternal plugins: none installed\n")
			fmt.Printf("  Install with: testmesh plugin install <path>\n\n")
			return nil
		}

		fmt.Printf("\nExternal plugins (%d installed):\n\n", len(list))
		tw = tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(tw, "  ID\tNAME\tVERSION\tSTATUS")
		for _, p := range list {
			status := "disabled"
			if p.Enabled {
				status = "enabled"
			}
			if p.Loaded {
				status = "loaded"
			}
			if p.Error != "" {
				status = "error: " + p.Error
			}
			fmt.Fprintf(tw, "  %s\t%s\t%s\t%s\n",
				p.Manifest.ID, p.Manifest.Name, p.Manifest.Version, status)
		}
		tw.Flush()
		fmt.Println()
		return nil
	},
}

// ---------------------------------------------------------------------------
// plugin install
// ---------------------------------------------------------------------------

var pluginInstallCmd = &cobra.Command{
	Use:   "install <path>",
	Short: "Install a plugin from a local directory",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		source := args[0]

		abs, err := filepath.Abs(source)
		if err != nil {
			return fmt.Errorf("invalid path: %w", err)
		}
		if _, err := os.Stat(abs); err != nil {
			return fmt.Errorf("path not found: %s", abs)
		}

		// Read manifest to show user what will be installed.
		manifestPath := filepath.Join(abs, "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			return fmt.Errorf("no manifest.json found in %s", abs)
		}
		var manifest struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Version     string `json:"version"`
			Description string `json:"description"`
			EntryPoint  string `json:"entry_point"`
			Type        string `json:"type"`
		}
		if err := json.Unmarshal(data, &manifest); err != nil {
			return fmt.Errorf("invalid manifest.json: %w", err)
		}

		fmt.Printf("Installing plugin: %s (%s) v%s\n", manifest.Name, manifest.ID, manifest.Version)
		fmt.Printf("  Description: %s\n", manifest.Description)
		fmt.Printf("  Entry point: %s\n", manifest.EntryPoint)
		fmt.Printf("  Destination: %s\n\n", filepath.Join(pluginDir(), manifest.ID))

		r := newRegistry()
		plugin, err := r.Install(abs)
		if err != nil {
			return fmt.Errorf("install failed: %w", err)
		}

		fmt.Printf("✅ Plugin '%s' installed successfully\n", plugin.Manifest.ID)
		fmt.Printf("   Path: %s\n\n", plugin.Path)
		fmt.Printf("Use in a flow with action: %s.<action>\n", plugin.Manifest.ID)
		return nil
	},
}

// ---------------------------------------------------------------------------
// plugin uninstall
// ---------------------------------------------------------------------------

var pluginUninstallCmd = &cobra.Command{
	Use:   "uninstall <id>",
	Short: "Uninstall a plugin by ID",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id := args[0]
		r := newRegistry()
		if err := r.Uninstall(id); err != nil {
			return fmt.Errorf("uninstall failed: %w", err)
		}
		fmt.Printf("✅ Plugin '%s' uninstalled\n", id)
		return nil
	},
}

// ---------------------------------------------------------------------------
// plugin info
// ---------------------------------------------------------------------------

var pluginInfoCmd = &cobra.Command{
	Use:   "info <id>",
	Short: "Show details about an installed plugin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id := args[0]
		r := newRegistry()
		plugin, err := r.Get(id)
		if err != nil {
			return fmt.Errorf("plugin not found: %s", id)
		}
		out, _ := json.MarshalIndent(plugin, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

func init() {
	pluginCmd.AddCommand(pluginListCmd)
	pluginCmd.AddCommand(pluginInstallCmd)
	pluginCmd.AddCommand(pluginUninstallCmd)
	pluginCmd.AddCommand(pluginInfoCmd)
	rootCmd.AddCommand(pluginCmd)
}
