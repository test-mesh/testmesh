package reporting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

// ShareConfig holds sharing configuration
type ShareConfig struct {
	SlackWebhookURL string
	SlackChannel    string
	EmailSMTPHost   string
	EmailSMTPPort   int
	EmailFrom       string
	EmailPassword   string
	TeamsWebhookURL string
}

// Sharer handles report sharing
type Sharer struct {
	config *ShareConfig
	client *http.Client
}

// NewSharer creates a new sharer
func NewSharer(config *ShareConfig) *Sharer {
	return &Sharer{
		config: config,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// ShareToSlack shares a report to Slack
func (s *Sharer) ShareToSlack(report *ExecutionReport, pdfData []byte) error {
	if s.config.SlackWebhookURL == "" {
		return fmt.Errorf("Slack webhook URL not configured")
	}

	// Build message
	statusEmoji := ":white_check_mark:"
	statusColor := "#27ae60"
	if report.Status == "failed" {
		statusEmoji = ":x:"
		statusColor = "#e74c3c"
	}

	passedCount := 0
	failedCount := 0
	for _, step := range report.Steps {
		if step.Status == "passed" {
			passedCount++
		} else {
			failedCount++
		}
	}

	message := map[string]interface{}{
		"text": fmt.Sprintf("%s Test Report: %s", statusEmoji, report.FlowName),
		"attachments": []map[string]interface{}{
			{
				"color": statusColor,
				"blocks": []map[string]interface{}{
					{
						"type": "section",
						"fields": []map[string]interface{}{
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Flow:*\n%s", report.FlowName),
							},
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Status:*\n%s %s", statusEmoji, strings.ToUpper(report.Status)),
							},
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Duration:*\n%d ms", report.Duration),
							},
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Results:*\n:white_check_mark: %d :x: %d", passedCount, failedCount),
							},
						},
					},
					{
						"type": "context",
						"elements": []map[string]interface{}{
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("Execution ID: %s | %s", report.ID, report.StartTime.Format(time.RFC3339)),
							},
						},
					},
				},
			},
		},
	}

	if s.config.SlackChannel != "" {
		message["channel"] = s.config.SlackChannel
	}

	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	resp, err := s.client.Post(s.config.SlackWebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send to Slack: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Slack error: %s", string(respBody))
	}

	return nil
}

// ShareToTeams shares a report to Microsoft Teams
func (s *Sharer) ShareToTeams(report *ExecutionReport) error {
	if s.config.TeamsWebhookURL == "" {
		return fmt.Errorf("Teams webhook URL not configured")
	}

	statusColor := "00FF00"
	if report.Status == "failed" {
		statusColor = "FF0000"
	}

	passedCount := 0
	failedCount := 0
	for _, step := range report.Steps {
		if step.Status == "passed" {
			passedCount++
		} else {
			failedCount++
		}
	}

	card := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "http://schema.org/extensions",
		"themeColor": statusColor,
		"summary":    fmt.Sprintf("Test Report: %s", report.FlowName),
		"sections": []map[string]interface{}{
			{
				"activityTitle": fmt.Sprintf("Test Report: %s", report.FlowName),
				"facts": []map[string]string{
					{"name": "Status", "value": report.Status},
					{"name": "Duration", "value": fmt.Sprintf("%d ms", report.Duration)},
					{"name": "Passed", "value": fmt.Sprintf("%d", passedCount)},
					{"name": "Failed", "value": fmt.Sprintf("%d", failedCount)},
					{"name": "Execution ID", "value": report.ID},
				},
				"markdown": true,
			},
		},
	}

	body, err := json.Marshal(card)
	if err != nil {
		return fmt.Errorf("failed to marshal card: %w", err)
	}

	resp, err := s.client.Post(s.config.TeamsWebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send to Teams: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Teams error: %s", string(respBody))
	}

	return nil
}

// ShareViaEmail shares a report via email
func (s *Sharer) ShareViaEmail(report *ExecutionReport, pdfData []byte, recipients []string) error {
	if s.config.EmailSMTPHost == "" {
		return fmt.Errorf("email SMTP not configured")
	}

	// Build email
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Headers
	headers := map[string]string{
		"From":         s.config.EmailFrom,
		"To":           strings.Join(recipients, ", "),
		"Subject":      fmt.Sprintf("Test Report: %s - %s", report.FlowName, report.Status),
		"MIME-Version": "1.0",
		"Content-Type": fmt.Sprintf("multipart/mixed; boundary=%s", writer.Boundary()),
	}

	var headerBuf bytes.Buffer
	for k, v := range headers {
		headerBuf.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	headerBuf.WriteString("\r\n")

	// HTML body
	htmlPart, _ := writer.CreatePart(map[string][]string{
		"Content-Type": {"text/html; charset=UTF-8"},
	})
	htmlPart.Write([]byte(s.buildEmailHTML(report)))

	// PDF attachment
	if pdfData != nil {
		attachmentPart, _ := writer.CreatePart(map[string][]string{
			"Content-Type":              {"application/pdf"},
			"Content-Disposition":       {fmt.Sprintf(`attachment; filename="report_%s.pdf"`, report.ID[:8])},
			"Content-Transfer-Encoding": {"base64"},
		})
		attachmentPart.Write(pdfData)
	}

	writer.Close()

	// Send email
	auth := smtp.PlainAuth("", s.config.EmailFrom, s.config.EmailPassword, s.config.EmailSMTPHost)
	addr := fmt.Sprintf("%s:%d", s.config.EmailSMTPHost, s.config.EmailSMTPPort)

	message := append(headerBuf.Bytes(), buf.Bytes()...)

	err := smtp.SendMail(addr, auth, s.config.EmailFrom, recipients, message)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

func (s *Sharer) buildEmailHTML(report *ExecutionReport) string {
	statusColor := "#27ae60"
	if report.Status == "failed" {
		statusColor = "#e74c3c"
	}

	passedCount := 0
	failedCount := 0
	for _, step := range report.Steps {
		if step.Status == "passed" {
			passedCount++
		} else {
			failedCount++
		}
	}

	var stepsHTML strings.Builder
	for i, step := range report.Steps {
		stepColor := "#27ae60"
		if step.Status != "passed" {
			stepColor = "#e74c3c"
		}
		stepsHTML.WriteString(fmt.Sprintf(`
			<tr>
				<td style="padding: 8px; border: 1px solid #ddd;">%d</td>
				<td style="padding: 8px; border: 1px solid #ddd;">%s</td>
				<td style="padding: 8px; border: 1px solid #ddd; color: %s;">%s</td>
				<td style="padding: 8px; border: 1px solid #ddd;">%d ms</td>
			</tr>`,
			i+1, step.Name, stepColor, step.Status, step.Duration))
	}

	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
	<style>
		body { font-family: Arial, sans-serif; margin: 20px; }
		.header { background: %s; color: white; padding: 20px; border-radius: 8px; }
		.summary { margin: 20px 0; }
		table { border-collapse: collapse; width: 100%%; }
		th { background: #f5f5f5; }
		th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
	</style>
</head>
<body>
	<div class="header">
		<h1>Test Report: %s</h1>
		<p>Status: %s | Duration: %d ms</p>
	</div>
	<div class="summary">
		<h2>Summary</h2>
		<p>Passed: %d | Failed: %d | Total: %d</p>
		<p>Execution ID: %s</p>
		<p>Time: %s</p>
	</div>
	<h2>Steps</h2>
	<table>
		<tr><th>#</th><th>Step</th><th>Status</th><th>Duration</th></tr>
		%s
	</table>
	<hr>
	<p style="color: #888; font-size: 12px;">Generated by TestMesh</p>
</body>
</html>`,
		statusColor, report.FlowName, report.Status, report.Duration,
		passedCount, failedCount, len(report.Steps),
		report.ID, report.StartTime.Format(time.RFC3339),
		stepsHTML.String())
}
