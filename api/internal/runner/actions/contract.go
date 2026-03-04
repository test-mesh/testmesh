package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/runner/contracts"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ContractGenerateHandler handles contract generation actions
type ContractGenerateHandler struct {
	generator *contracts.Generator
	execRepo  *repository.ExecutionRepository
	logger    *zap.Logger
}

// NewContractGenerateHandler creates a new contract generate handler
func NewContractGenerateHandler(generator *contracts.Generator, execRepo *repository.ExecutionRepository, logger *zap.Logger) *ContractGenerateHandler {
	return &ContractGenerateHandler{
		generator: generator,
		execRepo:  execRepo,
		logger:    logger,
	}
}

// Execute generates a contract from the current execution
func (h *ContractGenerateHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Extract configuration
	consumer, ok := config["consumer"].(string)
	if !ok {
		return nil, fmt.Errorf("consumer is required")
	}

	provider, ok := config["provider"].(string)
	if !ok {
		return nil, fmt.Errorf("provider is required")
	}

	version, ok := config["version"].(string)
	if !ok {
		return nil, fmt.Errorf("version is required")
	}

	// Get execution ID from context
	var executionID uuid.UUID
	if execIDVal := ctx.Value("execution_id"); execIDVal != nil {
		if execID, ok := execIDVal.(uuid.UUID); ok {
			executionID = execID
		} else {
			return nil, fmt.Errorf("invalid execution_id in context")
		}
	} else {
		return nil, fmt.Errorf("execution_id not found in context")
	}

	// Get flow ID from context
	var flowID uuid.UUID
	if flowIDVal := ctx.Value("flow_id"); flowIDVal != nil {
		if fID, ok := flowIDVal.(uuid.UUID); ok {
			flowID = fID
		} else {
			return nil, fmt.Errorf("invalid flow_id in context")
		}
	} else {
		return nil, fmt.Errorf("flow_id not found in context")
	}

	// Get execution steps
	steps, err := h.execRepo.GetSteps(executionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get execution steps: %w", err)
	}

	// Generate contract
	contract, err := h.generator.GenerateFromExecution(consumer, provider, version, flowID, steps)
	if err != nil {
		return nil, fmt.Errorf("failed to generate contract: %w", err)
	}

	// Export to Pact JSON (optional)
	var pactJSON []byte
	if exportJSON, ok := config["export_json"].(bool); ok && exportJSON {
		pactJSON, err = h.generator.ExportToPactJSON(contract.ID)
		if err != nil {
			h.logger.Warn("Failed to export Pact JSON", zap.Error(err))
		}
	}

	output := models.OutputData{
		"contract_id": contract.ID.String(),
		"consumer":    consumer,
		"provider":    provider,
		"version":     version,
		"status":      "generated",
	}

	if pactJSON != nil {
		output["pact_json"] = string(pactJSON)
	}

	h.logger.Info("Contract generated successfully",
		zap.String("contract_id", contract.ID.String()),
		zap.String("consumer", consumer),
		zap.String("provider", provider),
	)

	return output, nil
}

// ContractVerifyHandler handles contract verification actions
type ContractVerifyHandler struct {
	verifier *contracts.Verifier
	differ   *contracts.Differ
	logger   *zap.Logger
}

// NewContractVerifyHandler creates a new contract verify handler
func NewContractVerifyHandler(verifier *contracts.Verifier, differ *contracts.Differ, logger *zap.Logger) *ContractVerifyHandler {
	return &ContractVerifyHandler{
		verifier: verifier,
		differ:   differ,
		logger:   logger,
	}
}

// Execute verifies a provider against a contract
func (h *ContractVerifyHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Extract configuration
	contractIDStr, ok := config["contract_id"].(string)
	if !ok {
		return nil, fmt.Errorf("contract_id is required")
	}

	contractID, err := uuid.Parse(contractIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid contract_id: %w", err)
	}

	providerBaseURL, ok := config["provider_base_url"].(string)
	if !ok {
		return nil, fmt.Errorf("provider_base_url is required")
	}

	providerVersion, ok := config["provider_version"].(string)
	if !ok {
		providerVersion = "unknown"
	}

	// Get execution ID from context (optional)
	var executionID *uuid.UUID
	if execIDVal := ctx.Value("execution_id"); execIDVal != nil {
		if execID, ok := execIDVal.(uuid.UUID); ok {
			executionID = &execID
		}
	}

	// Check for state setup URL (optional)
	stateSetupURL, _ := config["state_setup_url"].(string)

	// Verify contract
	var verification *models.Verification
	if stateSetupURL != "" {
		verification, err = h.verifier.VerifyContractWithState(contractID, providerBaseURL, providerVersion, stateSetupURL, executionID)
	} else {
		verification, err = h.verifier.VerifyContract(contractID, providerBaseURL, providerVersion, executionID)
	}

	if err != nil {
		return nil, fmt.Errorf("verification failed: %w", err)
	}

	// Check for breaking changes if previous version specified
	var breakingChanges []models.BreakingChange
	if prevContractIDStr, ok := config["previous_contract_id"].(string); ok {
		prevContractID, err := uuid.Parse(prevContractIDStr)
		if err == nil {
			breakingChanges, err = h.differ.DetectBreakingChanges(prevContractID, contractID)
			if err != nil {
				h.logger.Warn("Failed to detect breaking changes", zap.Error(err))
			}
		}
	}

	output := models.OutputData{
		"verification_id":     verification.ID.String(),
		"contract_id":         contractID.String(),
		"status":              string(verification.Status),
		"total_interactions":  verification.Results.TotalInteractions,
		"passed_interactions": verification.Results.PassedInteractions,
		"failed_interactions": verification.Results.FailedInteractions,
		"summary":             verification.Results.Summary,
	}

	if len(breakingChanges) > 0 {
		criticalCount := 0
		majorCount := 0
		minorCount := 0

		for _, change := range breakingChanges {
			switch change.Severity {
			case models.SeverityCritical:
				criticalCount++
			case models.SeverityMajor:
				majorCount++
			case models.SeverityMinor:
				minorCount++
			}
		}

		output["breaking_changes"] = map[string]interface{}{
			"total":    len(breakingChanges),
			"critical": criticalCount,
			"major":    majorCount,
			"minor":    minorCount,
		}
	}

	h.logger.Info("Contract verification completed",
		zap.String("verification_id", verification.ID.String()),
		zap.String("status", string(verification.Status)),
		zap.Int("failed", verification.Results.FailedInteractions),
	)

	return output, nil
}
