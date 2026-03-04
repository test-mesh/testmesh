package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	exportFormat string
	exportOutput string
)

var exportCmd = &cobra.Command{
	Use:   "export <flow.yaml>",
	Short: "Export flows to different formats",
	Long: `Export TestMesh flows to various formats for sharing or integration.

Supported export formats:
- yaml (default): Standard TestMesh YAML format
- json: JSON format for programmatic access
- postman: Postman Collection v2.1 format
- openapi: OpenAPI 3.0 specification
- curl: Shell script with curl commands`,
	Args: cobra.MinimumNArgs(1),
	RunE: exportFlow,
}

func init() {
	rootCmd.AddCommand(exportCmd)
	exportCmd.Flags().StringVarP(&exportFormat, "format", "f", "yaml", "Export format (yaml, json, postman, openapi, curl)")
	exportCmd.Flags().StringVarP(&exportOutput, "output", "o", "", "Output file path (default: stdout)")
}

func exportFlow(cmd *cobra.Command, args []string) error {
	flowPath := args[0]

	// Read flow file
	data, err := os.ReadFile(flowPath)
	if err != nil {
		return fmt.Errorf("failed to read flow: %w", err)
	}

	var flow map[string]interface{}
	if err := yaml.Unmarshal(data, &flow); err != nil {
		return fmt.Errorf("failed to parse flow: %w", err)
	}

	fmt.Printf("📤 Exporting flow to %s format...\n", exportFormat)
	fmt.Printf("   Source: %s\n", flowPath)
	fmt.Println()

	var output []byte
	var ext string

	switch strings.ToLower(exportFormat) {
	case "yaml":
		output, err = yaml.Marshal(flow)
		ext = ".yaml"
	case "json":
		output, err = json.MarshalIndent(flow, "", "  ")
		ext = ".json"
	case "postman":
		output, err = exportToPostman(flow)
		ext = ".postman_collection.json"
	case "openapi":
		output, err = exportToOpenAPI(flow)
		ext = ".openapi.yaml"
	case "curl":
		output, err = exportToCurl(flow)
		ext = ".sh"
	default:
		return fmt.Errorf("unsupported format: %s", exportFormat)
	}

	if err != nil {
		return fmt.Errorf("export failed: %w", err)
	}

	// Output result
	if exportOutput != "" {
		// Add extension if not present
		if filepath.Ext(exportOutput) == "" {
			exportOutput += ext
		}
		if err := os.WriteFile(exportOutput, output, 0644); err != nil {
			return fmt.Errorf("failed to write output: %w", err)
		}
		fmt.Printf("✅ Exported to %s\n", exportOutput)
	} else {
		fmt.Println(string(output))
	}

	return nil
}

func exportToPostman(flow map[string]interface{}) ([]byte, error) {
	name := "Exported Flow"
	if n, ok := flow["name"].(string); ok {
		name = n
	}

	collection := map[string]interface{}{
		"info": map[string]interface{}{
			"name":   name,
			"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
		},
		"item": []interface{}{},
	}

	// Convert steps to Postman items
	if steps, ok := flow["steps"].([]interface{}); ok {
		items := make([]interface{}, 0, len(steps))
		for _, step := range steps {
			if s, ok := step.(map[string]interface{}); ok {
				item := convertStepToPostmanItem(s)
				if item != nil {
					items = append(items, item)
				}
			}
		}
		collection["item"] = items
	}

	return json.MarshalIndent(collection, "", "  ")
}

func convertStepToPostmanItem(step map[string]interface{}) map[string]interface{} {
	action, ok := step["action"].(map[string]interface{})
	if !ok {
		return nil
	}

	actionType, _ := action["type"].(string)
	if actionType != "http" {
		return nil
	}

	http, ok := action["http"].(map[string]interface{})
	if !ok {
		return nil
	}

	url, _ := http["url"].(string)
	method, _ := http["method"].(string)
	if method == "" {
		method = "GET"
	}

	item := map[string]interface{}{
		"name": step["name"],
		"request": map[string]interface{}{
			"method": strings.ToUpper(method),
			"url":    url,
		},
	}

	// Add headers
	if headers, ok := http["headers"].(map[string]interface{}); ok {
		headerList := make([]map[string]string, 0, len(headers))
		for k, v := range headers {
			headerList = append(headerList, map[string]string{
				"key":   k,
				"value": fmt.Sprintf("%v", v),
			})
		}
		item["request"].(map[string]interface{})["header"] = headerList
	}

	// Add body
	if body := http["body"]; body != nil {
		bodyJSON, _ := json.Marshal(body)
		item["request"].(map[string]interface{})["body"] = map[string]interface{}{
			"mode": "raw",
			"raw":  string(bodyJSON),
			"options": map[string]interface{}{
				"raw": map[string]string{
					"language": "json",
				},
			},
		}
	}

	return item
}

func exportToOpenAPI(flow map[string]interface{}) ([]byte, error) {
	name := "Exported API"
	if n, ok := flow["name"].(string); ok {
		name = n
	}

	spec := map[string]interface{}{
		"openapi": "3.0.0",
		"info": map[string]interface{}{
			"title":   name,
			"version": "1.0.0",
		},
		"paths": map[string]interface{}{},
	}

	paths := spec["paths"].(map[string]interface{})

	// Convert HTTP steps to paths
	if steps, ok := flow["steps"].([]interface{}); ok {
		for _, step := range steps {
			if s, ok := step.(map[string]interface{}); ok {
				addStepToOpenAPI(s, paths)
			}
		}
	}

	return yaml.Marshal(spec)
}

func addStepToOpenAPI(step map[string]interface{}, paths map[string]interface{}) {
	action, ok := step["action"].(map[string]interface{})
	if !ok {
		return
	}

	actionType, _ := action["type"].(string)
	if actionType != "http" {
		return
	}

	http, ok := action["http"].(map[string]interface{})
	if !ok {
		return
	}

	url, _ := http["url"].(string)
	method, _ := http["method"].(string)
	if method == "" {
		method = "get"
	}

	// Extract path from URL
	path := extractPath(url)

	if paths[path] == nil {
		paths[path] = map[string]interface{}{}
	}

	operation := map[string]interface{}{
		"summary":     step["name"],
		"operationId": step["id"],
		"responses": map[string]interface{}{
			"200": map[string]interface{}{
				"description": "Successful response",
			},
		},
	}

	paths[path].(map[string]interface{})[strings.ToLower(method)] = operation
}

func extractPath(url string) string {
	// Remove protocol and domain
	if idx := strings.Index(url, "://"); idx != -1 {
		url = url[idx+3:]
	}
	if idx := strings.Index(url, "/"); idx != -1 {
		return url[idx:]
	}
	return "/"
}

func exportToCurl(flow map[string]interface{}) ([]byte, error) {
	var sb strings.Builder
	sb.WriteString("#!/bin/bash\n")
	sb.WriteString("# Generated by TestMesh\n\n")

	if name, ok := flow["name"].(string); ok {
		sb.WriteString(fmt.Sprintf("# Flow: %s\n\n", name))
	}

	// Convert steps to curl commands
	if steps, ok := flow["steps"].([]interface{}); ok {
		for i, step := range steps {
			if s, ok := step.(map[string]interface{}); ok {
				curl := stepToCurl(s)
				if curl != "" {
					if name, ok := s["name"].(string); ok {
						sb.WriteString(fmt.Sprintf("# Step %d: %s\n", i+1, name))
					}
					sb.WriteString(curl)
					sb.WriteString("\n\n")
				}
			}
		}
	}

	return []byte(sb.String()), nil
}

func stepToCurl(step map[string]interface{}) string {
	action, ok := step["action"].(map[string]interface{})
	if !ok {
		return ""
	}

	actionType, _ := action["type"].(string)
	if actionType != "http" {
		return ""
	}

	http, ok := action["http"].(map[string]interface{})
	if !ok {
		return ""
	}

	url, _ := http["url"].(string)
	method, _ := http["method"].(string)
	if method == "" {
		method = "GET"
	}

	var parts []string
	parts = append(parts, "curl")
	parts = append(parts, "-X", strings.ToUpper(method))

	// Add headers
	if headers, ok := http["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			parts = append(parts, "-H", fmt.Sprintf("'%s: %v'", k, v))
		}
	}

	// Add body
	if body := http["body"]; body != nil {
		bodyJSON, _ := json.Marshal(body)
		parts = append(parts, "-d", fmt.Sprintf("'%s'", string(bodyJSON)))
	}

	parts = append(parts, fmt.Sprintf("'%s'", url))

	return strings.Join(parts, " \\\n  ")
}
