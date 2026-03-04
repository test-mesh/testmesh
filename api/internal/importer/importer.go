package importer

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
)

// ImportResult represents the result of an import operation
type ImportResult struct {
	Flows    []models.FlowDefinition `json:"flows"`
	Warnings []string                `json:"warnings,omitempty"`
	Errors   []string                `json:"errors,omitempty"`
	Stats    ImportStats             `json:"stats"`
}

// ImportStats contains statistics about the import
type ImportStats struct {
	TotalRequests   int `json:"total_requests"`
	SuccessfulFlows int `json:"successful_flows"`
	SkippedRequests int `json:"skipped_requests"`
}

// ParseHAR parses a HAR file and converts it to flow definitions
func ParseHAR(content string) (*ImportResult, error) {
	var har HARFile
	if err := json.Unmarshal([]byte(content), &har); err != nil {
		return nil, fmt.Errorf("failed to parse HAR: %w", err)
	}

	result := &ImportResult{
		Stats: ImportStats{
			TotalRequests: len(har.Log.Entries),
		},
	}

	// Skip list for common non-API requests
	skipPatterns := []string{
		".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
		".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
		".map", "favicon",
	}

	for i, entry := range har.Log.Entries {
		// Skip static assets
		skip := false
		for _, pattern := range skipPatterns {
			if strings.Contains(strings.ToLower(entry.Request.URL), pattern) {
				skip = true
				break
			}
		}
		if skip {
			result.Stats.SkippedRequests++
			continue
		}

		flow, err := harEntryToFlow(entry, i+1)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Entry %d: %s", i+1, err.Error()))
			continue
		}

		result.Flows = append(result.Flows, *flow)
		result.Stats.SuccessfulFlows++
	}

	return result, nil
}

func harEntryToFlow(entry HAREntry, index int) (*models.FlowDefinition, error) {
	parsedURL, err := url.Parse(entry.Request.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// Create flow name from URL path
	name := fmt.Sprintf("%s %s", entry.Request.Method, parsedURL.Path)
	if name == "" || parsedURL.Path == "/" {
		name = fmt.Sprintf("Request %d", index)
	}

	// Build headers map (excluding common browser headers)
	headers := make(map[string]interface{})
	skipHeaders := map[string]bool{
		"accept-encoding": true, "accept-language": true, "cache-control": true,
		"connection": true, "cookie": true, "host": true, "origin": true,
		"referer": true, "sec-ch-ua": true, "sec-ch-ua-mobile": true,
		"sec-ch-ua-platform": true, "sec-fetch-dest": true, "sec-fetch-mode": true,
		"sec-fetch-site": true, "user-agent": true, "upgrade-insecure-requests": true,
	}

	for _, h := range entry.Request.Headers {
		if !skipHeaders[strings.ToLower(h.Name)] {
			headers[h.Name] = h.Value
		}
	}

	// Build config
	config := map[string]interface{}{
		"method": entry.Request.Method,
		"url":    entry.Request.URL,
	}

	if len(headers) > 0 {
		config["headers"] = headers
	}

	// Add body if present
	if entry.Request.PostData != nil && entry.Request.PostData.Text != "" {
		config["body"] = entry.Request.PostData.Text
		if entry.Request.PostData.MimeType != "" {
			if headers["Content-Type"] == nil {
				config["headers"] = mergeHeaders(headers, map[string]interface{}{
					"Content-Type": entry.Request.PostData.MimeType,
				})
			}
		}
	}

	// Build step
	step := models.Step{
		ID:     fmt.Sprintf("step_%d", index),
		Name:   name,
		Action: "http",
		Config: config,
	}

	return &models.FlowDefinition{
		Name:        name,
		Description: fmt.Sprintf("Imported from HAR - %s", entry.Request.URL),
		Steps:       []models.Step{step},
	}, nil
}

func mergeHeaders(base, add map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range base {
		result[k] = v
	}
	for k, v := range add {
		result[k] = v
	}
	return result
}

// ParseCURL parses a cURL command and converts it to a flow definition
func ParseCURL(command string) (*ImportResult, error) {
	result := &ImportResult{
		Stats: ImportStats{TotalRequests: 1},
	}

	flow, err := curlToFlow(command)
	if err != nil {
		result.Errors = append(result.Errors, err.Error())
		return result, nil
	}

	result.Flows = append(result.Flows, *flow)
	result.Stats.SuccessfulFlows = 1
	return result, nil
}

func curlToFlow(command string) (*models.FlowDefinition, error) {
	// Normalize the command
	command = strings.TrimSpace(command)
	command = strings.ReplaceAll(command, "\\\n", " ")
	command = strings.ReplaceAll(command, "\\\r\n", " ")

	// Extract URL
	urlRegex := regexp.MustCompile(`(?:curl\s+)?['"]?(https?://[^\s'"]+)['"]?`)
	urlMatch := urlRegex.FindStringSubmatch(command)
	if len(urlMatch) < 2 {
		return nil, fmt.Errorf("could not extract URL from cURL command")
	}
	requestURL := urlMatch[1]

	parsedURL, err := url.Parse(requestURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// Extract method
	method := "GET"
	methodRegex := regexp.MustCompile(`-X\s+['"]?(\w+)['"]?`)
	if match := methodRegex.FindStringSubmatch(command); len(match) > 1 {
		method = strings.ToUpper(match[1])
	}

	// Check for implicit POST
	if strings.Contains(command, "-d ") || strings.Contains(command, "--data ") {
		if method == "GET" {
			method = "POST"
		}
	}

	// Extract headers
	headers := make(map[string]interface{})
	headerRegex := regexp.MustCompile(`-H\s+['"]([^'"]+)['"]`)
	for _, match := range headerRegex.FindAllStringSubmatch(command, -1) {
		if len(match) > 1 {
			parts := strings.SplitN(match[1], ":", 2)
			if len(parts) == 2 {
				headers[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
			}
		}
	}

	// Extract data
	var body string
	dataRegex := regexp.MustCompile(`(?:-d|--data|--data-raw|--data-binary)\s+['"]([^'"]+)['"]`)
	if match := dataRegex.FindStringSubmatch(command); len(match) > 1 {
		body = match[1]
	}

	// Create flow
	name := fmt.Sprintf("%s %s", method, parsedURL.Path)
	if parsedURL.Path == "" || parsedURL.Path == "/" {
		name = fmt.Sprintf("%s %s", method, parsedURL.Host)
	}

	// Build config
	config := map[string]interface{}{
		"method": method,
		"url":    requestURL,
	}

	if len(headers) > 0 {
		config["headers"] = headers
	}
	if body != "" {
		config["body"] = body
	}

	step := models.Step{
		ID:     "step_1",
		Name:   name,
		Action: "http",
		Config: config,
	}

	return &models.FlowDefinition{
		Name:        name,
		Description: "Imported from cURL",
		Steps:       []models.Step{step},
	}, nil
}

// PostmanCollection represents a Postman collection
type PostmanCollection struct {
	Info struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Schema      string `json:"schema"`
	} `json:"info"`
	Item     []PostmanItem     `json:"item"`
	Variable []PostmanVariable `json:"variable,omitempty"`
}

// PostmanItem represents an item in a Postman collection
type PostmanItem struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Request     *PostmanRequest  `json:"request,omitempty"`
	Response    []PostmanResponse `json:"response,omitempty"`
	Item        []PostmanItem    `json:"item,omitempty"` // For folders
}

// PostmanRequest represents a request in Postman format
type PostmanRequest struct {
	Method string          `json:"method"`
	Header []PostmanHeader `json:"header,omitempty"`
	Body   *PostmanBody    `json:"body,omitempty"`
	URL    interface{}     `json:"url"` // Can be string or object
}

// PostmanHeader represents a header in Postman format
type PostmanHeader struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type,omitempty"`
}

// PostmanBody represents a request body in Postman format
type PostmanBody struct {
	Mode       string            `json:"mode"`
	Raw        string            `json:"raw,omitempty"`
	URLEncoded []PostmanURLEncoded `json:"urlencoded,omitempty"`
	FormData   []PostmanFormData `json:"formdata,omitempty"`
}

// PostmanURLEncoded represents URL-encoded form data
type PostmanURLEncoded struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// PostmanFormData represents multipart form data
type PostmanFormData struct {
	Key  string `json:"key"`
	Value string `json:"value,omitempty"`
	Type string `json:"type,omitempty"`
	Src  string `json:"src,omitempty"`
}

// PostmanResponse represents a saved response
type PostmanResponse struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Code   int    `json:"code"`
	Body   string `json:"body,omitempty"`
}

// PostmanVariable represents a collection variable
type PostmanVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type,omitempty"`
}

// ParsePostman parses a Postman collection and converts it to flow definitions
func ParsePostman(content string) (*ImportResult, error) {
	var collection PostmanCollection
	if err := json.Unmarshal([]byte(content), &collection); err != nil {
		return nil, fmt.Errorf("failed to parse Postman collection: %w", err)
	}

	result := &ImportResult{}

	// Process items recursively
	processPostmanItems(collection.Item, "", result)

	return result, nil
}

func processPostmanItems(items []PostmanItem, prefix string, result *ImportResult) {
	for _, item := range items {
		// If it's a folder, recurse
		if len(item.Item) > 0 {
			folderPrefix := prefix
			if item.Name != "" {
				if folderPrefix != "" {
					folderPrefix += " / "
				}
				folderPrefix += item.Name
			}
			processPostmanItems(item.Item, folderPrefix, result)
			continue
		}

		// It's a request
		if item.Request == nil {
			continue
		}

		result.Stats.TotalRequests++

		flow, err := postmanItemToFlow(item, prefix)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("%s: %s", item.Name, err.Error()))
			continue
		}

		result.Flows = append(result.Flows, *flow)
		result.Stats.SuccessfulFlows++
	}
}

func postmanItemToFlow(item PostmanItem, prefix string) (*models.FlowDefinition, error) {
	req := item.Request

	// Parse URL
	var requestURL string
	switch u := req.URL.(type) {
	case string:
		requestURL = u
	case map[string]interface{}:
		if raw, ok := u["raw"].(string); ok {
			requestURL = raw
		}
	}

	if requestURL == "" {
		return nil, fmt.Errorf("no URL found")
	}

	// Build headers
	headers := make(map[string]interface{})
	for _, h := range req.Header {
		headers[h.Key] = h.Value
	}

	// Build config
	config := map[string]interface{}{
		"method": req.Method,
		"url":    requestURL,
	}

	if len(headers) > 0 {
		config["headers"] = headers
	}

	// Handle body
	if req.Body != nil {
		switch req.Body.Mode {
		case "raw":
			config["body"] = req.Body.Raw
		case "urlencoded":
			params := make(map[string]string)
			for _, p := range req.Body.URLEncoded {
				params[p.Key] = p.Value
			}
			config["body"] = params
		case "formdata":
			params := make(map[string]string)
			for _, p := range req.Body.FormData {
				if p.Type != "file" {
					params[p.Key] = p.Value
				}
			}
			config["body"] = params
		}
	}

	// Build step
	step := models.Step{
		ID:     "step_1",
		Name:   item.Name,
		Action: "http",
		Config: config,
	}

	name := item.Name
	if prefix != "" {
		name = prefix + " / " + name
	}

	return &models.FlowDefinition{
		Name:        name,
		Description: item.Description,
		Steps:       []models.Step{step},
	}, nil
}
