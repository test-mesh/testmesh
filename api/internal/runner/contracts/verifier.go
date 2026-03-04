package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Verifier verifies provider implementations against contracts
type Verifier struct {
	repo   *repository.ContractRepository
	logger *zap.Logger
	client *http.Client
}

// NewVerifier creates a new contract verifier
func NewVerifier(repo *repository.ContractRepository, logger *zap.Logger) *Verifier {
	return &Verifier{
		repo:   repo,
		logger: logger,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// VerifyContract verifies a provider against a contract
func (v *Verifier) VerifyContract(contractID uuid.UUID, providerBaseURL, providerVersion string, executionID *uuid.UUID) (*models.Verification, error) {
	// Load contract
	_, err := v.repo.GetContractByID(contractID)
	if err != nil {
		return nil, fmt.Errorf("contract not found: %w", err)
	}

	// Load interactions
	interactions, err := v.repo.ListInteractions(contractID)
	if err != nil {
		return nil, fmt.Errorf("failed to load interactions: %w", err)
	}

	// Verify each interaction
	results := models.VerificationResults{
		TotalInteractions:  len(interactions),
		PassedInteractions: 0,
		FailedInteractions: 0,
		Details:            make([]models.InteractionResult, len(interactions)),
	}

	for i, interaction := range interactions {
		result := v.verifyInteraction(&interaction, providerBaseURL)
		results.Details[i] = result

		if result.Passed {
			results.PassedInteractions++
		} else {
			results.FailedInteractions++
		}
	}

	// Determine overall status
	status := models.VerificationStatusPassed
	if results.FailedInteractions > 0 {
		status = models.VerificationStatusFailed
		results.Summary = fmt.Sprintf("%d of %d interactions failed", results.FailedInteractions, results.TotalInteractions)
	} else {
		results.Summary = fmt.Sprintf("All %d interactions passed", results.TotalInteractions)
	}

	// Create verification record
	verification := &models.Verification{
		ContractID:      contractID,
		ProviderVersion: providerVersion,
		Status:          status,
		VerifiedAt:      time.Now(),
		Results:         results,
		ExecutionID:     executionID,
	}

	if err := v.repo.CreateVerification(verification); err != nil {
		return nil, fmt.Errorf("failed to create verification: %w", err)
	}

	v.logger.Info("Contract verification completed",
		zap.String("contract_id", contractID.String()),
		zap.String("status", string(status)),
		zap.Int("passed", results.PassedInteractions),
		zap.Int("failed", results.FailedInteractions),
	)

	return verification, nil
}

// verifyInteraction verifies a single interaction
func (v *Verifier) verifyInteraction(interaction *models.Interaction, providerBaseURL string) models.InteractionResult {
	result := models.InteractionResult{
		InteractionID: interaction.ID,
		Description:   interaction.Description,
		Passed:        true,
		Mismatches:    make([]models.Mismatch, 0),
	}

	// Build request URL
	url := providerBaseURL + interaction.Request.Path

	// Create HTTP request
	var bodyReader io.Reader
	if interaction.Request.Body != nil {
		bodyBytes, err := json.Marshal(interaction.Request.Body)
		if err != nil {
			result.Passed = false
			result.Mismatches = append(result.Mismatches, models.Mismatch{
				Type:    "request",
				Message: fmt.Sprintf("Failed to marshal request body: %v", err),
			})
			return result
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequest(interaction.Request.Method, url, bodyReader)
	if err != nil {
		result.Passed = false
		result.Mismatches = append(result.Mismatches, models.Mismatch{
			Type:    "request",
			Message: fmt.Sprintf("Failed to create request: %v", err),
		})
		return result
	}

	// Set headers
	for key, value := range interaction.Request.Headers {
		if strVal, ok := value.(string); ok {
			req.Header.Set(key, strVal)
		}
	}

	// Set query parameters
	if len(interaction.Request.Query) > 0 {
		q := req.URL.Query()
		for key, value := range interaction.Request.Query {
			if strVal, ok := value.(string); ok {
				q.Add(key, strVal)
			}
		}
		req.URL.RawQuery = q.Encode()
	}

	// Execute request
	resp, err := v.client.Do(req)
	if err != nil {
		result.Passed = false
		result.Mismatches = append(result.Mismatches, models.Mismatch{
			Type:    "request",
			Message: fmt.Sprintf("Request failed: %v", err),
		})
		return result
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Passed = false
		result.Mismatches = append(result.Mismatches, models.Mismatch{
			Type:    "response",
			Message: fmt.Sprintf("Failed to read response: %v", err),
		})
		return result
	}

	// Verify response status
	if resp.StatusCode != interaction.Response.Status {
		result.Passed = false
		result.Mismatches = append(result.Mismatches, models.Mismatch{
			Type:     "status",
			Expected: interaction.Response.Status,
			Actual:   resp.StatusCode,
			Message:  fmt.Sprintf("Expected status %d, got %d", interaction.Response.Status, resp.StatusCode),
		})
	}

	// Verify response headers
	for expectedKey, expectedValue := range interaction.Response.Headers {
		actualValue := resp.Header.Get(expectedKey)
		if expectedStr, ok := expectedValue.(string); ok {
			if actualValue != expectedStr {
				result.Passed = false
				result.Mismatches = append(result.Mismatches, models.Mismatch{
					Type:     "header",
					Expected: expectedValue,
					Actual:   actualValue,
					Path:     expectedKey,
					Message:  fmt.Sprintf("Header %s: expected %s, got %s", expectedKey, expectedStr, actualValue),
				})
			}
		}
	}

	// Verify response body
	if interaction.Response.Body != nil {
		var actualBody interface{}
		if err := json.Unmarshal(respBody, &actualBody); err != nil {
			// If not JSON, compare as string
			expectedStr := fmt.Sprintf("%v", interaction.Response.Body)
			actualStr := string(respBody)
			if expectedStr != actualStr {
				result.Passed = false
				result.Mismatches = append(result.Mismatches, models.Mismatch{
					Type:     "body",
					Expected: expectedStr,
					Actual:   actualStr,
					Message:  "Response body does not match",
				})
			}
		} else {
			// Compare JSON bodies
			mismatches := v.compareJSON("$", interaction.Response.Body, actualBody)
			if len(mismatches) > 0 {
				result.Passed = false
				result.Mismatches = append(result.Mismatches, mismatches...)
			}
		}
	}

	// Store actual request/response for debugging
	result.ActualRequest = map[string]interface{}{
		"method":  req.Method,
		"url":     req.URL.String(),
		"headers": req.Header,
	}
	result.ActualResponse = map[string]interface{}{
		"status":  resp.StatusCode,
		"headers": resp.Header,
		"body":    string(respBody),
	}

	return result
}

// compareJSON recursively compares JSON structures
func (v *Verifier) compareJSON(path string, expected, actual interface{}) []models.Mismatch {
	mismatches := make([]models.Mismatch, 0)

	// Handle nil cases
	if expected == nil && actual == nil {
		return mismatches
	}
	if expected == nil || actual == nil {
		mismatches = append(mismatches, models.Mismatch{
			Type:     "body",
			Expected: expected,
			Actual:   actual,
			Path:     path,
			Message:  fmt.Sprintf("At %s: expected %v, got %v", path, expected, actual),
		})
		return mismatches
	}

	// Compare types
	expectedType := reflect.TypeOf(expected)
	actualType := reflect.TypeOf(actual)

	if expectedType != actualType {
		mismatches = append(mismatches, models.Mismatch{
			Type:     "body",
			Expected: expected,
			Actual:   actual,
			Path:     path,
			Message:  fmt.Sprintf("At %s: type mismatch", path),
		})
		return mismatches
	}

	// Compare based on type
	switch exp := expected.(type) {
	case map[string]interface{}:
		act := actual.(map[string]interface{})
		for key, expValue := range exp {
			actValue, exists := act[key]
			if !exists {
				mismatches = append(mismatches, models.Mismatch{
					Type:     "body",
					Expected: expValue,
					Actual:   nil,
					Path:     fmt.Sprintf("%s.%s", path, key),
					Message:  fmt.Sprintf("Missing field: %s.%s", path, key),
				})
				continue
			}
			mismatches = append(mismatches, v.compareJSON(fmt.Sprintf("%s.%s", path, key), expValue, actValue)...)
		}

	case []interface{}:
		act := actual.([]interface{})
		if len(exp) != len(act) {
			mismatches = append(mismatches, models.Mismatch{
				Type:     "body",
				Expected: len(exp),
				Actual:   len(act),
				Path:     path,
				Message:  fmt.Sprintf("At %s: array length mismatch", path),
			})
			return mismatches
		}
		for i := range exp {
			mismatches = append(mismatches, v.compareJSON(fmt.Sprintf("%s[%d]", path, i), exp[i], act[i])...)
		}

	default:
		// Direct comparison for primitives
		if !reflect.DeepEqual(expected, actual) {
			mismatches = append(mismatches, models.Mismatch{
				Type:     "body",
				Expected: expected,
				Actual:   actual,
				Path:     path,
				Message:  fmt.Sprintf("At %s: expected %v, got %v", path, expected, actual),
			})
		}
	}

	return mismatches
}

// VerifyContractWithState verifies a contract with provider state setup
func (v *Verifier) VerifyContractWithState(contractID uuid.UUID, providerBaseURL, providerVersion string, stateSetupURL string, executionID *uuid.UUID) (*models.Verification, error) {
	// Load contract
	_, err := v.repo.GetContractByID(contractID)
	if err != nil {
		return nil, fmt.Errorf("contract not found: %w", err)
	}

	// Load interactions
	interactions, err := v.repo.ListInteractions(contractID)
	if err != nil {
		return nil, fmt.Errorf("failed to load interactions: %w", err)
	}

	// Verify each interaction with state setup
	results := models.VerificationResults{
		TotalInteractions:  len(interactions),
		PassedInteractions: 0,
		FailedInteractions: 0,
		Details:            make([]models.InteractionResult, len(interactions)),
	}

	for i, interaction := range interactions {
		// Setup provider state if specified
		if interaction.ProviderState != "" && stateSetupURL != "" {
			if err := v.setupProviderState(stateSetupURL, interaction.ProviderState); err != nil {
				v.logger.Warn("Failed to setup provider state",
					zap.String("state", interaction.ProviderState),
					zap.Error(err),
				)
			}
		}

		result := v.verifyInteraction(&interaction, providerBaseURL)
		results.Details[i] = result

		if result.Passed {
			results.PassedInteractions++
		} else {
			results.FailedInteractions++
		}
	}

	// Determine overall status
	status := models.VerificationStatusPassed
	if results.FailedInteractions > 0 {
		status = models.VerificationStatusFailed
		results.Summary = fmt.Sprintf("%d of %d interactions failed", results.FailedInteractions, results.TotalInteractions)
	} else {
		results.Summary = fmt.Sprintf("All %d interactions passed", results.TotalInteractions)
	}

	// Create verification record
	verification := &models.Verification{
		ContractID:      contractID,
		ProviderVersion: providerVersion,
		Status:          status,
		VerifiedAt:      time.Now(),
		Results:         results,
		ExecutionID:     executionID,
	}

	if err := v.repo.CreateVerification(verification); err != nil {
		return nil, fmt.Errorf("failed to create verification: %w", err)
	}

	v.logger.Info("Contract verification with state completed",
		zap.String("contract_id", contractID.String()),
		zap.String("status", string(status)),
	)

	return verification, nil
}

// setupProviderState sends a state setup request to the provider
func (v *Verifier) setupProviderState(stateSetupURL, state string) error {
	reqBody := map[string]interface{}{
		"state": state,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", stateSetupURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("state setup failed with status %d", resp.StatusCode)
	}

	return nil
}
