package mocks

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// EndpointMatcher matches incoming requests to mock endpoints
type EndpointMatcher struct {
	endpoints []*models.MockEndpoint
	logger    *zap.Logger
	mu        sync.RWMutex
}

// NewEndpointMatcher creates a new endpoint matcher
func NewEndpointMatcher(endpoints []models.MockEndpoint, logger *zap.Logger) *EndpointMatcher {
	// Convert to pointers for easier manipulation
	endpointPtrs := make([]*models.MockEndpoint, len(endpoints))
	for i := range endpoints {
		endpointPtrs[i] = &endpoints[i]
	}

	return &EndpointMatcher{
		endpoints: endpointPtrs,
		logger:    logger,
	}
}

// AddEndpoint adds a new endpoint to the matcher
func (m *EndpointMatcher) AddEndpoint(endpoint *models.MockEndpoint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.endpoints = append(m.endpoints, endpoint)

	// Re-sort by priority (higher priority first)
	// Already sorted in database query, but ensure consistency
}

// Match finds the first matching endpoint for a request
func (m *EndpointMatcher) Match(method, path string, headers, queryParams map[string]interface{}, body []byte) (*models.MockEndpoint, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Iterate through endpoints (already sorted by priority)
	for _, endpoint := range m.endpoints {
		if m.matchEndpoint(endpoint, method, path, headers, queryParams, body) {
			return endpoint, true
		}
	}

	return nil, false
}

// matchEndpoint checks if a request matches an endpoint
func (m *EndpointMatcher) matchEndpoint(endpoint *models.MockEndpoint, method, path string, headers, queryParams map[string]interface{}, body []byte) bool {
	// Match HTTP method
	if !strings.EqualFold(endpoint.Method, method) {
		return false
	}

	// Match path
	if !m.matchPath(endpoint.Path, endpoint.MatchConfig.PathPattern, path) {
		return false
	}

	// Match headers
	if !m.matchHeaders(endpoint.MatchConfig.Headers, headers) {
		return false
	}

	// Match query parameters
	if !m.matchQueryParams(endpoint.MatchConfig.QueryParams, queryParams) {
		return false
	}

	// Match body
	if !m.matchBody(endpoint.MatchConfig.BodyPattern, endpoint.MatchConfig.BodyJSON, body) {
		return false
	}

	return true
}

// matchPath matches the request path
func (m *EndpointMatcher) matchPath(endpointPath, pathPattern, requestPath string) bool {
	// If explicit regex pattern is specified, use it
	if pathPattern != "" {
		matched, err := regexp.MatchString(pathPattern, requestPath)
		if err != nil {
			m.logger.Warn("Invalid path pattern", zap.String("pattern", pathPattern), zap.Error(err))
			return false
		}
		return matched
	}

	// Exact match
	if endpointPath == requestPath {
		return true
	}

	// :param segment matching (e.g. /api/users/:id matches /api/users/123)
	if strings.Contains(endpointPath, ":") {
		endParts := strings.Split(strings.Trim(endpointPath, "/"), "/")
		reqParts := strings.Split(strings.Trim(requestPath, "/"), "/")
		if len(endParts) != len(reqParts) {
			return false
		}
		for i, part := range endParts {
			if strings.HasPrefix(part, ":") {
				continue // path parameter, any value matches
			}
			if part != reqParts[i] {
				return false
			}
		}
		return true
	}

	// Wildcard matching (e.g. /api/users/*)
	if strings.Contains(endpointPath, "*") {
		pattern := strings.ReplaceAll(endpointPath, "*", ".*")
		matched, _ := regexp.MatchString("^"+pattern+"$", requestPath)
		return matched
	}

	return false
}

// matchHeaders matches required headers
func (m *EndpointMatcher) matchHeaders(requiredHeaders map[string]string, requestHeaders map[string]interface{}) bool {
	if len(requiredHeaders) == 0 {
		return true
	}

	for key, value := range requiredHeaders {
		headerValue, exists := requestHeaders[key]
		if !exists {
			return false
		}

		// Convert to string for comparison
		headerStr, ok := headerValue.(string)
		if !ok {
			return false
		}

		// Support regex matching for header values
		if strings.HasPrefix(value, "regex:") {
			pattern := strings.TrimPrefix(value, "regex:")
			matched, err := regexp.MatchString(pattern, headerStr)
			if err != nil || !matched {
				return false
			}
		} else if headerStr != value {
			return false
		}
	}

	return true
}

// matchQueryParams matches required query parameters
func (m *EndpointMatcher) matchQueryParams(requiredParams map[string]string, requestParams map[string]interface{}) bool {
	if len(requiredParams) == 0 {
		return true
	}

	for key, value := range requiredParams {
		paramValue, exists := requestParams[key]
		if !exists {
			return false
		}

		// Convert to string for comparison
		paramStr, ok := paramValue.(string)
		if !ok {
			return false
		}

		if paramStr != value {
			return false
		}
	}

	return true
}

// matchBody matches the request body
func (m *EndpointMatcher) matchBody(bodyPattern string, bodyJSON map[string]interface{}, requestBody []byte) bool {
	// If no body matching required
	if bodyPattern == "" && len(bodyJSON) == 0 {
		return true
	}

	// Match body pattern (regex)
	if bodyPattern != "" {
		matched, err := regexp.MatchString(bodyPattern, string(requestBody))
		if err != nil {
			m.logger.Warn("Invalid body pattern", zap.String("pattern", bodyPattern), zap.Error(err))
			return false
		}
		return matched
	}

	// Match JSON body
	if len(bodyJSON) > 0 {
		var requestJSON map[string]interface{}
		if err := json.Unmarshal(requestBody, &requestJSON); err != nil {
			return false
		}

		return m.matchJSON(bodyJSON, requestJSON)
	}

	return true
}

// matchJSON performs deep matching of JSON objects
func (m *EndpointMatcher) matchJSON(expected, actual map[string]interface{}) bool {
	for key, expectedValue := range expected {
		actualValue, exists := actual[key]
		if !exists {
			return false
		}

		// Compare values
		switch expectedVal := expectedValue.(type) {
		case map[string]interface{}:
			actualMap, ok := actualValue.(map[string]interface{})
			if !ok {
				return false
			}
			if !m.matchJSON(expectedVal, actualMap) {
				return false
			}
		case []interface{}:
			actualArray, ok := actualValue.([]interface{})
			if !ok {
				return false
			}
			if len(expectedVal) != len(actualArray) {
				return false
			}
			// Simple array comparison (order matters)
			for i, v := range expectedVal {
				if v != actualArray[i] {
					return false
				}
			}
		default:
			// Direct comparison
			if expectedValue != actualValue {
				return false
			}
		}
	}

	return true
}
