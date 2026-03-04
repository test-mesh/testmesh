package importer

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// HARFile represents a HAR (HTTP Archive) file
type HARFile struct {
	Log HARLog `json:"log"`
}

// HARLog represents the log section of a HAR file
type HARLog struct {
	Version string     `json:"version"`
	Creator HARCreator `json:"creator"`
	Entries []HAREntry `json:"entries"`
	Pages   []HARPage  `json:"pages,omitempty"`
}

// HARCreator represents the creator info
type HARCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// HARPage represents a page in HAR
type HARPage struct {
	StartedDateTime string `json:"startedDateTime"`
	ID              string `json:"id"`
	Title           string `json:"title"`
}

// HAREntry represents a single request/response entry
type HAREntry struct {
	StartedDateTime string      `json:"startedDateTime"`
	Time            float64     `json:"time"`
	Request         HARRequest  `json:"request"`
	Response        HARResponse `json:"response"`
	Cache           HARCache    `json:"cache"`
	Timings         HARTimings  `json:"timings"`
	PageRef         string      `json:"pageref,omitempty"`
}

// HARRequest represents an HTTP request
type HARRequest struct {
	Method      string          `json:"method"`
	URL         string          `json:"url"`
	HTTPVersion string          `json:"httpVersion"`
	Headers     []HARHeader     `json:"headers"`
	QueryString []HARQueryParam `json:"queryString"`
	Cookies     []HARCookie     `json:"cookies"`
	HeadersSize int             `json:"headersSize"`
	BodySize    int             `json:"bodySize"`
	PostData    *HARPostData    `json:"postData,omitempty"`
}

// HARResponse represents an HTTP response
type HARResponse struct {
	Status      int           `json:"status"`
	StatusText  string        `json:"statusText"`
	HTTPVersion string        `json:"httpVersion"`
	Headers     []HARHeader   `json:"headers"`
	Cookies     []HARCookie   `json:"cookies"`
	Content     HARContent    `json:"content"`
	RedirectURL string        `json:"redirectURL"`
	HeadersSize int           `json:"headersSize"`
	BodySize    int           `json:"bodySize"`
}

// HARHeader represents an HTTP header
type HARHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// HARQueryParam represents a query parameter
type HARQueryParam struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// HARCookie represents a cookie
type HARCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path,omitempty"`
	Domain   string `json:"domain,omitempty"`
	Expires  string `json:"expires,omitempty"`
	HTTPOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
}

// HARPostData represents POST data
type HARPostData struct {
	MimeType string      `json:"mimeType"`
	Text     string      `json:"text,omitempty"`
	Params   []HARParam  `json:"params,omitempty"`
}

// HARParam represents a POST parameter
type HARParam struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

// HARContent represents response content
type HARContent struct {
	Size        int    `json:"size"`
	Compression int    `json:"compression,omitempty"`
	MimeType    string `json:"mimeType"`
	Text        string `json:"text,omitempty"`
	Encoding    string `json:"encoding,omitempty"`
}

// HARCache represents cache info
type HARCache struct{}

// HARTimings represents timing info
type HARTimings struct {
	Blocked float64 `json:"blocked"`
	DNS     float64 `json:"dns"`
	Connect float64 `json:"connect"`
	Send    float64 `json:"send"`
	Wait    float64 `json:"wait"`
	Receive float64 `json:"receive"`
	SSL     float64 `json:"ssl"`
}

// HARImporter imports HAR files into TestMesh flows
type HARImporter struct {
	options *HARImportOptions
}

// HARImportOptions defines import options
type HARImportOptions struct {
	IncludeAssets      bool     // Include CSS, JS, images
	IncludeHeaders     bool     // Include request headers
	FilterDomains      []string // Only include these domains
	ExcludeDomains     []string // Exclude these domains
	GenerateAssertions bool     // Generate assertions from responses
	GroupByPage        bool     // Group requests by page
}

// DefaultHARImportOptions returns default options
func DefaultHARImportOptions() *HARImportOptions {
	return &HARImportOptions{
		IncludeAssets:      false,
		IncludeHeaders:     true,
		GenerateAssertions: true,
		GroupByPage:        false,
	}
}

// NewHARImporter creates a new HAR importer
func NewHARImporter(options *HARImportOptions) *HARImporter {
	if options == nil {
		options = DefaultHARImportOptions()
	}
	return &HARImporter{options: options}
}

// ImportedFlow represents a flow imported from HAR
type ImportedFlow struct {
	Name        string                   `json:"name" yaml:"name"`
	Description string                   `json:"description,omitempty" yaml:"description,omitempty"`
	Steps       []map[string]interface{} `json:"steps" yaml:"steps"`
}

// Import imports a HAR file and converts it to flows
func (i *HARImporter) Import(data []byte) ([]*ImportedFlow, error) {
	var har HARFile
	if err := json.Unmarshal(data, &har); err != nil {
		return nil, fmt.Errorf("failed to parse HAR: %w", err)
	}

	// Filter entries
	entries := i.filterEntries(har.Log.Entries)

	if len(entries) == 0 {
		return nil, fmt.Errorf("no entries found in HAR file")
	}

	// Sort by time
	sort.Slice(entries, func(a, b int) bool {
		timeA, _ := time.Parse(time.RFC3339, entries[a].StartedDateTime)
		timeB, _ := time.Parse(time.RFC3339, entries[b].StartedDateTime)
		return timeA.Before(timeB)
	})

	// Group entries
	var flows []*ImportedFlow
	if i.options.GroupByPage && len(har.Log.Pages) > 0 {
		flows = i.groupByPage(entries, har.Log.Pages)
	} else {
		flows = []*ImportedFlow{i.createFlow("Imported Flow", entries)}
	}

	return flows, nil
}

func (i *HARImporter) filterEntries(entries []HAREntry) []HAREntry {
	filtered := make([]HAREntry, 0, len(entries))

	for _, entry := range entries {
		// Skip non-API requests if configured
		if !i.options.IncludeAssets && i.isAsset(entry) {
			continue
		}

		// Filter by domain
		if len(i.options.FilterDomains) > 0 && !i.matchesDomain(entry.Request.URL, i.options.FilterDomains) {
			continue
		}

		// Exclude domains
		if len(i.options.ExcludeDomains) > 0 && i.matchesDomain(entry.Request.URL, i.options.ExcludeDomains) {
			continue
		}

		filtered = append(filtered, entry)
	}

	return filtered
}

func (i *HARImporter) isAsset(entry HAREntry) bool {
	contentType := ""
	for _, header := range entry.Response.Headers {
		if strings.ToLower(header.Name) == "content-type" {
			contentType = strings.ToLower(header.Value)
			break
		}
	}

	assetTypes := []string{
		"text/css",
		"text/javascript",
		"application/javascript",
		"image/",
		"font/",
		"audio/",
		"video/",
	}

	for _, assetType := range assetTypes {
		if strings.Contains(contentType, assetType) {
			return true
		}
	}

	// Check file extension
	parsedURL, _ := url.Parse(entry.Request.URL)
	path := strings.ToLower(parsedURL.Path)
	assetExtensions := []string{".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2", ".ttf"}
	for _, ext := range assetExtensions {
		if strings.HasSuffix(path, ext) {
			return true
		}
	}

	return false
}

func (i *HARImporter) matchesDomain(urlStr string, domains []string) bool {
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		return false
	}

	for _, domain := range domains {
		if strings.Contains(parsedURL.Host, domain) {
			return true
		}
	}

	return false
}

func (i *HARImporter) groupByPage(entries []HAREntry, pages []HARPage) []*ImportedFlow {
	pageEntries := make(map[string][]HAREntry)

	for _, entry := range entries {
		pageRef := entry.PageRef
		if pageRef == "" {
			pageRef = "default"
		}
		pageEntries[pageRef] = append(pageEntries[pageRef], entry)
	}

	flows := make([]*ImportedFlow, 0, len(pageEntries))

	for _, page := range pages {
		if entries, ok := pageEntries[page.ID]; ok && len(entries) > 0 {
			name := page.Title
			if name == "" {
				name = page.ID
			}
			flows = append(flows, i.createFlow(name, entries))
		}
	}

	// Add entries without page reference
	if entries, ok := pageEntries["default"]; ok && len(entries) > 0 {
		flows = append(flows, i.createFlow("Other Requests", entries))
	}

	return flows
}

func (i *HARImporter) createFlow(name string, entries []HAREntry) *ImportedFlow {
	steps := make([]map[string]interface{}, 0, len(entries))

	for idx, entry := range entries {
		step := i.entryToStep(entry, idx+1)
		steps = append(steps, step)
	}

	return &ImportedFlow{
		Name:        name,
		Description: fmt.Sprintf("Imported from HAR file with %d requests", len(entries)),
		Steps:       steps,
	}
}

func (i *HARImporter) entryToStep(entry HAREntry, idx int) map[string]interface{} {
	parsedURL, _ := url.Parse(entry.Request.URL)
	stepName := fmt.Sprintf("%s %s", entry.Request.Method, parsedURL.Path)
	if len(stepName) > 50 {
		stepName = stepName[:50] + "..."
	}

	step := map[string]interface{}{
		"id":   fmt.Sprintf("step_%d", idx),
		"name": stepName,
		"action": map[string]interface{}{
			"type": "http",
			"http": i.buildHTTPAction(entry),
		},
	}

	// Add assertions
	if i.options.GenerateAssertions {
		step["assertions"] = i.generateAssertions(entry)
	}

	return step
}

func (i *HARImporter) buildHTTPAction(entry HAREntry) map[string]interface{} {
	action := map[string]interface{}{
		"method": entry.Request.Method,
		"url":    entry.Request.URL,
	}

	// Add headers
	if i.options.IncludeHeaders && len(entry.Request.Headers) > 0 {
		headers := make(map[string]string)
		skipHeaders := []string{"cookie", "host", "content-length", "connection", "accept-encoding"}

		for _, header := range entry.Request.Headers {
			name := strings.ToLower(header.Name)
			skip := false
			for _, skipHeader := range skipHeaders {
				if name == skipHeader {
					skip = true
					break
				}
			}
			if !skip {
				headers[header.Name] = header.Value
			}
		}

		if len(headers) > 0 {
			action["headers"] = headers
		}
	}

	// Add body
	if entry.Request.PostData != nil {
		if entry.Request.PostData.Text != "" {
			// Try to parse as JSON
			var jsonBody interface{}
			if err := json.Unmarshal([]byte(entry.Request.PostData.Text), &jsonBody); err == nil {
				action["body"] = jsonBody
			} else {
				action["body"] = entry.Request.PostData.Text
			}
		} else if len(entry.Request.PostData.Params) > 0 {
			params := make(map[string]string)
			for _, param := range entry.Request.PostData.Params {
				params[param.Name] = param.Value
			}
			action["body"] = params
		}
	}

	return action
}

func (i *HARImporter) generateAssertions(entry HAREntry) []string {
	assertions := make([]string, 0)

	// Status code assertion
	assertions = append(assertions, fmt.Sprintf("response.status == %d", entry.Response.Status))

	// Content type assertion
	for _, header := range entry.Response.Headers {
		if strings.ToLower(header.Name) == "content-type" {
			if strings.Contains(header.Value, "application/json") {
				assertions = append(assertions, "response.headers['Content-Type'] contains 'application/json'")
			}
			break
		}
	}

	return assertions
}
