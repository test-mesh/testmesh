package contracts

import (
	"fmt"
	"reflect"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Differ detects breaking changes between contract versions
type Differ struct {
	repo   *repository.ContractRepository
	logger *zap.Logger
}

// NewDiffer creates a new contract differ
func NewDiffer(repo *repository.ContractRepository, logger *zap.Logger) *Differ {
	return &Differ{
		repo:   repo,
		logger: logger,
	}
}

// DetectBreakingChanges detects breaking changes between two contract versions
func (d *Differ) DetectBreakingChanges(oldContractID, newContractID uuid.UUID) ([]models.BreakingChange, error) {
	// Load contracts
	oldContract, err := d.repo.GetContractByID(oldContractID)
	if err != nil {
		return nil, fmt.Errorf("old contract not found: %w", err)
	}

	newContract, err := d.repo.GetContractByID(newContractID)
	if err != nil {
		return nil, fmt.Errorf("new contract not found: %w", err)
	}

	// Ensure they're for the same consumer-provider pair
	if oldContract.Consumer != newContract.Consumer || oldContract.Provider != newContract.Provider {
		return nil, fmt.Errorf("contracts are not for the same consumer-provider pair")
	}

	// Load interactions
	oldInteractions, err := d.repo.ListInteractions(oldContractID)
	if err != nil {
		return nil, fmt.Errorf("failed to load old interactions: %w", err)
	}

	newInteractions, err := d.repo.ListInteractions(newContractID)
	if err != nil {
		return nil, fmt.Errorf("failed to load new interactions: %w", err)
	}

	// Build interaction maps by description
	oldMap := make(map[string]models.Interaction)
	for _, interaction := range oldInteractions {
		oldMap[interaction.Description] = interaction
	}

	newMap := make(map[string]models.Interaction)
	for _, interaction := range newInteractions {
		newMap[interaction.Description] = interaction
	}

	// Detect changes
	changes := make([]models.BreakingChange, 0)

	// Check for removed interactions
	for desc, oldInt := range oldMap {
		if _, exists := newMap[desc]; !exists {
			change := models.BreakingChange{
				OldContractID: oldContractID,
				NewContractID: newContractID,
				ChangeType:    "removed_interaction",
				Severity:      models.SeverityCritical,
				Description:   fmt.Sprintf("Interaction '%s' was removed", desc),
				Details: models.ChangeDetails{
					InteractionID: oldInt.ID.String(),
					Impact:        "Consumer expecting this interaction will fail",
					Suggestion:    "Restore the interaction or provide migration path",
				},
				DetectedAt: time.Now(),
			}
			changes = append(changes, change)

			// Save to database
			if err := d.repo.CreateBreakingChange(&change); err != nil {
				d.logger.Error("Failed to save breaking change", zap.Error(err))
			}
		}
	}

	// Check for modified interactions
	for desc, newInt := range newMap {
		if oldInt, exists := oldMap[desc]; exists {
			interactionChanges := d.compareInteractions(oldContractID, newContractID, oldInt, newInt)
			changes = append(changes, interactionChanges...)

			// Save to database
			for _, change := range interactionChanges {
				if err := d.repo.CreateBreakingChange(&change); err != nil {
					d.logger.Error("Failed to save breaking change", zap.Error(err))
				}
			}
		}
	}

	// Check for new interactions (not breaking, but informational)
	for desc, newInt := range newMap {
		if _, exists := oldMap[desc]; !exists {
			change := models.BreakingChange{
				OldContractID: oldContractID,
				NewContractID: newContractID,
				ChangeType:    "added_interaction",
				Severity:      models.SeverityMinor,
				Description:   fmt.Sprintf("New interaction '%s' was added", desc),
				Details: models.ChangeDetails{
					InteractionID: newInt.ID.String(),
					Impact:        "New functionality available, but not breaking existing consumers",
					Suggestion:    "Update consumer tests to cover new interaction",
				},
				DetectedAt: time.Now(),
			}
			changes = append(changes, change)

			// Save to database
			if err := d.repo.CreateBreakingChange(&change); err != nil {
				d.logger.Error("Failed to save breaking change", zap.Error(err))
			}
		}
	}

	d.logger.Info("Breaking change detection completed",
		zap.String("consumer", oldContract.Consumer),
		zap.String("provider", oldContract.Provider),
		zap.String("old_version", oldContract.Version),
		zap.String("new_version", newContract.Version),
		zap.Int("changes_detected", len(changes)),
	)

	return changes, nil
}

// compareInteractions compares two interactions and detects breaking changes
func (d *Differ) compareInteractions(oldContractID, newContractID uuid.UUID, oldInt, newInt models.Interaction) []models.BreakingChange {
	changes := make([]models.BreakingChange, 0)

	// Compare request method
	if oldInt.Request.Method != newInt.Request.Method {
		changes = append(changes, models.BreakingChange{
			OldContractID: oldContractID,
			NewContractID: newContractID,
			ChangeType:    "modified_request_method",
			Severity:      models.SeverityCritical,
			Description:   fmt.Sprintf("Request method changed from %s to %s in '%s'", oldInt.Request.Method, newInt.Request.Method, oldInt.Description),
			Details: models.ChangeDetails{
				InteractionID: oldInt.ID.String(),
				Field:         "request.method",
				OldValue:      oldInt.Request.Method,
				NewValue:      newInt.Request.Method,
				Impact:        "Requests will fail due to method mismatch",
				Suggestion:    "Revert method change or version the endpoint",
			},
			DetectedAt: time.Now(),
		})
	}

	// Compare request path
	if oldInt.Request.Path != newInt.Request.Path {
		changes = append(changes, models.BreakingChange{
			OldContractID: oldContractID,
			NewContractID: newContractID,
			ChangeType:    "modified_request_path",
			Severity:      models.SeverityCritical,
			Description:   fmt.Sprintf("Request path changed from %s to %s in '%s'", oldInt.Request.Path, newInt.Request.Path, oldInt.Description),
			Details: models.ChangeDetails{
				InteractionID: oldInt.ID.String(),
				Field:         "request.path",
				OldValue:      oldInt.Request.Path,
				NewValue:      newInt.Request.Path,
				Impact:        "Requests will hit wrong endpoint",
				Suggestion:    "Maintain old path or provide redirect",
			},
			DetectedAt: time.Now(),
		})
	}

	// Compare response status
	if oldInt.Response.Status != newInt.Response.Status {
		severity := models.SeverityMajor
		if oldInt.Response.Status < 400 && newInt.Response.Status >= 400 {
			severity = models.SeverityCritical
		}

		changes = append(changes, models.BreakingChange{
			OldContractID: oldContractID,
			NewContractID: newContractID,
			ChangeType:    "modified_response_status",
			Severity:      severity,
			Description:   fmt.Sprintf("Response status changed from %d to %d in '%s'", oldInt.Response.Status, newInt.Response.Status, oldInt.Description),
			Details: models.ChangeDetails{
				InteractionID: oldInt.ID.String(),
				Field:         "response.status",
				OldValue:      oldInt.Response.Status,
				NewValue:      newInt.Response.Status,
				Impact:        "Consumer error handling may break",
				Suggestion:    "Review status code semantics",
			},
			DetectedAt: time.Now(),
		})
	}

	// Compare request headers (check for removed required headers)
	for oldKey := range oldInt.Request.Headers {
		if _, exists := newInt.Request.Headers[oldKey]; !exists {
			changes = append(changes, models.BreakingChange{
				OldContractID: oldContractID,
				NewContractID: newContractID,
				ChangeType:    "removed_request_header",
				Severity:      models.SeverityMajor,
				Description:   fmt.Sprintf("Required request header '%s' removed in '%s'", oldKey, oldInt.Description),
				Details: models.ChangeDetails{
					InteractionID: oldInt.ID.String(),
					Field:         fmt.Sprintf("request.headers.%s", oldKey),
					OldValue:      oldInt.Request.Headers[oldKey],
					NewValue:      nil,
					Impact:        "Provider may reject requests without this header",
					Suggestion:    "Make header optional or document removal",
				},
				DetectedAt: time.Now(),
			})
		}
	}

	// Compare response body structure
	bodyChanges := d.compareResponseBody(oldContractID, newContractID, oldInt, newInt)
	changes = append(changes, bodyChanges...)

	return changes
}

// compareResponseBody compares response body structures
func (d *Differ) compareResponseBody(oldContractID, newContractID uuid.UUID, oldInt, newInt models.Interaction) []models.BreakingChange {
	changes := make([]models.BreakingChange, 0)

	// If both bodies are nil, no changes
	if oldInt.Response.Body == nil && newInt.Response.Body == nil {
		return changes
	}

	// If one is nil and other is not, it's a change
	if (oldInt.Response.Body == nil) != (newInt.Response.Body == nil) {
		severity := models.SeverityMajor
		if oldInt.Response.Body != nil && newInt.Response.Body == nil {
			severity = models.SeverityCritical
		}

		changes = append(changes, models.BreakingChange{
			OldContractID: oldContractID,
			NewContractID: newContractID,
			ChangeType:    "modified_response_body",
			Severity:      severity,
			Description:   fmt.Sprintf("Response body structure changed in '%s'", oldInt.Description),
			Details: models.ChangeDetails{
				InteractionID: oldInt.ID.String(),
				Field:         "response.body",
				Impact:        "Consumer may fail to parse response",
				Suggestion:    "Maintain response structure compatibility",
			},
			DetectedAt: time.Now(),
		})
		return changes
	}

	// Deep compare body structures
	bodyChanges := d.compareBodyStructure(oldContractID, newContractID, oldInt, "$", oldInt.Response.Body, newInt.Response.Body)
	changes = append(changes, bodyChanges...)

	return changes
}

// compareBodyStructure recursively compares body structures
func (d *Differ) compareBodyStructure(oldContractID, newContractID uuid.UUID, interaction models.Interaction, path string, oldBody, newBody interface{}) []models.BreakingChange {
	changes := make([]models.BreakingChange, 0)

	// If types differ, it's a breaking change
	if reflect.TypeOf(oldBody) != reflect.TypeOf(newBody) {
		changes = append(changes, models.BreakingChange{
			OldContractID: oldContractID,
			NewContractID: newContractID,
			ChangeType:    "modified_response_body_type",
			Severity:      models.SeverityCritical,
			Description:   fmt.Sprintf("Response body type changed at %s in '%s'", path, interaction.Description),
			Details: models.ChangeDetails{
				InteractionID: interaction.ID.String(),
				Field:         path,
				OldValue:      fmt.Sprintf("%T", oldBody),
				NewValue:      fmt.Sprintf("%T", newBody),
				Impact:        "Consumer will fail to parse response",
				Suggestion:    "Maintain consistent types",
			},
			DetectedAt: time.Now(),
		})
		return changes
	}

	// Compare based on type
	switch oldVal := oldBody.(type) {
	case map[string]interface{}:
		newVal := newBody.(map[string]interface{})

		// Check for removed fields
		for key := range oldVal {
			if _, exists := newVal[key]; !exists {
				changes = append(changes, models.BreakingChange{
					OldContractID: oldContractID,
					NewContractID: newContractID,
					ChangeType:    "removed_response_field",
					Severity:      models.SeverityCritical,
					Description:   fmt.Sprintf("Response field '%s%s' was removed in '%s'", path, key, interaction.Description),
					Details: models.ChangeDetails{
						InteractionID: interaction.ID.String(),
						Field:         fmt.Sprintf("%s.%s", path, key),
						OldValue:      oldVal[key],
						NewValue:      nil,
						Impact:        "Consumer expecting this field will fail",
						Suggestion:    "Restore field or provide default value",
					},
					DetectedAt: time.Now(),
				})
			}
		}

		// Recursively compare common fields
		for key, oldFieldValue := range oldVal {
			if newFieldValue, exists := newVal[key]; exists {
				fieldChanges := d.compareBodyStructure(oldContractID, newContractID, interaction, fmt.Sprintf("%s.%s", path, key), oldFieldValue, newFieldValue)
				changes = append(changes, fieldChanges...)
			}
		}

	case []interface{}:
		// For arrays, check if structure is maintained
		// We don't do deep comparison of array elements for simplicity
		// In production, you might want more sophisticated array comparison
		newVal := newBody.([]interface{})
		if len(oldVal) > 0 && len(newVal) > 0 {
			// Compare first element structure
			elementChanges := d.compareBodyStructure(oldContractID, newContractID, interaction, fmt.Sprintf("%s[0]", path), oldVal[0], newVal[0])
			changes = append(changes, elementChanges...)
		}
	}

	return changes
}

// DetectBreakingChangesByVersion detects breaking changes between consumer-provider versions
func (d *Differ) DetectBreakingChangesByVersion(consumer, provider, oldVersion, newVersion string) ([]models.BreakingChange, error) {
	oldContract, err := d.repo.GetContractByVersion(consumer, provider, oldVersion)
	if err != nil {
		return nil, fmt.Errorf("old version not found: %w", err)
	}

	newContract, err := d.repo.GetContractByVersion(consumer, provider, newVersion)
	if err != nil {
		return nil, fmt.Errorf("new version not found: %w", err)
	}

	return d.DetectBreakingChanges(oldContract.ID, newContract.ID)
}

// GetBreakingChangesSummary provides a summary of breaking changes by severity
func (d *Differ) GetBreakingChangesSummary(oldContractID, newContractID uuid.UUID) (map[string]int, error) {
	changes, err := d.repo.ListBreakingChanges(oldContractID, newContractID, "")
	if err != nil {
		return nil, err
	}

	summary := map[string]int{
		"critical": 0,
		"major":    0,
		"minor":    0,
		"total":    len(changes),
	}

	for _, change := range changes {
		switch change.Severity {
		case models.SeverityCritical:
			summary["critical"]++
		case models.SeverityMajor:
			summary["major"]++
		case models.SeverityMinor:
			summary["minor"]++
		}
	}

	return summary, nil
}
