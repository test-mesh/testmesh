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
	reportFormat   string
	reportOutput   string
	reportTitle    string
	reportTemplate string
)

var reportCmd = &cobra.Command{
	Use:   "report <execution-id>",
	Short: "Generate test execution reports",
	Long: `Generate detailed reports from test executions.

Supported formats:
- html (default): Interactive HTML report
- json: Machine-readable JSON
- markdown: GitHub-compatible Markdown
- junit: JUnit XML for CI integration

Examples:
  testmesh report abc123 --format html -o report.html
  testmesh report abc123 --format junit -o results.xml
  testmesh report latest --format markdown`,
	Args: cobra.ExactArgs(1),
	RunE: generateReport,
}

var reportListCmd = &cobra.Command{
	Use:   "list",
	Short: "List recent executions",
	RunE:  listExecutions,
}

func init() {
	rootCmd.AddCommand(reportCmd)
	reportCmd.AddCommand(reportListCmd)

	reportCmd.Flags().StringVarP(&reportFormat, "format", "f", "html", "Report format (html, json, markdown, junit)")
	reportCmd.Flags().StringVarP(&reportOutput, "output", "o", "", "Output file path")
	reportCmd.Flags().StringVarP(&reportTitle, "title", "t", "", "Custom report title")
	reportCmd.Flags().StringVar(&reportTemplate, "template", "", "Custom template file")
}

func generateReport(cmd *cobra.Command, args []string) error {
	executionID := args[0]

	fmt.Printf("📊 Generating %s report...\n", reportFormat)
	fmt.Printf("   Execution: %s\n", executionID)
	fmt.Println()

	// Fetch execution data
	endpoint := fmt.Sprintf("/api/v1/executions/%s", executionID)
	if executionID == "latest" {
		endpoint = "/api/v1/executions/latest"
	}

	resp, err := http.Get(apiURL + endpoint)
	if err != nil {
		return fmt.Errorf("failed to fetch execution: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var execution ExecutionResult
	if err := json.NewDecoder(resp.Body).Decode(&execution); err != nil {
		return fmt.Errorf("failed to parse execution: %w", err)
	}

	// Generate report
	var report []byte
	switch strings.ToLower(reportFormat) {
	case "html":
		report = generateHTMLReport(execution)
	case "json":
		report, _ = json.MarshalIndent(execution, "", "  ")
	case "markdown":
		report = generateMarkdownReport(execution)
	case "junit":
		report = generateJUnitReport(execution)
	default:
		return fmt.Errorf("unsupported format: %s", reportFormat)
	}

	// Output
	if reportOutput != "" {
		if err := os.WriteFile(reportOutput, report, 0644); err != nil {
			return fmt.Errorf("failed to write report: %w", err)
		}
		fmt.Printf("✅ Report saved to %s\n", reportOutput)
	} else {
		fmt.Println(string(report))
	}

	return nil
}

type ExecutionResult struct {
	ID        string       `json:"id"`
	FlowName  string       `json:"flow_name"`
	Status    string       `json:"status"`
	StartTime time.Time    `json:"start_time"`
	EndTime   time.Time    `json:"end_time"`
	Duration  int64        `json:"duration_ms"`
	Steps     []StepResult `json:"steps"`
}

type StepResult struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Duration int64  `json:"duration_ms"`
	Error    string `json:"error,omitempty"`
}

func generateHTMLReport(exec ExecutionResult) []byte {
	title := reportTitle
	if title == "" {
		title = fmt.Sprintf("Test Report: %s", exec.FlowName)
	}

	passCount := 0
	failCount := 0
	for _, step := range exec.Steps {
		if step.Status == "passed" {
			passCount++
		} else {
			failCount++
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <title>%s</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-label { color: #666; font-size: 12px; text-transform: uppercase; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .step { padding: 12px; margin: 8px 0; border-left: 4px solid; background: #f8f9fa; border-radius: 0 4px 4px 0; }
    .step.passed { border-color: #28a745; }
    .step.failed { border-color: #dc3545; background: #fff5f5; }
    .step-name { font-weight: 500; }
    .step-duration { color: #666; font-size: 12px; float: right; }
    .step-error { color: #dc3545; font-size: 13px; margin-top: 5px; font-family: monospace; }
    .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>%s</h1>
    <div class="summary">
      <div class="stat">
        <div class="stat-value %s">%s</div>
        <div class="stat-label">Status</div>
      </div>
      <div class="stat">
        <div class="stat-value">%d</div>
        <div class="stat-label">Total Steps</div>
      </div>
      <div class="stat">
        <div class="stat-value passed">%d</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value failed">%d</div>
        <div class="stat-label">Failed</div>
      </div>
    </div>
    <h2>Steps</h2>
`, title, title, strings.ToLower(exec.Status), exec.Status, len(exec.Steps), passCount, failCount))

	for _, step := range exec.Steps {
		status := strings.ToLower(step.Status)
		sb.WriteString(fmt.Sprintf(`    <div class="step %s">
      <span class="step-duration">%dms</span>
      <span class="step-name">%s</span>
`, status, step.Duration, step.Name))
		if step.Error != "" {
			sb.WriteString(fmt.Sprintf(`      <div class="step-error">%s</div>
`, step.Error))
		}
		sb.WriteString("    </div>\n")
	}

	sb.WriteString(fmt.Sprintf(`    <div class="footer">
      Generated by TestMesh at %s
    </div>
  </div>
</body>
</html>`, time.Now().Format(time.RFC3339)))

	return []byte(sb.String())
}

func generateMarkdownReport(exec ExecutionResult) []byte {
	var sb strings.Builder

	title := reportTitle
	if title == "" {
		title = fmt.Sprintf("Test Report: %s", exec.FlowName)
	}

	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	sb.WriteString(fmt.Sprintf("**Status:** %s  \n", exec.Status))
	sb.WriteString(fmt.Sprintf("**Duration:** %dms  \n", exec.Duration))
	sb.WriteString(fmt.Sprintf("**Executed:** %s  \n\n", exec.StartTime.Format(time.RFC3339)))

	sb.WriteString("## Summary\n\n")
	passCount := 0
	failCount := 0
	for _, step := range exec.Steps {
		if step.Status == "passed" {
			passCount++
		} else {
			failCount++
		}
	}
	sb.WriteString(fmt.Sprintf("| Total | Passed | Failed |\n"))
	sb.WriteString(fmt.Sprintf("|-------|--------|--------|\n"))
	sb.WriteString(fmt.Sprintf("| %d | %d | %d |\n\n", len(exec.Steps), passCount, failCount))

	sb.WriteString("## Steps\n\n")
	sb.WriteString("| Step | Status | Duration |\n")
	sb.WriteString("|------|--------|----------|\n")
	for _, step := range exec.Steps {
		icon := "✅"
		if step.Status != "passed" {
			icon = "❌"
		}
		sb.WriteString(fmt.Sprintf("| %s | %s %s | %dms |\n", step.Name, icon, step.Status, step.Duration))
	}

	if failCount > 0 {
		sb.WriteString("\n## Errors\n\n")
		for _, step := range exec.Steps {
			if step.Error != "" {
				sb.WriteString(fmt.Sprintf("### %s\n```\n%s\n```\n\n", step.Name, step.Error))
			}
		}
	}

	sb.WriteString(fmt.Sprintf("\n---\n*Generated by TestMesh at %s*\n", time.Now().Format(time.RFC3339)))

	return []byte(sb.String())
}

func generateJUnitReport(exec ExecutionResult) []byte {
	var sb strings.Builder

	failCount := 0
	for _, step := range exec.Steps {
		if step.Status != "passed" {
			failCount++
		}
	}

	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	sb.WriteString("\n")
	sb.WriteString(fmt.Sprintf(`<testsuite name="%s" tests="%d" failures="%d" time="%.3f">`,
		exec.FlowName, len(exec.Steps), failCount, float64(exec.Duration)/1000))
	sb.WriteString("\n")

	for _, step := range exec.Steps {
		sb.WriteString(fmt.Sprintf(`  <testcase name="%s" time="%.3f">`, step.Name, float64(step.Duration)/1000))
		sb.WriteString("\n")
		if step.Status != "passed" && step.Error != "" {
			sb.WriteString(fmt.Sprintf(`    <failure message="%s">%s</failure>`, step.Error, step.Error))
			sb.WriteString("\n")
		}
		sb.WriteString("  </testcase>\n")
	}

	sb.WriteString("</testsuite>\n")

	return []byte(sb.String())
}

func listExecutions(cmd *cobra.Command, args []string) error {
	fmt.Println("📋 Recent Executions")
	fmt.Println()

	resp, err := http.Get(apiURL + "/api/v1/executions?limit=10")
	if err != nil {
		return fmt.Errorf("failed to fetch executions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var result struct {
		Executions []ExecutionResult `json:"executions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Executions) == 0 {
		fmt.Println("No executions found")
		return nil
	}

	for _, exec := range result.Executions {
		icon := "✅"
		if exec.Status != "passed" {
			icon = "❌"
		}
		fmt.Printf("%s %s  %s  %s  %dms\n",
			icon, exec.ID[:8], exec.FlowName, exec.StartTime.Format("2006-01-02 15:04"), exec.Duration)
	}

	fmt.Println()
	fmt.Println("Use 'testmesh report <id>' to generate a detailed report")

	// Suppress unused variable warning
	var buf bytes.Buffer
	_ = buf

	return nil
}
