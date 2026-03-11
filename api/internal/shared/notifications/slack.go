package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// SlackNotifier sends messages to Slack via Incoming Webhooks
type SlackNotifier struct {
	client *http.Client
}

// NewSlackNotifier creates a new Slack notifier
func NewSlackNotifier() *SlackNotifier {
	return &SlackNotifier{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

type slackAttachment struct {
	Color     string       `json:"color"`
	Title     string       `json:"title"`
	Text      string       `json:"text"`
	TitleLink string       `json:"title_link,omitempty"`
	Footer    string       `json:"footer"`
	Timestamp int64        `json:"ts"`
	Fields    []slackField `json:"fields,omitempty"`
}

type slackField struct {
	Title string `json:"title"`
	Value string `json:"value"`
	Short bool   `json:"short"`
}

type slackPayload struct {
	Attachments []slackAttachment `json:"attachments"`
}

// colorForType returns the Slack attachment color for a notification type
func colorForType(notifType string) string {
	switch notifType {
	case "success":
		return "#36a64f"
	case "error":
		return "#e01e5a"
	case "warning":
		return "#ecb22e"
	default:
		return "#1264a3"
	}
}

// Send posts a message to a Slack webhook URL
func (s *SlackNotifier) Send(webhookURL, title, message, notifType, entityURL string) error {
	attachment := slackAttachment{
		Color:     colorForType(notifType),
		Title:     title,
		Text:      message,
		Footer:    "TestMesh",
		Timestamp: time.Now().Unix(),
	}
	if entityURL != "" {
		attachment.TitleLink = entityURL
	}

	payload := slackPayload{
		Attachments: []slackAttachment{attachment},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal slack payload: %w", err)
	}

	resp, err := s.client.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send slack message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack webhook returned status %d", resp.StatusCode)
	}
	return nil
}
