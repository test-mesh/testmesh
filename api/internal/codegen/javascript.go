package codegen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// JavaScriptGenerator generates JavaScript fetch code
type JavaScriptGenerator struct{}

func (g *JavaScriptGenerator) Name() string      { return "javascript" }
func (g *JavaScriptGenerator) Extension() string { return ".js" }

func (g *JavaScriptGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	// URL
	url := buildURL(step.URL, step.Query)

	// Options object
	sb.WriteString("const options = {\n")

	method := step.Method
	if method == "" {
		method = "GET"
	}
	sb.WriteString(fmt.Sprintf("  method: '%s',\n", method))

	// Headers
	if len(step.Headers) > 0 || step.Auth != nil || step.Body != nil {
		sb.WriteString("  headers: {\n")
		for k, v := range step.Headers {
			sb.WriteString(fmt.Sprintf("    '%s': '%s',\n", k, v))
		}
		if step.Auth != nil && step.Auth.Type == "bearer" {
			sb.WriteString(fmt.Sprintf("    'Authorization': 'Bearer %s',\n", step.Auth.Token))
		}
		if step.Auth != nil && step.Auth.Type == "api_key" && step.Auth.In == "header" {
			sb.WriteString(fmt.Sprintf("    '%s': '%s',\n", step.Auth.Key, step.Auth.Value))
		}
		if step.Body != nil {
			sb.WriteString("    'Content-Type': 'application/json',\n")
		}
		sb.WriteString("  },\n")
	}

	// Body
	if step.Body != nil {
		bodyJSON, _ := json.Marshal(step.Body)
		sb.WriteString(fmt.Sprintf("  body: JSON.stringify(%s),\n", string(bodyJSON)))
	}

	sb.WriteString("};\n\n")

	// Fetch call
	sb.WriteString(fmt.Sprintf("fetch('%s', options)\n", url))
	sb.WriteString("  .then(response => {\n")
	sb.WriteString("    console.log('Status:', response.status);\n")
	sb.WriteString("    return response.json();\n")
	sb.WriteString("  })\n")
	sb.WriteString("  .then(data => {\n")
	sb.WriteString("    console.log('Data:', data);\n")
	sb.WriteString("  })\n")
	sb.WriteString("  .catch(error => {\n")
	sb.WriteString("    console.error('Error:', error);\n")
	sb.WriteString("  });\n")

	return sb.String(), nil
}

// NodeJSGenerator generates Node.js axios code
type NodeJSGenerator struct{}

func (g *NodeJSGenerator) Name() string      { return "nodejs" }
func (g *NodeJSGenerator) Extension() string { return ".js" }

func (g *NodeJSGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("const axios = require('axios');\n\n")

	// Config object
	sb.WriteString("const config = {\n")

	method := step.Method
	if method == "" {
		method = "GET"
	}
	sb.WriteString(fmt.Sprintf("  method: '%s',\n", strings.ToLower(method)))
	sb.WriteString(fmt.Sprintf("  url: '%s',\n", step.URL))

	// Params
	if len(step.Query) > 0 {
		sb.WriteString("  params: {\n")
		for k, v := range step.Query {
			sb.WriteString(fmt.Sprintf("    %s: '%s',\n", k, v))
		}
		sb.WriteString("  },\n")
	}

	// Headers
	if len(step.Headers) > 0 || step.Auth != nil {
		sb.WriteString("  headers: {\n")
		for k, v := range step.Headers {
			sb.WriteString(fmt.Sprintf("    '%s': '%s',\n", k, v))
		}
		if step.Auth != nil && step.Auth.Type == "bearer" {
			sb.WriteString(fmt.Sprintf("    'Authorization': 'Bearer %s',\n", step.Auth.Token))
		}
		sb.WriteString("  },\n")
	}

	// Auth
	if step.Auth != nil && step.Auth.Type == "basic" {
		sb.WriteString("  auth: {\n")
		sb.WriteString(fmt.Sprintf("    username: '%s',\n", step.Auth.Username))
		sb.WriteString(fmt.Sprintf("    password: '%s',\n", step.Auth.Password))
		sb.WriteString("  },\n")
	}

	// Data
	if step.Body != nil {
		bodyJSON, _ := json.MarshalIndent(step.Body, "  ", "  ")
		sb.WriteString(fmt.Sprintf("  data: %s,\n", string(bodyJSON)))
	}

	sb.WriteString("};\n\n")

	// Axios call
	sb.WriteString("axios(config)\n")
	sb.WriteString("  .then(response => {\n")
	sb.WriteString("    console.log('Status:', response.status);\n")
	sb.WriteString("    console.log('Data:', response.data);\n")
	sb.WriteString("  })\n")
	sb.WriteString("  .catch(error => {\n")
	sb.WriteString("    console.error('Error:', error.message);\n")
	sb.WriteString("  });\n")

	return sb.String(), nil
}
