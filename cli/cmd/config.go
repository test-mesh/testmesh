package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage TestMesh configuration",
	Long: `View and modify TestMesh CLI configuration.

Configuration is stored in ~/.testmesh/config.json and can be
overridden by environment variables or command flags.`,
}

var configGetCmd = &cobra.Command{
	Use:   "get [key]",
	Short: "Get configuration value",
	Long: `Get a configuration value by key, or list all values if no key specified.

Available keys:
  api_url      - TestMesh server URL
  timeout      - Request timeout in seconds
  output       - Default output format (json, yaml, table)
  color        - Enable colored output (true/false)
  debug        - Enable debug logging (true/false)`,
	Args: cobra.MaximumNArgs(1),
	RunE: configGet,
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set configuration value",
	Args:  cobra.ExactArgs(2),
	RunE:  configSet,
}

var configResetCmd = &cobra.Command{
	Use:   "reset",
	Short: "Reset configuration to defaults",
	RunE:  configReset,
}

var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "Show configuration file path",
	RunE:  configPath,
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configGetCmd)
	configCmd.AddCommand(configSetCmd)
	configCmd.AddCommand(configResetCmd)
	configCmd.AddCommand(configPathCmd)
}

type Config struct {
	APIURL  string `json:"api_url"`
	Timeout int    `json:"timeout"`
	Output  string `json:"output"`
	Color   bool   `json:"color"`
	Debug   bool   `json:"debug"`
}

func defaultConfig() *Config {
	return &Config{
		APIURL:  "http://localhost:5016",
		Timeout: 30,
		Output:  "table",
		Color:   true,
		Debug:   false,
	}
}

func getConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(home, ".testmesh", "config.json"), nil
}

func loadConfig() (*Config, error) {
	configPath, err := getConfigPath()
	if err != nil {
		return defaultConfig(), nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultConfig(), nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	config := defaultConfig()
	if err := json.Unmarshal(data, config); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	return config, nil
}

func saveConfig(config *Config) error {
	configPath, err := getConfigPath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

func configGet(cmd *cobra.Command, args []string) error {
	config, err := loadConfig()
	if err != nil {
		return err
	}

	if len(args) == 0 {
		// List all config values
		fmt.Println("⚙️  Configuration")
		fmt.Println()
		fmt.Printf("  api_url:  %s\n", config.APIURL)
		fmt.Printf("  timeout:  %d\n", config.Timeout)
		fmt.Printf("  output:   %s\n", config.Output)
		fmt.Printf("  color:    %t\n", config.Color)
		fmt.Printf("  debug:    %t\n", config.Debug)
		fmt.Println()

		configPath, _ := getConfigPath()
		fmt.Printf("Config file: %s\n", configPath)
		return nil
	}

	key := strings.ToLower(args[0])
	var value interface{}

	switch key {
	case "api_url":
		value = config.APIURL
	case "timeout":
		value = config.Timeout
	case "output":
		value = config.Output
	case "color":
		value = config.Color
	case "debug":
		value = config.Debug
	default:
		return fmt.Errorf("unknown config key: %s", key)
	}

	fmt.Printf("%v\n", value)
	return nil
}

func configSet(cmd *cobra.Command, args []string) error {
	key := strings.ToLower(args[0])
	value := args[1]

	config, err := loadConfig()
	if err != nil {
		return err
	}

	switch key {
	case "api_url":
		config.APIURL = value
	case "timeout":
		var timeout int
		if _, err := fmt.Sscanf(value, "%d", &timeout); err != nil {
			return fmt.Errorf("timeout must be a number")
		}
		config.Timeout = timeout
	case "output":
		if value != "json" && value != "yaml" && value != "table" {
			return fmt.Errorf("output must be json, yaml, or table")
		}
		config.Output = value
	case "color":
		config.Color = value == "true" || value == "1" || value == "yes"
	case "debug":
		config.Debug = value == "true" || value == "1" || value == "yes"
	default:
		return fmt.Errorf("unknown config key: %s", key)
	}

	if err := saveConfig(config); err != nil {
		return err
	}

	fmt.Printf("✅ Set %s = %s\n", key, value)
	return nil
}

func configReset(cmd *cobra.Command, args []string) error {
	config := defaultConfig()

	if err := saveConfig(config); err != nil {
		return err
	}

	fmt.Println("✅ Configuration reset to defaults")
	return nil
}

func configPath(cmd *cobra.Command, args []string) error {
	path, err := getConfigPath()
	if err != nil {
		return err
	}
	fmt.Println(path)
	return nil
}
