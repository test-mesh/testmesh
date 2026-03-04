package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	scheduleCron        string
	scheduleEnvironment string
	scheduleEnabled     bool
)

var scheduleCmd = &cobra.Command{
	Use:   "schedule",
	Short: "Manage scheduled test executions",
	Long: `Create, list, and manage scheduled test executions.

Examples:
  testmesh schedule create flow.yaml --cron "0 9 * * *"
  testmesh schedule list
  testmesh schedule delete abc123`,
}

var scheduleCreateCmd = &cobra.Command{
	Use:   "create <flow.yaml>",
	Short: "Create a new schedule",
	Long: `Create a new scheduled execution for a flow.

Cron expression format:
  ┌──────────── minute (0-59)
  │ ┌────────── hour (0-23)
  │ │ ┌──────── day of month (1-31)
  │ │ │ ┌────── month (1-12)
  │ │ │ │ ┌──── day of week (0-6, Sun=0)
  │ │ │ │ │
  * * * * *

Examples:
  "0 9 * * *"     - Daily at 9am
  "0 */6 * * *"   - Every 6 hours
  "0 9 * * 1-5"   - Weekdays at 9am
  "*/15 * * * *"  - Every 15 minutes`,
	Args: cobra.ExactArgs(1),
	RunE: createSchedule,
}

var scheduleListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all schedules",
	RunE:  listSchedules,
}

var scheduleDeleteCmd = &cobra.Command{
	Use:   "delete <schedule-id>",
	Short: "Delete a schedule",
	Args:  cobra.ExactArgs(1),
	RunE:  deleteSchedule,
}

var scheduleToggleCmd = &cobra.Command{
	Use:   "toggle <schedule-id>",
	Short: "Enable or disable a schedule",
	Args:  cobra.ExactArgs(1),
	RunE:  toggleSchedule,
}

var scheduleRunCmd = &cobra.Command{
	Use:   "run <schedule-id>",
	Short: "Run a schedule immediately",
	Args:  cobra.ExactArgs(1),
	RunE:  runSchedule,
}

func init() {
	rootCmd.AddCommand(scheduleCmd)
	scheduleCmd.AddCommand(scheduleCreateCmd)
	scheduleCmd.AddCommand(scheduleListCmd)
	scheduleCmd.AddCommand(scheduleDeleteCmd)
	scheduleCmd.AddCommand(scheduleToggleCmd)
	scheduleCmd.AddCommand(scheduleRunCmd)

	scheduleCreateCmd.Flags().StringVarP(&scheduleCron, "cron", "c", "", "Cron expression (required)")
	scheduleCreateCmd.Flags().StringVarP(&scheduleEnvironment, "env", "e", "", "Environment to use")
	scheduleCreateCmd.Flags().BoolVar(&scheduleEnabled, "enabled", true, "Whether schedule is enabled")
	scheduleCreateCmd.MarkFlagRequired("cron")
}

type Schedule struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	FlowID      string    `json:"flow_id"`
	Cron        string    `json:"cron"`
	Environment string    `json:"environment,omitempty"`
	Enabled     bool      `json:"enabled"`
	LastRun     time.Time `json:"last_run,omitempty"`
	NextRun     time.Time `json:"next_run,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

func createSchedule(cmd *cobra.Command, args []string) error {
	flowPath := args[0]

	// Read flow to get name
	data, err := os.ReadFile(flowPath)
	if err != nil {
		return fmt.Errorf("failed to read flow: %w", err)
	}

	fmt.Printf("📅 Creating schedule...\n")
	fmt.Printf("   Flow: %s\n", flowPath)
	fmt.Printf("   Cron: %s\n", scheduleCron)
	fmt.Println()

	// Create schedule via API
	reqBody := map[string]interface{}{
		"flow_yaml": string(data),
		"cron":      scheduleCron,
		"enabled":   scheduleEnabled,
	}

	if scheduleEnvironment != "" {
		reqBody["environment"] = scheduleEnvironment
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := http.Post(
		apiURL+"/api/v1/schedules",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var result Schedule
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Printf("✅ Schedule created\n")
	fmt.Printf("   ID: %s\n", result.ID)
	fmt.Printf("   Next run: %s\n", result.NextRun.Format("2006-01-02 15:04:05"))

	return nil
}

func listSchedules(cmd *cobra.Command, args []string) error {
	fmt.Println("📅 Schedules")
	fmt.Println()

	resp, err := http.Get(apiURL + "/api/v1/schedules")
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var result struct {
		Schedules []Schedule `json:"schedules"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Schedules) == 0 {
		fmt.Println("No schedules found")
		fmt.Println()
		fmt.Println("Create one with: testmesh schedule create <flow.yaml> --cron \"0 9 * * *\"")
		return nil
	}

	// Print header
	fmt.Printf("%-10s %-20s %-15s %-8s %-20s\n", "ID", "NAME", "CRON", "ENABLED", "NEXT RUN")
	fmt.Println(strings.Repeat("-", 75))

	for _, s := range result.Schedules {
		enabled := "✅"
		if !s.Enabled {
			enabled = "❌"
		}
		nextRun := s.NextRun.Format("2006-01-02 15:04")
		if s.NextRun.IsZero() {
			nextRun = "-"
		}
		fmt.Printf("%-10s %-20s %-15s %-8s %-20s\n",
			s.ID[:8], truncate(s.Name, 20), s.Cron, enabled, nextRun)
	}

	return nil
}

func deleteSchedule(cmd *cobra.Command, args []string) error {
	scheduleID := args[0]

	fmt.Printf("🗑️  Deleting schedule %s...\n", scheduleID)

	req, err := http.NewRequest(http.MethodDelete, apiURL+"/api/v1/schedules/"+scheduleID, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	fmt.Printf("✅ Schedule deleted\n")

	return nil
}

func toggleSchedule(cmd *cobra.Command, args []string) error {
	scheduleID := args[0]

	fmt.Printf("🔄 Toggling schedule %s...\n", scheduleID)

	reqBody := []byte(`{"toggle": true}`)
	req, err := http.NewRequest(http.MethodPatch, apiURL+"/api/v1/schedules/"+scheduleID+"/toggle", bytes.NewBuffer(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var result Schedule
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	status := "enabled"
	if !result.Enabled {
		status = "disabled"
	}
	fmt.Printf("✅ Schedule %s\n", status)

	return nil
}

func runSchedule(cmd *cobra.Command, args []string) error {
	scheduleID := args[0]

	fmt.Printf("▶️  Running schedule %s...\n", scheduleID)

	resp, err := http.Post(
		apiURL+"/api/v1/schedules/"+scheduleID+"/run",
		"application/json",
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var result struct {
		ExecutionID string `json:"execution_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Printf("✅ Execution started: %s\n", result.ExecutionID)

	return nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
