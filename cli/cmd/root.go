package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	cfgFile string
	apiURL  string
	verbose bool
)

// rootCmd represents the base command
var rootCmd = &cobra.Command{
	Use:   "testmesh",
	Short: "TestMesh - E2E Integration Testing Platform",
	Long: `TestMesh is a powerful E2E integration testing platform that allows you to
write tests in YAML and execute them across multiple protocols including
HTTP, Database, Kafka, gRPC, WebSocket, and Browser.

Run tests locally or connect to a TestMesh server for centralized test management.`,
	Version: "1.0.0",
}

// Execute adds all child commands to the root command and sets flags appropriately.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(initConfig)

	// Global flags
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is .testmesh.yaml)")
	rootCmd.PersistentFlags().StringVar(&apiURL, "api-url", "http://localhost:5016", "TestMesh API URL")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")
}

func initConfig() {
	// Load config from .testmesh.yaml if it exists
	if cfgFile != "" {
		// Use config file from the flag
	} else {
		// Find home directory
		home, err := os.UserHomeDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: could not get home directory: %v\n", err)
			return
		}

		// Search for config in home directory and current directory
		configPaths := []string{
			".testmesh.yaml",
			home + "/.testmesh.yaml",
		}

		for _, path := range configPaths {
			if _, err := os.Stat(path); err == nil {
				cfgFile = path
				break
			}
		}
	}
}
