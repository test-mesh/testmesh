package codegen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PHPGenerator generates PHP cURL code
type PHPGenerator struct{}

func (g *PHPGenerator) Name() string      { return "php" }
func (g *PHPGenerator) Extension() string { return ".php" }

func (g *PHPGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("<?php\n\n")
	sb.WriteString("$curl = curl_init();\n\n")

	url := buildURL(step.URL, step.Query)

	sb.WriteString("curl_setopt_array($curl, [\n")
	sb.WriteString(fmt.Sprintf("    CURLOPT_URL => '%s',\n", url))
	sb.WriteString("    CURLOPT_RETURNTRANSFER => true,\n")

	method := step.Method
	if method == "" {
		method = "GET"
	}
	sb.WriteString(fmt.Sprintf("    CURLOPT_CUSTOMREQUEST => '%s',\n", method))

	// Headers
	headers := make([]string, 0)
	for k, v := range step.Headers {
		headers = append(headers, fmt.Sprintf("'%s: %s'", k, v))
	}
	if step.Auth != nil && step.Auth.Type == "bearer" {
		headers = append(headers, fmt.Sprintf("'Authorization: Bearer %s'", step.Auth.Token))
	}
	if step.Body != nil {
		headers = append(headers, "'Content-Type: application/json'")
	}
	if len(headers) > 0 {
		sb.WriteString(fmt.Sprintf("    CURLOPT_HTTPHEADER => [%s],\n", strings.Join(headers, ", ")))
	}

	// Body
	if step.Body != nil {
		bodyJSON, _ := json.Marshal(step.Body)
		sb.WriteString(fmt.Sprintf("    CURLOPT_POSTFIELDS => '%s',\n", string(bodyJSON)))
	}

	// Auth
	if step.Auth != nil && step.Auth.Type == "basic" {
		sb.WriteString(fmt.Sprintf("    CURLOPT_USERPWD => '%s:%s',\n", step.Auth.Username, step.Auth.Password))
	}

	sb.WriteString("]);\n\n")

	sb.WriteString("$response = curl_exec($curl);\n")
	sb.WriteString("$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);\n")
	sb.WriteString("curl_close($curl);\n\n")

	sb.WriteString("echo \"Status: $httpCode\\n\";\n")
	sb.WriteString("echo \"Body: $response\\n\";\n")
	sb.WriteString("?>\n")

	return sb.String(), nil
}

// RubyGenerator generates Ruby Net::HTTP code
type RubyGenerator struct{}

func (g *RubyGenerator) Name() string      { return "ruby" }
func (g *RubyGenerator) Extension() string { return ".rb" }

func (g *RubyGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("require 'net/http'\n")
	sb.WriteString("require 'uri'\n")
	sb.WriteString("require 'json'\n\n")

	url := buildURL(step.URL, step.Query)
	sb.WriteString(fmt.Sprintf("uri = URI.parse('%s')\n", url))

	method := step.Method
	if method == "" {
		method = "GET"
	}

	sb.WriteString(fmt.Sprintf("request = Net::HTTP::%s.new(uri)\n", strings.Title(strings.ToLower(method))))

	// Headers
	for k, v := range step.Headers {
		sb.WriteString(fmt.Sprintf("request['%s'] = '%s'\n", k, v))
	}

	// Auth
	if step.Auth != nil {
		switch step.Auth.Type {
		case "bearer":
			sb.WriteString(fmt.Sprintf("request['Authorization'] = 'Bearer %s'\n", step.Auth.Token))
		case "basic":
			sb.WriteString(fmt.Sprintf("request.basic_auth('%s', '%s')\n", step.Auth.Username, step.Auth.Password))
		}
	}

	// Body
	if step.Body != nil {
		bodyJSON, _ := json.Marshal(step.Body)
		sb.WriteString("request['Content-Type'] = 'application/json'\n")
		sb.WriteString(fmt.Sprintf("request.body = '%s'\n", string(bodyJSON)))
	}

	sb.WriteString("\n")
	sb.WriteString("response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') do |http|\n")
	sb.WriteString("  http.request(request)\n")
	sb.WriteString("end\n\n")

	sb.WriteString("puts \"Status: #{response.code}\"\n")
	sb.WriteString("puts \"Body: #{response.body}\"\n")

	return sb.String(), nil
}

// JavaGenerator generates Java HttpClient code
type JavaGenerator struct{}

func (g *JavaGenerator) Name() string      { return "java" }
func (g *JavaGenerator) Extension() string { return ".java" }

func (g *JavaGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("import java.net.URI;\n")
	sb.WriteString("import java.net.http.HttpClient;\n")
	sb.WriteString("import java.net.http.HttpRequest;\n")
	sb.WriteString("import java.net.http.HttpResponse;\n\n")

	sb.WriteString("public class ApiRequest {\n")
	sb.WriteString("    public static void main(String[] args) throws Exception {\n")

	url := buildURL(step.URL, step.Query)
	method := step.Method
	if method == "" {
		method = "GET"
	}

	sb.WriteString("        HttpClient client = HttpClient.newHttpClient();\n\n")

	sb.WriteString("        HttpRequest request = HttpRequest.newBuilder()\n")
	sb.WriteString(fmt.Sprintf("            .uri(URI.create(\"%s\"))\n", url))

	// Method and body
	if step.Body != nil {
		bodyJSON, _ := json.Marshal(step.Body)
		sb.WriteString(fmt.Sprintf("            .method(\"%s\", HttpRequest.BodyPublishers.ofString(\"%s\"))\n",
			method, escapeString(string(bodyJSON))))
		sb.WriteString("            .header(\"Content-Type\", \"application/json\")\n")
	} else {
		sb.WriteString(fmt.Sprintf("            .method(\"%s\", HttpRequest.BodyPublishers.noBody())\n", method))
	}

	// Headers
	for k, v := range step.Headers {
		sb.WriteString(fmt.Sprintf("            .header(\"%s\", \"%s\")\n", k, v))
	}

	// Auth
	if step.Auth != nil && step.Auth.Type == "bearer" {
		sb.WriteString(fmt.Sprintf("            .header(\"Authorization\", \"Bearer %s\")\n", step.Auth.Token))
	}

	sb.WriteString("            .build();\n\n")

	sb.WriteString("        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\n\n")
	sb.WriteString("        System.out.println(\"Status: \" + response.statusCode());\n")
	sb.WriteString("        System.out.println(\"Body: \" + response.body());\n")

	sb.WriteString("    }\n")
	sb.WriteString("}\n")

	return sb.String(), nil
}

// CSharpGenerator generates C# HttpClient code
type CSharpGenerator struct{}

func (g *CSharpGenerator) Name() string      { return "csharp" }
func (g *CSharpGenerator) Extension() string { return ".cs" }

func (g *CSharpGenerator) Generate(step *StepConfig) (string, error) {
	var sb strings.Builder

	sb.WriteString("using System;\n")
	sb.WriteString("using System.Net.Http;\n")
	sb.WriteString("using System.Text;\n")
	sb.WriteString("using System.Threading.Tasks;\n\n")

	sb.WriteString("class Program\n")
	sb.WriteString("{\n")
	sb.WriteString("    static async Task Main()\n")
	sb.WriteString("    {\n")

	url := buildURL(step.URL, step.Query)
	method := step.Method
	if method == "" {
		method = "GET"
	}

	sb.WriteString("        using var client = new HttpClient();\n\n")

	// Headers
	for k, v := range step.Headers {
		sb.WriteString(fmt.Sprintf("        client.DefaultRequestHeaders.Add(\"%s\", \"%s\");\n", k, v))
	}

	// Auth
	if step.Auth != nil && step.Auth.Type == "bearer" {
		sb.WriteString(fmt.Sprintf("        client.DefaultRequestHeaders.Add(\"Authorization\", \"Bearer %s\");\n", step.Auth.Token))
	}

	sb.WriteString("\n")

	// Request
	if step.Body != nil {
		bodyJSON, _ := json.Marshal(step.Body)
		sb.WriteString(fmt.Sprintf("        var content = new StringContent(\"%s\", Encoding.UTF8, \"application/json\");\n",
			escapeString(string(bodyJSON))))
		sb.WriteString(fmt.Sprintf("        var response = await client.%sAsync(\"%s\", content);\n",
			methodToCSharp(method), url))
	} else {
		sb.WriteString(fmt.Sprintf("        var response = await client.%sAsync(\"%s\");\n",
			methodToCSharp(method), url))
	}

	sb.WriteString("        var body = await response.Content.ReadAsStringAsync();\n\n")
	sb.WriteString("        Console.WriteLine($\"Status: {(int)response.StatusCode}\");\n")
	sb.WriteString("        Console.WriteLine($\"Body: {body}\");\n")

	sb.WriteString("    }\n")
	sb.WriteString("}\n")

	return sb.String(), nil
}

func methodToCSharp(method string) string {
	switch strings.ToUpper(method) {
	case "GET":
		return "Get"
	case "POST":
		return "Post"
	case "PUT":
		return "Put"
	case "DELETE":
		return "Delete"
	case "PATCH":
		return "Patch"
	default:
		return "Get"
	}
}
