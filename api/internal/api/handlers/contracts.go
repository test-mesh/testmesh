package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/runner/contracts"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ContractHandler handles contract-related requests
type ContractHandler struct {
	repo      *repository.ContractRepository
	generator *contracts.Generator
	verifier  *contracts.Verifier
	differ    *contracts.Differ
	logger    *zap.Logger
}

// NewContractHandler creates a new contract handler
func NewContractHandler(repo *repository.ContractRepository, logger *zap.Logger) *ContractHandler {
	return &ContractHandler{
		repo:      repo,
		generator: contracts.NewGenerator(repo, logger),
		verifier:  contracts.NewVerifier(repo, logger),
		differ:    contracts.NewDiffer(repo, logger),
		logger:    logger,
	}
}

// ListContracts handles GET /api/v1/contracts
func (h *ContractHandler) ListContracts(c *gin.Context) {
	consumer := c.Query("consumer")
	provider := c.Query("provider")

	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	contracts, total, err := h.repo.ListContracts(consumer, provider, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list contracts", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list contracts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"contracts": contracts,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

// GetContract handles GET /api/v1/contracts/:id
func (h *ContractHandler) GetContract(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	contract, err := h.repo.GetContractByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "contract not found"})
		return
	}

	// Load interactions
	interactions, err := h.repo.ListInteractions(id)
	if err != nil {
		h.logger.Error("Failed to load interactions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load interactions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"contract":     contract,
		"interactions": interactions,
	})
}

// GetContractVersions handles GET /api/v1/contracts/versions
func (h *ContractHandler) GetContractVersions(c *gin.Context) {
	consumer := c.Query("consumer")
	provider := c.Query("provider")

	if consumer == "" || provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "consumer and provider are required"})
		return
	}

	versions, err := h.repo.GetContractVersions(consumer, provider)
	if err != nil {
		h.logger.Error("Failed to get versions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get versions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"versions": versions,
		"total":    len(versions),
	})
}

// ExportPact handles GET /api/v1/contracts/:id/pact
func (h *ContractHandler) ExportPact(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	pactJSON, err := h.generator.ExportToPactJSON(id)
	if err != nil {
		h.logger.Error("Failed to export Pact JSON", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to export contract"})
		return
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=pact.json")
	c.Data(http.StatusOK, "application/json", pactJSON)
}

// ImportPact handles POST /api/v1/contracts/import
func (h *ContractHandler) ImportPact(c *gin.Context) {
	var req struct {
		PactJSON string `json:"pact_json" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	contract, err := h.generator.ImportFromPactJSON([]byte(req.PactJSON))
	if err != nil {
		h.logger.Error("Failed to import Pact", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Pact JSON: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, contract)
}

// ListVerifications handles GET /api/v1/contracts/:id/verifications
func (h *ContractHandler) ListVerifications(c *gin.Context) {
	contractID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	status := models.VerificationStatus(c.Query("status"))

	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	verifications, total, err := h.repo.ListVerifications(contractID, status, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list verifications", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list verifications"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"verifications": verifications,
		"total":         total,
		"limit":         limit,
		"offset":        offset,
	})
}

// GetVerification handles GET /api/v1/verifications/:id
func (h *ContractHandler) GetVerification(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid verification ID"})
		return
	}

	verification, err := h.repo.GetVerificationByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "verification not found"})
		return
	}

	c.JSON(http.StatusOK, verification)
}

// DetectBreakingChanges handles POST /api/v1/contracts/breaking-changes
func (h *ContractHandler) DetectBreakingChanges(c *gin.Context) {
	var req struct {
		OldContractID string `json:"old_contract_id" binding:"required"`
		NewContractID string `json:"new_contract_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	oldID, err := uuid.Parse(req.OldContractID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid old_contract_id"})
		return
	}

	newID, err := uuid.Parse(req.NewContractID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid new_contract_id"})
		return
	}

	changes, err := h.differ.DetectBreakingChanges(oldID, newID)
	if err != nil {
		h.logger.Error("Failed to detect breaking changes", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to detect breaking changes"})
		return
	}

	// Get summary
	summary, _ := h.differ.GetBreakingChangesSummary(oldID, newID)

	c.JSON(http.StatusOK, gin.H{
		"changes": changes,
		"summary": summary,
	})
}

// ListBreakingChanges handles GET /api/v1/contracts/:id/breaking-changes
func (h *ContractHandler) ListBreakingChanges(c *gin.Context) {
	contractID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	changes, err := h.repo.GetBreakingChangesByContract(contractID)
	if err != nil {
		h.logger.Error("Failed to list breaking changes", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list breaking changes"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"changes": changes,
		"total":   len(changes),
	})
}

// DeleteContract handles DELETE /api/v1/contracts/:id
func (h *ContractHandler) DeleteContract(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	if err := h.repo.DeleteContract(id); err != nil {
		h.logger.Error("Failed to delete contract", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete contract"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "contract deleted"})
}

// ListInteractions handles GET /api/v1/contracts/:id/interactions
func (h *ContractHandler) ListInteractions(c *gin.Context) {
	contractID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract ID"})
		return
	}

	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	interactions, total, err := h.repo.ListInteractionsPaginated(contractID, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list interactions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list interactions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"interactions": interactions,
		"total":        total,
		"limit":        limit,
		"offset":       offset,
	})
}

// GetInteraction handles GET /api/v1/contracts/:id/interactions/:interaction_id
func (h *ContractHandler) GetInteraction(c *gin.Context) {
	interactionID, err := uuid.Parse(c.Param("interaction_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid interaction ID"})
		return
	}

	interaction, err := h.repo.GetInteractionByID(interactionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "interaction not found"})
		return
	}

	c.JSON(http.StatusOK, interaction)
}

// DeleteInteraction handles DELETE /api/v1/contracts/:id/interactions/:interaction_id
func (h *ContractHandler) DeleteInteraction(c *gin.Context) {
	interactionID, err := uuid.Parse(c.Param("interaction_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid interaction ID"})
		return
	}

	if err := h.repo.DeleteInteraction(interactionID); err != nil {
		h.logger.Error("Failed to delete interaction", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete interaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "interaction deleted"})
}

// CreateVerification handles POST /api/v1/verifications
func (h *ContractHandler) CreateVerification(c *gin.Context) {
	var req struct {
		ContractID      string `json:"contract_id" binding:"required"`
		ProviderVersion string `json:"provider_version" binding:"required"`
		ExecutionID     string `json:"execution_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	contractID, err := uuid.Parse(req.ContractID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid contract_id"})
		return
	}

	verification := &models.Verification{
		ContractID:      contractID,
		ProviderVersion: req.ProviderVersion,
		Status:          models.VerificationStatusPending,
	}

	if req.ExecutionID != "" {
		execID, err := uuid.Parse(req.ExecutionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution_id"})
			return
		}
		verification.ExecutionID = &execID
	}

	if err := h.repo.CreateVerification(verification); err != nil {
		h.logger.Error("Failed to create verification", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create verification"})
		return
	}

	c.JSON(http.StatusCreated, verification)
}

// UpdateVerification handles PUT /api/v1/verifications/:id
func (h *ContractHandler) UpdateVerification(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid verification ID"})
		return
	}

	verification, err := h.repo.GetVerificationByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "verification not found"})
		return
	}

	var req struct {
		Status  string                    `json:"status"`
		Results *models.VerificationResults `json:"results"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Status != "" {
		verification.Status = models.VerificationStatus(req.Status)
	}
	if req.Results != nil {
		verification.Results = *req.Results
	}

	if err := h.repo.UpdateVerification(verification); err != nil {
		h.logger.Error("Failed to update verification", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update verification"})
		return
	}

	c.JSON(http.StatusOK, verification)
}
