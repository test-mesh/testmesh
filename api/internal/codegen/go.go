package codegen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// GoGenerator generates Go net/http code
type GoGenerator struct{}

func (g *GoGenerator) Name() string      { return "go" }
func (g *GoGenerator) Extension() string { return ".go" }

func (g *GoGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("package main\n\n")
	sb.WriteString("import (\n")
	sb.WriteString("\t\"bytes\"\n")
	sb.WriteString("\t\"encoding/json\"\n")
	sb.WriteString("\t\"fmt\"\n")
	sb.WriteString("\t\"io\"\n")
	sb.WriteString("\t\"net/http\"\n")
	sb.WriteString(")\n\n")

	sb.WriteString("func main() {\n")

	// URL
	url := buildURL(step.URL, step.Query)

	// Body
	method := step.Method
	if method == "" {
		method = "GET"
	}

	if step.Body != nil {
		bodyJSON, _ := json.MarshalIndent(step.Body, "\t", "\t")
		sb.WriteString(fmt.Sprintf("\tbody := %s\n", string(bodyJSON)))
		sb.WriteString("\tbodyBytes, _ := json.Marshal(body)\n\n")
		sb.WriteString(fmt.Sprintf("\treq, err := http.NewRequest(\"%s\", \"%s\", bytes.NewBuffer(bodyBytes))\n", method, url))
	} else {
		sb.WriteString(fmt.Sprintf("\treq, err := http.NewRequest(\"%s\", \"%s\", nil)\n", method, url))
	}

	sb.WriteString("\tif err != nil {\n")
	sb.WriteString("\t\tpanic(err)\n")
	sb.WriteString("\t}\n\n")

	// Headers
	for k, v := range step.Headers {
		sb.WriteString(fmt.Sprintf("\treq.Header.Set(\"%s\", \"%s\")\n", k, v))
	}

	if step.Body != nil {
		sb.WriteString("\treq.Header.Set(\"Content-Type\", \"application/json\")\n")
	}

	// Auth
	if step.Auth != nil {
		switch step.Auth.Type {
		case "bearer":
			sb.WriteString(fmt.Sprintf("\treq.Header.Set(\"Authorization\", \"Bearer %s\")\n", step.Auth.Token))
		case "basic":
			sb.WriteString(fmt.Sprintf("\treq.SetBasicAuth(\"%s\", \"%s\")\n", step.Auth.Username, step.Auth.Password))
		case "api_key":
			if step.Auth.In == "header" {
				sb.WriteString(fmt.Sprintf("\treq.Header.Set(\"%s\", \"%s\")\n", step.Auth.Key, step.Auth.Value))
			}
		}
	}

	sb.WriteString("\n")

	// Client and request
	sb.WriteString("\tclient := &http.Client{}\n")
	sb.WriteString("\tresp, err := client.Do(req)\n")
	sb.WriteString("\tif err != nil {\n")
	sb.WriteString("\t\tpanic(err)\n")
	sb.WriteString("\t}\n")
	sb.WriteString("\tdefer resp.Body.Close()\n\n")

	// Response
	sb.WriteString("\trespBody, _ := io.ReadAll(resp.Body)\n")
	sb.WriteString("\tfmt.Printf(\"Status: %d\\n\", resp.StatusCode)\n")
	sb.WriteString("\tfmt.Printf(\"Body: %s\\n\", string(respBody))\n")

	sb.WriteString("}\n")

	return sb.String(), nil
}
