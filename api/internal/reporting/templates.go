package reporting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
	"time"
)

// TemplateEngine handles custom report templates
type TemplateEngine struct {
	templates map[string]*template.Template
	funcMap   template.FuncMap
}

// NewTemplateEngine creates a new template engine
func NewTemplateEngine() *TemplateEngine {
	funcMap := template.FuncMap{
		"formatTime":     formatTime,
		"formatDuration": formatDuration,
		"percentage":     percentage,
		"statusClass":    statusClass,
		"statusIcon":     statusIcon,
		"truncate":       truncateString,
		"json":           jsonString,
		"upper":          strings.ToUpper,
		"lower":          strings.ToLower,
		"title":          strings.Title,
		"replace":        strings.ReplaceAll,
		"contains":       strings.Contains,
		"hasPrefix":      strings.HasPrefix,
		"hasSuffix":      strings.HasSuffix,
		"split":          strings.Split,
		"join":           strings.Join,
		"add":            func(a, b int) int { return a + b },
		"sub":            func(a, b int) int { return a - b },
		"mul":            func(a, b int) int { return a * b },
		"div":            func(a, b int) int { if b == 0 { return 0 }; return a / b },
		"mod":            func(a, b int) int { return a % b },
		"seq":            seq,
		"repeat":         strings.Repeat,
		"default":        defaultValue,
		"ternary":        ternary,
	}

	return &TemplateEngine{
		templates: make(map[string]*template.Template),
		funcMap:   funcMap,
	}
}

// RegisterTemplate registers a named template
func (e *TemplateEngine) RegisterTemplate(name, content string) error {
	tmpl, err := template.New(name).Funcs(e.funcMap).Parse(content)
	if err != nil {
		return fmt.Errorf("failed to parse template %s: %w", name, err)
	}
	e.templates[name] = tmpl
	return nil
}

// Render renders a template with data
func (e *TemplateEngine) Render(name string, data interface{}) (string, error) {
	tmpl, ok := e.templates[name]
	if !ok {
		return "", fmt.Errorf("template not found: %s", name)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute template: %w", err)
	}

	return buf.String(), nil
}

// RenderString renders a template string directly
func (e *TemplateEngine) RenderString(templateStr string, data interface{}) (string, error) {
	tmpl, err := template.New("inline").Funcs(e.funcMap).Parse(templateStr)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute template: %w", err)
	}

	return buf.String(), nil
}

// Template helper functions

func formatTime(t time.Time) string {
	return t.Format("2006-01-02 15:04:05")
}

func formatDuration(ms int64) string {
	if ms < 1000 {
		return fmt.Sprintf("%dms", ms)
	}
	seconds := float64(ms) / 1000
	if seconds < 60 {
		return fmt.Sprintf("%.1fs", seconds)
	}
	minutes := int(seconds / 60)
	secs := int(seconds) % 60
	return fmt.Sprintf("%dm %ds", minutes, secs)
}

func percentage(part, total int) string {
	if total == 0 {
		return "0%"
	}
	return fmt.Sprintf("%.1f%%", float64(part)/float64(total)*100)
}

func statusClass(status string) string {
	switch strings.ToLower(status) {
	case "passed", "success":
		return "success"
	case "failed", "error":
		return "danger"
	case "skipped":
		return "warning"
	default:
		return "secondary"
	}
}

func statusIcon(status string) string {
	switch strings.ToLower(status) {
	case "passed", "success":
		return "✓"
	case "failed", "error":
		return "✗"
	case "skipped":
		return "○"
	default:
		return "?"
	}
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func jsonString(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func seq(start, end int) []int {
	result := make([]int, 0, end-start+1)
	for i := start; i <= end; i++ {
		result = append(result, i)
	}
	return result
}

func defaultValue(defaultVal, val interface{}) interface{} {
	if val == nil || val == "" || val == 0 {
		return defaultVal
	}
	return val
}

func ternary(condition bool, trueVal, falseVal interface{}) interface{} {
	if condition {
		return trueVal
	}
	return falseVal
}

// Built-in templates

const HTMLReportTemplate = `
<!DOCTYPE html>
<html>
<head>
	<title>{{.Title}} - Test Report</title>
	<style>
		:root {
			--success: #27ae60;
			--danger: #e74c3c;
			--warning: #f39c12;
			--info: #3498db;
		}
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			margin: 0;
			padding: 20px;
			background: #f5f5f5;
		}
		.container {
			max-width: 1200px;
			margin: 0 auto;
		}
		.header {
			background: {{if eq .Status "passed"}}var(--success){{else}}var(--danger){{end}};
			color: white;
			padding: 30px;
			border-radius: 8px;
			margin-bottom: 20px;
		}
		.header h1 {
			margin: 0 0 10px 0;
		}
		.summary {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 20px;
			margin-bottom: 20px;
		}
		.card {
			background: white;
			padding: 20px;
			border-radius: 8px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.1);
		}
		.card-title {
			font-size: 14px;
			color: #666;
			margin-bottom: 10px;
		}
		.card-value {
			font-size: 24px;
			font-weight: bold;
		}
		.steps {
			background: white;
			border-radius: 8px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.1);
			overflow: hidden;
		}
		.step {
			padding: 15px 20px;
			border-bottom: 1px solid #eee;
			display: flex;
			align-items: center;
			gap: 15px;
		}
		.step:last-child {
			border-bottom: none;
		}
		.step-status {
			width: 24px;
			height: 24px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 14px;
			color: white;
		}
		.step-status.success { background: var(--success); }
		.step-status.danger { background: var(--danger); }
		.step-name { flex: 1; }
		.step-duration { color: #666; }
		.footer {
			text-align: center;
			padding: 20px;
			color: #666;
			font-size: 12px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>{{.Title}}</h1>
			<p>{{.FlowName}} | {{formatTime .StartTime}} | {{formatDuration .Duration}}</p>
		</div>

		<div class="summary">
			<div class="card">
				<div class="card-title">Total Steps</div>
				<div class="card-value">{{len .Steps}}</div>
			</div>
			<div class="card">
				<div class="card-title">Passed</div>
				<div class="card-value" style="color: var(--success)">{{.PassedCount}}</div>
			</div>
			<div class="card">
				<div class="card-title">Failed</div>
				<div class="card-value" style="color: var(--danger)">{{.FailedCount}}</div>
			</div>
			<div class="card">
				<div class="card-title">Duration</div>
				<div class="card-value">{{formatDuration .Duration}}</div>
			</div>
		</div>

		<div class="steps">
			{{range .Steps}}
			<div class="step">
				<div class="step-status {{statusClass .Status}}">{{statusIcon .Status}}</div>
				<div class="step-name">{{.Name}}</div>
				<div class="step-duration">{{formatDuration .Duration}}</div>
			</div>
			{{end}}
		</div>

		<div class="footer">
			Generated by TestMesh on {{formatTime .GeneratedAt}}
		</div>
	</div>
</body>
</html>
`

const MarkdownReportTemplate = `
# {{.Title}}

**Flow:** {{.FlowName}}
**Status:** {{.Status}}
**Duration:** {{formatDuration .Duration}}
**Date:** {{formatTime .StartTime}}

## Summary

| Metric | Value |
|--------|-------|
| Total Steps | {{len .Steps}} |
| Passed | {{.PassedCount}} |
| Failed | {{.FailedCount}} |
| Pass Rate | {{percentage .PassedCount (len .Steps)}} |

## Steps

| # | Step | Status | Duration |
|---|------|--------|----------|
{{range $i, $step := .Steps}}
| {{add $i 1}} | {{$step.Name}} | {{statusIcon $step.Status}} {{$step.Status}} | {{formatDuration $step.Duration}} |
{{end}}

{{if .Errors}}
## Errors

{{range .Errors}}
### {{.StepName}}

` + "```" + `
{{.Error}}
` + "```" + `

{{end}}
{{end}}

---
*Generated by TestMesh on {{formatTime .GeneratedAt}}*
`

const SlackReportTemplate = `
{
	"blocks": [
		{
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": "{{statusIcon .Status}} Test Report: {{.FlowName}}"
			}
		},
		{
			"type": "section",
			"fields": [
				{"type": "mrkdwn", "text": "*Status:*\n{{.Status}}"},
				{"type": "mrkdwn", "text": "*Duration:*\n{{formatDuration .Duration}}"},
				{"type": "mrkdwn", "text": "*Passed:*\n{{.PassedCount}}/{{len .Steps}}"},
				{"type": "mrkdwn", "text": "*Environment:*\n{{default "N/A" .Environment}}"}
			]
		},
		{
			"type": "context",
			"elements": [
				{"type": "mrkdwn", "text": "Execution ID: {{.ID}} | {{formatTime .StartTime}}"}
			]
		}
	]
}
`

// ExecutionReportData holds data for execution report rendering
type ExecutionReportData struct {
	ID          string
	Title       string
	FlowName    string
	Status      string
	StartTime   time.Time
	EndTime     time.Time
	Duration    int64
	Steps       []StepData
	PassedCount int
	FailedCount int
	Environment string
	Tags        []string
	Errors      []ErrorData
	GeneratedAt time.Time
	Metadata    map[string]string
}

// StepData holds step data for templates
type StepData struct {
	Name     string
	Status   string
	Duration int64
	Error    string
}

// ErrorData holds error data for templates
type ErrorData struct {
	StepName string
	Error    string
}

// BuildExecutionReportData builds report data from execution
func BuildExecutionReportData(report *ExecutionReport) *ExecutionReportData {
	data := &ExecutionReportData{
		ID:          report.ID,
		Title:       "Test Report",
		FlowName:    report.FlowName,
		Status:      report.Status,
		StartTime:   report.StartTime,
		EndTime:     report.EndTime,
		Duration:    report.Duration,
		Steps:       make([]StepData, len(report.Steps)),
		Environment: report.Environment,
		Tags:        report.Tags,
		Errors:      make([]ErrorData, 0),
		GeneratedAt: time.Now(),
		Metadata:    report.Metadata,
	}

	for i, step := range report.Steps {
		data.Steps[i] = StepData{
			Name:     step.Name,
			Status:   step.Status,
			Duration: step.Duration,
			Error:    step.Error,
		}

		if step.Status == "passed" {
			data.PassedCount++
		} else {
			data.FailedCount++
		}

		if step.Error != "" {
			data.Errors = append(data.Errors, ErrorData{
				StepName: step.Name,
				Error:    step.Error,
			})
		}
	}

	return data
}
