package exporter

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
)

// ExportFormat represents the export format
type ExportFormat string

const (
	FormatPostman ExportFormat = "postman"
	FormatOpenAPI ExportFormat = "openapi"
	FormatHAR     ExportFormat = "har"
	FormatTestMesh ExportFormat = "testmesh"
)

// ExportOptions contains options for export
type ExportOptions struct {
	Format       ExportFormat `json:"format"`
	IncludeTests bool         `json:"include_tests"`
	IncludeEnv   bool         `json:"include_env"`
}

// ExportResult contains the export result
type ExportResult struct {
	Format   ExportFormat `json:"format"`
	Content  string       `json:"content"`
	Filename string       `json:"filename"`
	MimeType string       `json:"mime_type"`
}

// ExportFlows exports flows to the specified format
func ExportFlows(flows []*models.Flow, options ExportOptions) (*ExportResult, error) {
	switch options.Format {
	case FormatPostman:
		return exportToPostman(flows, options)
	case FormatOpenAPI:
		return exportToOpenAPI(flows, options)
	case FormatHAR:
		return exportToHAR(flows, options)
	case FormatTestMesh:
		return exportToTestMesh(flows, options)
	default:
		return nil, fmt.Errorf("unsupported export format: %s", options.Format)
	}
}

// Postman export

func exportToPostman(flows []*models.Flow, options ExportOptions) (*ExportResult, error) {
	collection := map[string]interface{}{
		"info": map[string]interface{}{
			"name":        "TestMesh Export",
			"description": fmt.Sprintf("Exported from TestMesh on %s", time.Now().Format(time.RFC3339)),
			"schema":      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
		},
		"item": []interface{}{},
	}

	items := []interface{}{}
	for _, flow := range flows {
		item := flowToPostmanItem(flow)
		items = append(items, item)
	}
	collection["item"] = items

	content, err := json.MarshalIndent(collection, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Postman collection: %w", err)
	}

	return &ExportResult{
		Format:   FormatPostman,
		Content:  string(content),
		Filename: "testmesh-collection.postman_collection.json",
		MimeType: "application/json",
	}, nil
}

func flowToPostmanItem(flow *models.Flow) map[string]interface{} {
	item := map[string]interface{}{
		"name": flow.Name,
	}

	if flow.Description != "" {
		item["description"] = flow.Description
	}

	// If single step, export as request; otherwise as folder
	if len(flow.Definition.Steps) == 1 {
		step := flow.Definition.Steps[0]
		request := stepToPostmanRequest(step)
		if request != nil {
			item["request"] = request
		}
	} else {
		// Multiple steps - create folder
		subItems := []interface{}{}
		for _, step := range flow.Definition.Steps {
			subItem := map[string]interface{}{
				"name": step.Name,
			}
			request := stepToPostmanRequest(step)
			if request != nil {
				subItem["request"] = request
			}
			subItems = append(subItems, subItem)
		}
		item["item"] = subItems
	}

	return item
}

func stepToPostmanRequest(step models.Step) map[string]interface{} {
	if step.Action != "http" {
		return nil
	}

	if step.Config == nil {
		return nil
	}

	request := map[string]interface{}{
		"method": step.Config["method"],
		"url": map[string]interface{}{
			"raw": step.Config["url"],
		},
	}

	// Headers
	if headers, ok := step.Config["headers"].(map[string]interface{}); ok {
		headerList := []map[string]string{}
		for k, v := range headers {
			headerList = append(headerList, map[string]string{
				"key":   k,
				"value": fmt.Sprintf("%v", v),
			})
		}
		request["header"] = headerList
	}

	// Body
	if body, ok := step.Config["body"]; ok {
		bodyStr := ""
		switch b := body.(type) {
		case string:
			bodyStr = b
		case map[string]interface{}, []interface{}:
			if jsonBytes, err := json.Marshal(b); err == nil {
				bodyStr = string(jsonBytes)
			}
		}
		if bodyStr != "" {
			request["body"] = map[string]interface{}{
				"mode": "raw",
				"raw":  bodyStr,
			}
		}
	}

	return request
}

// OpenAPI export

func exportToOpenAPI(flows []*models.Flow, options ExportOptions) (*ExportResult, error) {
	openapi := map[string]interface{}{
		"openapi": "3.0.3",
		"info": map[string]interface{}{
			"title":       "TestMesh API Export",
			"description": fmt.Sprintf("Exported from TestMesh on %s", time.Now().Format(time.RFC3339)),
			"version":     "1.0.0",
		},
		"paths": map[string]interface{}{},
	}

	paths := map[string]interface{}{}
	servers := map[string]bool{}

	for _, flow := range flows {
		for _, step := range flow.Definition.Steps {
			if step.Action != "http" || step.Config == nil {
				continue
			}

			urlStr, _ := step.Config["url"].(string)
			method, _ := step.Config["method"].(string)

			// Parse URL to extract path and server
			path, server := parseURLForOpenAPI(urlStr)
			if path == "" {
				continue
			}

			servers[server] = true

			// Add to paths
			if paths[path] == nil {
				paths[path] = map[string]interface{}{}
			}
			pathObj := paths[path].(map[string]interface{})

			operation := map[string]interface{}{
				"summary":     step.Name,
				"description": flow.Description,
				"operationId": sanitizeOperationId(step.ID),
				"responses": map[string]interface{}{
					"200": map[string]interface{}{
						"description": "Successful response",
					},
				},
			}

			// Add request body for POST/PUT/PATCH
			if body, ok := step.Config["body"]; ok && (method == "POST" || method == "PUT" || method == "PATCH") {
				operation["requestBody"] = map[string]interface{}{
					"content": map[string]interface{}{
						"application/json": map[string]interface{}{
							"schema": map[string]interface{}{
								"type":    "object",
								"example": body,
							},
						},
					},
				}
			}

			pathObj[strings.ToLower(method)] = operation
		}
	}

	openapi["paths"] = paths

	// Add servers
	serverList := []map[string]string{}
	for server := range servers {
		if server != "" {
			serverList = append(serverList, map[string]string{"url": server})
		}
	}
	if len(serverList) > 0 {
		openapi["servers"] = serverList
	}

	content, err := json.MarshalIndent(openapi, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal OpenAPI spec: %w", err)
	}

	return &ExportResult{
		Format:   FormatOpenAPI,
		Content:  string(content),
		Filename: "testmesh-api.openapi.json",
		MimeType: "application/json",
	}, nil
}

func parseURLForOpenAPI(urlStr string) (path string, server string) {
	// Handle variable URLs
	if strings.HasPrefix(urlStr, "${") || strings.HasPrefix(urlStr, "{{") {
		return "/", ""
	}

	// Simple parsing
	if strings.HasPrefix(urlStr, "http://") || strings.HasPrefix(urlStr, "https://") {
		parts := strings.SplitN(urlStr, "/", 4)
		if len(parts) >= 3 {
			server = parts[0] + "//" + parts[2]
			if len(parts) > 3 {
				path = "/" + parts[3]
			} else {
				path = "/"
			}
			// Remove query string
			if idx := strings.Index(path, "?"); idx > 0 {
				path = path[:idx]
			}
		}
	}

	return path, server
}

func sanitizeOperationId(id string) string {
	// Remove special characters
	id = strings.ReplaceAll(id, " ", "_")
	id = strings.ReplaceAll(id, "-", "_")
	return id
}

// HAR export

func exportToHAR(flows []*models.Flow, options ExportOptions) (*ExportResult, error) {
	har := map[string]interface{}{
		"log": map[string]interface{}{
			"version": "1.2",
			"creator": map[string]interface{}{
				"name":    "TestMesh",
				"version": "1.0.0",
			},
			"entries": []interface{}{},
		},
	}

	entries := []interface{}{}
	for _, flow := range flows {
		for _, step := range flow.Definition.Steps {
			entry := stepToHAREntry(step)
			if entry != nil {
				entries = append(entries, entry)
			}
		}
	}
	har["log"].(map[string]interface{})["entries"] = entries

	content, err := json.MarshalIndent(har, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal HAR: %w", err)
	}

	return &ExportResult{
		Format:   FormatHAR,
		Content:  string(content),
		Filename: "testmesh-export.har",
		MimeType: "application/json",
	}, nil
}

func stepToHAREntry(step models.Step) map[string]interface{} {
	if step.Action != "http" || step.Config == nil {
		return nil
	}

	urlStr, _ := step.Config["url"].(string)
	method, _ := step.Config["method"].(string)

	// Build headers
	headers := []map[string]string{}
	if h, ok := step.Config["headers"].(map[string]interface{}); ok {
		for k, v := range h {
			headers = append(headers, map[string]string{
				"name":  k,
				"value": fmt.Sprintf("%v", v),
			})
		}
	}

	request := map[string]interface{}{
		"method":      method,
		"url":         urlStr,
		"httpVersion": "HTTP/1.1",
		"headers":     headers,
		"queryString": []interface{}{},
		"headersSize": -1,
		"bodySize":    -1,
	}

	// Add body
	if body, ok := step.Config["body"]; ok {
		bodyStr := ""
		switch b := body.(type) {
		case string:
			bodyStr = b
		case map[string]interface{}, []interface{}:
			if jsonBytes, err := json.Marshal(b); err == nil {
				bodyStr = string(jsonBytes)
			}
		}
		if bodyStr != "" {
			request["postData"] = map[string]interface{}{
				"mimeType": "application/json",
				"text":     bodyStr,
			}
		}
	}

	return map[string]interface{}{
		"startedDateTime": time.Now().Format(time.RFC3339),
		"time":            0,
		"request":         request,
		"response": map[string]interface{}{
			"status":      0,
			"statusText":  "",
			"httpVersion": "HTTP/1.1",
			"headers":     []interface{}{},
			"content": map[string]interface{}{
				"size":     0,
				"mimeType": "",
			},
			"redirectURL": "",
			"headersSize": -1,
			"bodySize":    -1,
		},
		"cache":   map[string]interface{}{},
		"timings": map[string]interface{}{"wait": 0, "receive": 0},
		"comment": step.Name,
	}
}

// TestMesh native export

func exportToTestMesh(flows []*models.Flow, options ExportOptions) (*ExportResult, error) {
	export := map[string]interface{}{
		"version": "1.0",
		"exported_at": time.Now().Format(time.RFC3339),
		"flows": []interface{}{},
	}

	flowList := []interface{}{}
	for _, flow := range flows {
		flowData := map[string]interface{}{
			"id":          flow.ID.String(),
			"name":        flow.Name,
			"description": flow.Description,
			"suite":       flow.Suite,
			"tags":        flow.Tags,
			"definition":  flow.Definition,
		}
		flowList = append(flowList, flowData)
	}
	export["flows"] = flowList
	export["count"] = len(flowList)

	content, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal TestMesh export: %w", err)
	}

	return &ExportResult{
		Format:   FormatTestMesh,
		Content:  string(content),
		Filename: "testmesh-export.json",
		MimeType: "application/json",
	}, nil
}
