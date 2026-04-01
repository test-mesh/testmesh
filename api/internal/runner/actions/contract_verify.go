package actions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ContractVerifyHandler reads a contract JSON file and verifies that the provider
// honours each interaction by making live HTTP requests.
type ContractVerifyHandler struct {
	logger     *zap.Logger
	httpClient *http.Client
}

// NewContractVerifyHandler creates a new contract_verify handler.
func NewContractVerifyHandler(logger *zap.Logger) *ContractVerifyHandler {
	return &ContractVerifyHandler{
		logger: logger,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// interactionResult holds per-interaction verification outcome.
type interactionResult struct {
	Description string `json:"description"`
	Passed      bool   `json:"passed"`
	Error       string `json:"error,omitempty"`
	StatusCode  int    `json:"status_code,omitempty"`
}

// Execute reads a contract and verifies every interaction against the live provider.
//
// Config keys:
//
//	contract_id        string – path to the contract JSON file (required)
//	provider_base_url  string – base URL of the provider, e.g. "http://user-service:8080" (required)
//	timeout            string – per-request timeout, e.g. "10s" (optional, default: "30s")
func (h *ContractVerifyHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	contractID, ok := config["contract_id"].(string)
	if !ok || contractID == "" {
		return nil, fmt.Errorf("contract_verify: 'contract_id' is required")
	}

	providerBaseURL, ok := config["provider_base_url"].(string)
	if !ok || providerBaseURL == "" {
		return nil, fmt.Errorf("contract_verify: 'provider_base_url' is required")
	}
	providerBaseURL = strings.TrimRight(providerBaseURL, "/")

	// Optional per-request timeout override.
	client := h.httpClient
	if timeoutStr, ok := config["timeout"].(string); ok && timeoutStr != "" {
		d, err := time.ParseDuration(timeoutStr)
		if err != nil {
			return nil, fmt.Errorf("contract_verify: invalid timeout %q: %w", timeoutStr, err)
		}
		client = &http.Client{Timeout: d}
	}

	// Resolve to absolute path and ensure it's within cwd
	absPath, err := filepath.Abs(contractID)
	if err != nil {
		return nil, fmt.Errorf("contract_verify: invalid contract path: %w", err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("contract_verify: cannot determine working directory: %w", err)
	}
	if !strings.HasPrefix(absPath, cwd+string(filepath.Separator)) && absPath != cwd {
		return nil, fmt.Errorf("contract_verify: contract_id must be within the working directory")
	}

	// Read and parse the contract file.
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("contract_verify: failed to read contract file %q: %w", absPath, err)
	}

	var doc contractDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("contract_verify: failed to parse contract file %q: %w", contractID, err)
	}

	h.logger.Info("Verifying contract",
		zap.String("contract_id", contractID),
		zap.String("consumer", doc.Consumer["name"]),
		zap.String("provider", doc.Provider["name"]),
		zap.String("provider_base_url", providerBaseURL),
		zap.Int("interactions", len(doc.Interactions)),
	)

	results := make([]interactionResult, 0, len(doc.Interactions))
	passed := 0
	failed := 0

	for _, interaction := range doc.Interactions {
		ir, verifyErr := h.verifyInteraction(ctx, client, providerBaseURL, interaction)
		if verifyErr != nil {
			// Non-fatal: record failure and continue.
			h.logger.Warn("Interaction verification failed",
				zap.String("description", interaction.Description),
				zap.Error(verifyErr),
			)
		}
		results = append(results, ir)
		if ir.Passed {
			passed++
		} else {
			failed++
		}
	}

	verified := failed == 0

	h.logger.Info("Contract verification complete",
		zap.Bool("verified", verified),
		zap.Int("total", len(doc.Interactions)),
		zap.Int("passed", passed),
		zap.Int("failed", failed),
	)

	// Build the per-interaction detail slice for the output.
	detailSlice := make([]interface{}, len(results))
	for i, r := range results {
		detailSlice[i] = map[string]interface{}{
			"description": r.Description,
			"passed":      r.Passed,
			"status_code": r.StatusCode,
			"error":       r.Error,
		}
	}

	return models.OutputData{
		"verified": verified,
		"total":    len(doc.Interactions),
		"passed":   passed,
		"failed":   failed,
		"details":  detailSlice,
	}, nil
}

// verifyInteraction executes a single interaction against the provider.
func (h *ContractVerifyHandler) verifyInteraction(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	interaction contractInteraction,
) (interactionResult, error) {
	ir := interactionResult{Description: interaction.Description}

	// --- Build request ---
	method := "GET"
	if m, ok := interaction.Request["method"].(string); ok && m != "" {
		method = strings.ToUpper(m)
	}

	path := "/"
	if p, ok := interaction.Request["path"].(string); ok && p != "" {
		path = p
	}

	url := baseURL + path
	if query, ok := interaction.Request["query"].(string); ok && query != "" {
		url += "?" + query
	}

	var bodyReader io.Reader
	if reqBody, ok := interaction.Request["body"]; ok && reqBody != nil {
		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			ir.Error = fmt.Sprintf("failed to marshal request body: %v", err)
			return ir, fmt.Errorf("%s", ir.Error)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		ir.Error = fmt.Sprintf("failed to build request: %v", err)
		return ir, fmt.Errorf("%s", ir.Error)
	}

	// Apply request headers from the contract.
	if headers, ok := interaction.Request["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}
	// Default Content-Type when there is a body.
	if bodyReader != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// --- Execute request ---
	resp, err := client.Do(req)
	if err != nil {
		ir.Error = fmt.Sprintf("request failed: %v", err)
		return ir, fmt.Errorf("%s", ir.Error)
	}
	defer resp.Body.Close()

	ir.StatusCode = resp.StatusCode

	respBodyBytes, _ := io.ReadAll(resp.Body)

	// --- Verify status ---
	expectedStatus := 200
	if s, ok := interaction.Response["status"].(int); ok {
		expectedStatus = s
	} else if s, ok := interaction.Response["status"].(float64); ok {
		expectedStatus = int(s)
	}

	if resp.StatusCode != expectedStatus {
		ir.Error = fmt.Sprintf("status mismatch: expected %d, got %d", expectedStatus, resp.StatusCode)
		return ir, fmt.Errorf("%s", ir.Error)
	}

	// --- Verify body fields (if specified) ---
	if expectedBody, ok := interaction.Response["body"]; ok && expectedBody != nil {
		if err := verifyBody(respBodyBytes, expectedBody); err != nil {
			ir.Error = fmt.Sprintf("body mismatch: %v", err)
			return ir, fmt.Errorf("%s", ir.Error)
		}
	}

	ir.Passed = true
	return ir, nil
}

// verifyBody checks that all fields present in expectedBody exist and match in
// the actual response body. Extra fields in the response are allowed (Pact-style
// loose matching).
func verifyBody(actualBytes []byte, expected interface{}) error {
	if len(actualBytes) == 0 {
		return fmt.Errorf("empty response body")
	}

	var actual interface{}
	if err := json.Unmarshal(actualBytes, &actual); err != nil {
		return fmt.Errorf("response is not valid JSON: %w", err)
	}

	return matchValue(actual, expected, "$")
}

// matchValue recursively verifies that every field in expected is present and
// equal in actual. For objects, extra keys in actual are permitted.
func matchValue(actual, expected interface{}, path string) error {
	switch exp := expected.(type) {
	case map[string]interface{}:
		act, ok := actual.(map[string]interface{})
		if !ok {
			return fmt.Errorf("%s: expected object, got %T", path, actual)
		}
		for k, expVal := range exp {
			actVal, exists := act[k]
			if !exists {
				return fmt.Errorf("%s.%s: field missing in response", path, k)
			}
			if err := matchValue(actVal, expVal, path+"."+k); err != nil {
				return err
			}
		}
	case []interface{}:
		act, ok := actual.([]interface{})
		if !ok {
			return fmt.Errorf("%s: expected array, got %T", path, actual)
		}
		for i, expItem := range exp {
			if i >= len(act) {
				return fmt.Errorf("%s[%d]: index out of range (response has %d items)", path, i, len(act))
			}
			if err := matchValue(act[i], expItem, fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	default:
		// Scalar comparison — normalise via JSON round-trip to avoid int vs float64 issues.
		expJSON, _ := json.Marshal(expected)
		actJSON, _ := json.Marshal(actual)
		if string(expJSON) != string(actJSON) {
			return fmt.Errorf("%s: expected %s, got %s", path, expJSON, actJSON)
		}
	}
	return nil
}
