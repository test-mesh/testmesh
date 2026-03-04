package codegen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CurlGenerator generates cURL commands
type CurlGenerator struct{}

func (g *CurlGenerator) Name() string      { return "curl" }
func (g *CurlGenerator) Extension() string { return ".sh" }

func (g *CurlGenerator) Generate(step *StepConfig) (string, error) {
	var parts []string
	parts = append(parts, "curl")

	// Method
	method := step.Method
	if method == "" {
		method = "GET"
	}
	if method != "GET" {
		parts = append(parts, "-X", method)
	}

	// Headers
	for key, value := range step.Headers {
		parts = append(parts, "-H", fmt.Sprintf("'%s: %s'", key, value))
	}

	// Auth
	if step.Auth != nil {
		switch step.Auth.Type {
		case "bearer":
			parts = append(parts, "-H", fmt.Sprintf("'Authorization: Bearer %s'", step.Auth.Token))
		case "basic":
			parts = append(parts, "-u", fmt.Sprintf("'%s:%s'", step.Auth.Username, step.Auth.Password))
		case "api_key":
			if step.Auth.In == "header" {
				parts = append(parts, "-H", fmt.Sprintf("'%s: %s'", step.Auth.Key, step.Auth.Value))
			}
		}
	}

	// Body
	if step.Body != nil {
		bodyJSON, err := json.Marshal(step.Body)
		if err != nil {
			return "", err
		}
		parts = append(parts, "-H", "'Content-Type: application/json'")
		parts = append(parts, "-d", fmt.Sprintf("'%s'", string(bodyJSON)))
	}

	// URL
	url := buildURL(step.URL, step.Query)
	parts = append(parts, fmt.Sprintf("'%s'", url))

	// Format with line continuations
	return formatCurlCommand(parts), nil
}

func formatCurlCommand(parts []string) string {
	if len(parts) <= 3 {
		return strings.Join(parts, " ")
	}

	var lines []string
	lines = append(lines, parts[0])

	for i := 1; i < len(parts)-1; i += 2 {
		if i+1 < len(parts)-1 {
			lines = append(lines, fmt.Sprintf("  %s %s \\", parts[i], parts[i+1]))
		} else if i+1 == len(parts)-1 {
			lines = append(lines, fmt.Sprintf("  %s %s \\", parts[i], parts[i+1]))
		}
	}

	// URL is always last
	lines = append(lines, fmt.Sprintf("  %s", parts[len(parts)-1]))

	return strings.Join(lines, "\n")
}
