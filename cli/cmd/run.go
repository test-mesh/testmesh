package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var runEnv string

var runCmd = &cobra.Command{
	Use:   "run <flow.yaml>",
	Short: "Execute a flow via the TestMesh API",
	Long: `Execute a test flow defined in a YAML file.

The flow is submitted to the TestMesh API for execution.
Use --api-url to point to a different API instance (default: http://localhost:5016).
Use --env to specify the environment (default: development).`,
	Args: cobra.ExactArgs(1),
	RunE: runFlow,
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringVarP(&runEnv, "env", "e", "development", "Environment name")
}

type inlineStepResult struct {
	StepID     string `json:"step_id"`
	StepName   string `json:"step_name"`
	Action     string `json:"action"`
	Phase      string `json:"phase"`
	Status     string `json:"status"`
	DurationMs int64  `json:"duration_ms"`
	Error      string `json:"error"`
}

type inlineResult struct {
	Status     string             `json:"status"`
	DurationMs int64              `json:"duration_ms"`
	TotalSteps int                `json:"total_steps"`
	Passed     int                `json:"passed"`
	Failed     int                `json:"failed"`
	Error      string             `json:"error"`
	Steps      []inlineStepResult `json:"steps"`
}

func runFlow(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read flow file: %w", err)
	}

	// Parse YAML into a generic map to preserve the full definition
	var flowWrapper struct {
		Flow interface{} `yaml:"flow"`
	}
	if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
		return fmt.Errorf("failed to parse YAML: %w", err)
	}
	if flowWrapper.Flow == nil {
		return fmt.Errorf("invalid flow file: missing 'flow:' root key")
	}

	// Re-encode to JSON so the API can deserialize into FlowDefinition
	flowJSON, err := json.Marshal(flowWrapper.Flow)
	if err != nil {
		return fmt.Errorf("failed to encode flow: %w", err)
	}

	// Get flow name for display
	var flowMeta struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	_ = json.Unmarshal(flowJSON, &flowMeta)

	fmt.Println()
	fmt.Printf("🚀 Running flow: %s\n", flowMeta.Name)
	if flowMeta.Description != "" {
		fmt.Printf("   %s\n", flowMeta.Description)
	}
	fmt.Printf("   API: %s\n", apiURL)
	fmt.Println()

	// Build request body
	reqBody, err := json.Marshal(map[string]interface{}{
		"definition": json.RawMessage(flowJSON),
		"variables":  map[string]string{},
	})
	if err != nil {
		return fmt.Errorf("failed to build request: %w", err)
	}

	// POST to API
	start := time.Now()
	resp, err := http.Post(
		apiURL+"/api/v1/executions/run-definition",
		"application/json",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return fmt.Errorf("failed to reach API at %s — is it running?\n   %w", apiURL, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode == http.StatusBadRequest {
		var errResp struct{ Error string `json:"error"` }
		_ = json.Unmarshal(body, &errResp)
		return fmt.Errorf("invalid flow definition: %s", errResp.Error)
	}

	var result inlineResult
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("unexpected API response (%d): %s", resp.StatusCode, string(body))
	}

	// Print step results grouped by phase
	currentPhase := ""
	for _, step := range result.Steps {
		if step.Phase != currentPhase {
			currentPhase = step.Phase
			switch currentPhase {
			case "setup":
				fmt.Println("📋 Setup")
			case "main":
				fmt.Println("🔄 Steps")
			case "teardown":
				fmt.Println("🧹 Teardown")
			}
		}

		label := step.StepID
		if step.StepName != "" {
			label = step.StepName
		}

		if step.Status == "passed" {
			fmt.Printf("   ✅ %s (%s) — %dms\n", label, step.Action, step.DurationMs)
		} else {
			fmt.Printf("   ❌ %s (%s) — %dms\n", label, step.Action, step.DurationMs)
			fmt.Printf("      %s\n", step.Error)
		}
	}

	duration := time.Since(start)
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	if result.Status == "passed" {
		fmt.Printf("✅ Flow completed successfully in %s\n", duration.Round(time.Millisecond))
	} else {
		fmt.Printf("❌ Flow failed in %s\n", duration.Round(time.Millisecond))
		if result.Error != "" {
			fmt.Printf("   Error: %s\n", result.Error)
		}
	}
	fmt.Printf("   Total steps: %d\n", result.TotalSteps)
	fmt.Printf("   Passed: %d\n", result.Passed)
	fmt.Printf("   Failed: %d\n", result.Failed)
	fmt.Println()

	if result.Status == "failed" {
		return fmt.Errorf("flow failed")
	}
	return nil
}
