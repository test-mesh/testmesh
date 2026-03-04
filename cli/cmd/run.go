package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var runEnv string

var runCmd = &cobra.Command{
	Use:   "run <flow.yaml>",
	Short: "Execute a flow locally",
	Long: `Execute a test flow defined in a YAML file.

The flow will be executed locally without connecting to a server.
Use --env to specify the environment (default: development).`,
	Args: cobra.ExactArgs(1),
	RunE: runFlow,
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringVarP(&runEnv, "env", "e", "development", "Environment name")
}

func runFlow(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	// Read flow file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read flow file: %w", err)
	}

	// Parse YAML
	var flowWrapper struct {
		Flow struct {
			Name        string                   `yaml:"name"`
			Description string                   `yaml:"description"`
			Suite       string                   `yaml:"suite"`
			Setup       []map[string]interface{} `yaml:"setup"`
			Steps       []map[string]interface{} `yaml:"steps"`
			Teardown    []map[string]interface{} `yaml:"teardown"`
		} `yaml:"flow"`
	}

	if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
		return fmt.Errorf("failed to parse YAML: %w", err)
	}

	flow := flowWrapper.Flow
	if flow.Name == "" {
		return fmt.Errorf("flow name is required")
	}

	// Print header
	fmt.Println()
	fmt.Printf("🚀 Running flow: %s\n", flow.Name)
	if flow.Description != "" {
		fmt.Printf("   %s\n", flow.Description)
	}
	fmt.Printf("   Environment: %s\n", runEnv)
	fmt.Println()

	startTime := time.Now()
	totalSteps := len(flow.Setup) + len(flow.Steps) + len(flow.Teardown)
	passedSteps := 0
	failedSteps := 0

	// Execute setup steps
	if len(flow.Setup) > 0 {
		fmt.Println("📋 Setup")
		for i, step := range flow.Setup {
			if err := executeStep(step, i, "setup"); err != nil {
				failedSteps++
				fmt.Printf("   ❌ Step %d failed: %v\n", i+1, err)
			} else {
				passedSteps++
				fmt.Printf("   ✅ Step %d completed\n", i+1)
			}
		}
		fmt.Println()
	}

	// Execute main steps
	fmt.Println("🔄 Steps")
	for i, step := range flow.Steps {
		if err := executeStep(step, i, "main"); err != nil {
			failedSteps++
			fmt.Printf("   ❌ Step %d failed: %v\n", i+1, err)
		} else {
			passedSteps++
			fmt.Printf("   ✅ Step %d completed\n", i+1)
		}
	}
	fmt.Println()

	// Execute teardown steps
	if len(flow.Teardown) > 0 {
		fmt.Println("🧹 Teardown")
		for i, step := range flow.Teardown {
			if err := executeStep(step, i, "teardown"); err != nil {
				failedSteps++
				fmt.Printf("   ❌ Step %d failed: %v\n", i+1, err)
			} else {
				passedSteps++
				fmt.Printf("   ✅ Step %d completed\n", i+1)
			}
		}
		fmt.Println()
	}

	duration := time.Since(startTime)

	// Print summary
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	if failedSteps == 0 {
		fmt.Printf("✅ Flow completed successfully in %s\n", duration.Round(time.Millisecond))
	} else {
		fmt.Printf("❌ Flow completed with failures in %s\n", duration.Round(time.Millisecond))
	}
	fmt.Printf("   Total steps: %d\n", totalSteps)
	fmt.Printf("   Passed: %d\n", passedSteps)
	fmt.Printf("   Failed: %d\n", failedSteps)
	fmt.Println()

	if failedSteps > 0 {
		return fmt.Errorf("%d step(s) failed", failedSteps)
	}

	return nil
}

func executeStep(step map[string]interface{}, index int, phase string) error {
	// Get step info
	action, _ := step["action"].(string)
	if action == "" {
		return fmt.Errorf("step %d has no action", index+1)
	}

	if verbose {
		fmt.Printf("      Executing %s action...\n", action)
	}

	// Simulate step execution
	// In production, this would call the actual step executor
	time.Sleep(10 * time.Millisecond)

	return nil
}
