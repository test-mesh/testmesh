package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/runner"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

var (
	runEnv    string
	runRemote bool
)

var runCmd = &cobra.Command{
	Use:   "run <flow.yaml>",
	Short: "Execute a flow",
	Long: `Execute a test flow defined in a YAML file.

By default, the flow runs locally using the embedded runner — no API server required.
Use --remote to submit to the TestMesh API instead (requires API running).`,
	Args: cobra.ExactArgs(1),
	RunE: runFlow,
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringVarP(&runEnv, "env", "e", "development", "Environment name")
	runCmd.Flags().BoolVar(&runRemote, "remote", false, "Submit to the TestMesh API instead of running locally")
}

func runFlow(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read flow file: %w", err)
	}

	var flowWrapper struct {
		Flow models.FlowDefinition `yaml:"flow"`
	}
	if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
		return fmt.Errorf("failed to parse YAML: %w", err)
	}
	if flowWrapper.Flow.Name == "" {
		return fmt.Errorf("invalid flow file: missing 'flow:' root key or flow.name")
	}

	definition := &flowWrapper.Flow

	fmt.Println()
	fmt.Printf("🚀 Running flow: %s\n", definition.Name)
	if definition.Description != "" {
		fmt.Printf("   %s\n", definition.Description)
	}

	if runRemote {
		return runViaAPI(definition)
	}
	return runLocally(definition)
}

// runLocally executes the flow using the embedded runner — no API server needed.
func runLocally(definition *models.FlowDefinition) error {
	fmt.Printf("   Mode: local\n\n")

	logger := zap.NewNop()

	exec := runner.NewExecutor(nil, nil, logger, nil, nil)
	result, err := exec.ExecuteInline(definition, nil)
	if err != nil {
		return fmt.Errorf("execution error: %w", err)
	}

	printResult(result.Steps, result.Status, result.Error, result.TotalSteps, result.Passed, result.Failed, result.DurationMs)

	if result.Status == "failed" {
		return fmt.Errorf("flow failed")
	}
	return nil
}

// runViaAPI submits the flow to the TestMesh API for execution.
func runViaAPI(definition *models.FlowDefinition) error {
	fmt.Printf("   API: %s\n\n", apiURL)

	flowJSON, err := json.Marshal(definition)
	if err != nil {
		return fmt.Errorf("failed to encode flow: %w", err)
	}

	reqBody, err := json.Marshal(map[string]interface{}{
		"definition": json.RawMessage(flowJSON),
		"variables":  map[string]string{},
	})
	if err != nil {
		return fmt.Errorf("failed to build request: %w", err)
	}

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

	var result runner.InlineResult
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("unexpected API response (%d): %s", resp.StatusCode, string(body))
	}

	elapsed := time.Since(start).Milliseconds()
	printResult(result.Steps, result.Status, result.Error, result.TotalSteps, result.Passed, result.Failed, elapsed)

	if result.Status == "failed" {
		return fmt.Errorf("flow failed")
	}
	return nil
}

func printResult(steps []runner.InlineStepResult, status, errMsg string, total, passed, failed int, durationMs int64) {
	currentPhase := ""
	for _, step := range steps {
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

	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	if status == "passed" {
		fmt.Printf("✅ Flow completed successfully in %dms\n", durationMs)
	} else {
		fmt.Printf("❌ Flow failed in %dms\n", durationMs)
		if errMsg != "" {
			fmt.Printf("   Error: %s\n", errMsg)
		}
	}
	fmt.Printf("   Total steps: %d\n", total)
	fmt.Printf("   Passed: %d\n", passed)
	fmt.Printf("   Failed: %d\n", failed)
	fmt.Println()
}
