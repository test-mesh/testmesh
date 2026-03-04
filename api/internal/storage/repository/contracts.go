package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ContractRepository handles contract database operations
type ContractRepository struct {
	db *gorm.DB
}

// NewContractRepository creates a new contract repository
func NewContractRepository(db *gorm.DB) *ContractRepository {
	return &ContractRepository{db: db}
}

// CreateContract creates a new contract
func (r *ContractRepository) CreateContract(contract *models.Contract) error {
	return r.db.Create(contract).Error
}

// GetContractByID retrieves a contract by ID
func (r *ContractRepository) GetContractByID(id uuid.UUID) (*models.Contract, error) {
	var contract models.Contract
	if err := r.db.First(&contract, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &contract, nil
}

// GetContractByVersion retrieves a specific contract version
func (r *ContractRepository) GetContractByVersion(consumer, provider, version string) (*models.Contract, error) {
	var contract models.Contract
	if err := r.db.Where("consumer = ? AND provider = ? AND version = ?", consumer, provider, version).First(&contract).Error; err != nil {
		return nil, err
	}
	return &contract, nil
}

// GetLatestContract retrieves the latest contract for a consumer-provider pair
func (r *ContractRepository) GetLatestContract(consumer, provider string) (*models.Contract, error) {
	var contract models.Contract
	if err := r.db.Where("consumer = ? AND provider = ?", consumer, provider).
		Order("created_at DESC").
		First(&contract).Error; err != nil {
		return nil, err
	}
	return &contract, nil
}

// ListContracts retrieves contracts with optional filters
func (r *ContractRepository) ListContracts(consumer, provider string, limit, offset int) ([]models.Contract, int64, error) {
	var contracts []models.Contract
	var total int64

	query := r.db.Model(&models.Contract{})

	if consumer != "" {
		query = query.Where("consumer = ?", consumer)
	}
	if provider != "" {
		query = query.Where("provider = ?", provider)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&contracts).Error; err != nil {
		return nil, 0, err
	}

	return contracts, total, nil
}

// UpdateContract updates a contract
func (r *ContractRepository) UpdateContract(contract *models.Contract) error {
	return r.db.Save(contract).Error
}

// DeleteContract deletes a contract
func (r *ContractRepository) DeleteContract(id uuid.UUID) error {
	return r.db.Delete(&models.Contract{}, "id = ?", id).Error
}

// CreateInteraction creates a new interaction
func (r *ContractRepository) CreateInteraction(interaction *models.Interaction) error {
	return r.db.Create(interaction).Error
}

// ListInteractions retrieves interactions for a contract
func (r *ContractRepository) ListInteractions(contractID uuid.UUID) ([]models.Interaction, error) {
	var interactions []models.Interaction
	if err := r.db.Where("contract_id = ?", contractID).Order("created_at ASC").Find(&interactions).Error; err != nil {
		return nil, err
	}
	return interactions, nil
}

// ListInteractionsPaginated retrieves interactions for a contract with pagination
func (r *ContractRepository) ListInteractionsPaginated(contractID uuid.UUID, limit, offset int) ([]models.Interaction, int64, error) {
	var interactions []models.Interaction
	var total int64

	query := r.db.Model(&models.Interaction{}).Where("contract_id = ?", contractID)

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("created_at ASC").Limit(limit).Offset(offset).Find(&interactions).Error; err != nil {
		return nil, 0, err
	}

	return interactions, total, nil
}

// DeleteInteraction deletes an interaction by ID
func (r *ContractRepository) DeleteInteraction(id uuid.UUID) error {
	return r.db.Delete(&models.Interaction{}, "id = ?", id).Error
}

// GetInteractionByID retrieves an interaction by ID
func (r *ContractRepository) GetInteractionByID(id uuid.UUID) (*models.Interaction, error) {
	var interaction models.Interaction
	if err := r.db.First(&interaction, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &interaction, nil
}

// CreateVerification creates a new verification result
func (r *ContractRepository) CreateVerification(verification *models.Verification) error {
	return r.db.Create(verification).Error
}

// GetVerificationByID retrieves a verification by ID
func (r *ContractRepository) GetVerificationByID(id uuid.UUID) (*models.Verification, error) {
	var verification models.Verification
	if err := r.db.Preload("Contract").First(&verification, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &verification, nil
}

// ListVerifications retrieves verifications for a contract
func (r *ContractRepository) ListVerifications(contractID uuid.UUID, status models.VerificationStatus, limit, offset int) ([]models.Verification, int64, error) {
	var verifications []models.Verification
	var total int64

	query := r.db.Model(&models.Verification{}).Where("contract_id = ?", contractID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Order("verified_at DESC").Limit(limit).Offset(offset).Find(&verifications).Error; err != nil {
		return nil, 0, err
	}

	return verifications, total, nil
}

// GetLatestVerification retrieves the latest verification for a contract
func (r *ContractRepository) GetLatestVerification(contractID uuid.UUID) (*models.Verification, error) {
	var verification models.Verification
	if err := r.db.Where("contract_id = ?", contractID).
		Order("verified_at DESC").
		First(&verification).Error; err != nil {
		return nil, err
	}
	return &verification, nil
}

// UpdateVerification updates a verification
func (r *ContractRepository) UpdateVerification(verification *models.Verification) error {
	return r.db.Save(verification).Error
}

// CreateBreakingChange creates a new breaking change record
func (r *ContractRepository) CreateBreakingChange(change *models.BreakingChange) error {
	return r.db.Create(change).Error
}

// ListBreakingChanges retrieves breaking changes between two contracts
func (r *ContractRepository) ListBreakingChanges(oldContractID, newContractID uuid.UUID, severity models.BreakingChangeSeverity) ([]models.BreakingChange, error) {
	var changes []models.BreakingChange

	query := r.db.Model(&models.BreakingChange{}).
		Where("old_contract_id = ? AND new_contract_id = ?", oldContractID, newContractID)

	if severity != "" {
		query = query.Where("severity = ?", severity)
	}

	if err := query.Order("severity DESC, detected_at DESC").Find(&changes).Error; err != nil {
		return nil, err
	}

	return changes, nil
}

// GetBreakingChangesByContract retrieves all breaking changes for a contract
func (r *ContractRepository) GetBreakingChangesByContract(contractID uuid.UUID) ([]models.BreakingChange, error) {
	var changes []models.BreakingChange
	if err := r.db.Where("old_contract_id = ? OR new_contract_id = ?", contractID, contractID).
		Order("detected_at DESC").
		Find(&changes).Error; err != nil {
		return nil, err
	}
	return changes, nil
}

// GetContractVersions retrieves all versions of a contract
func (r *ContractRepository) GetContractVersions(consumer, provider string) ([]models.Contract, error) {
	var contracts []models.Contract
	if err := r.db.Where("consumer = ? AND provider = ?", consumer, provider).
		Order("created_at DESC").
		Find(&contracts).Error; err != nil {
		return nil, err
	}
	return contracts, nil
}
