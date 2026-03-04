package codegen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PythonGenerator generates Python requests code
type PythonGenerator struct{}

func (g *PythonGenerator) Name() string      { return "python" }
func (g *PythonGenerator) Extension() string { return ".py" }

func (g *PythonGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("import requests\n\n")

	// URL
	url := step.URL
	sb.WriteString(fmt.Sprintf("url = \"%s\"\n", url))

	// Query params
	if len(step.Query) > 0 {
		sb.WriteString("params = {\n")
		for k, v := range step.Query {
			sb.WriteString(fmt.Sprintf("    \"%s\": \"%s\",\n", k, v))
		}
		sb.WriteString("}\n")
	}

	// Headers
	if len(step.Headers) > 0 || step.Auth != nil {
		sb.WriteString("headers = {\n")
		for k, v := range step.Headers {
			sb.WriteString(fmt.Sprintf("    \"%s\": \"%s\",\n", k, v))
		}
		if step.Auth != nil && step.Auth.Type == "bearer" {
			sb.WriteString(fmt.Sprintf("    \"Authorization\": \"Bearer %s\",\n", step.Auth.Token))
		}
		if step.Auth != nil && step.Auth.Type == "api_key" && step.Auth.In == "header" {
			sb.WriteString(fmt.Sprintf("    \"%s\": \"%s\",\n", step.Auth.Key, step.Auth.Value))
		}
		sb.WriteString("}\n")
	}

	// Body
	if step.Body != nil {
		bodyJSON, _ := json.MarshalIndent(step.Body, "", "    ")
		sb.WriteString(fmt.Sprintf("data = %s\n", string(bodyJSON)))
	}

	// Request
	sb.WriteString("\n")
	method := strings.ToLower(step.Method)
	if method == "" {
		method = "get"
	}

	sb.WriteString(fmt.Sprintf("response = requests.%s(\n", method))
	sb.WriteString("    url,\n")

	if len(step.Query) > 0 {
		sb.WriteString("    params=params,\n")
	}
	if len(step.Headers) > 0 || step.Auth != nil {
		sb.WriteString("    headers=headers,\n")
	}
	if step.Body != nil {
		sb.WriteString("    json=data,\n")
	}
	if step.Auth != nil && step.Auth.Type == "basic" {
		sb.WriteString(fmt.Sprintf("    auth=(\"%s\", \"%s\"),\n", step.Auth.Username, step.Auth.Password))
	}
	sb.WriteString(")\n")

	// Response handling
	sb.WriteString("\n# Response\n")
	sb.WriteString("print(f\"Status: {response.status_code}\")\n")
	sb.WriteString("print(f\"Body: {response.text}\")\n")

	return sb.String(), nil
}
