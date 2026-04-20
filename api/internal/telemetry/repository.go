package telemetry

import (
	"context"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TelemetryRepository handles database operations for telemetry data.
type TelemetryRepository struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewTelemetryRepository creates a new TelemetryRepository.
func NewTelemetryRepository(db *gorm.DB, logger *zap.Logger) *TelemetryRepository {
	return &TelemetryRepository{db: db, logger: logger}
}

// --- Span operations ---

// InsertSpans bulk-inserts spans into the database.
func (r *TelemetryRepository) InsertSpans(ctx context.Context, spans []Span) error {
	if len(spans) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).CreateInBatches(spans, 100).Error
}

// GetSpansByTraceID returns all spans for a given trace.
func (r *TelemetryRepository) GetSpansByTraceID(ctx context.Context, workspaceID uuid.UUID, traceID string) ([]Span, error) {
	var spans []Span
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND trace_id = ?", workspaceID, traceID).
		Order("start_time ASC").
		Find(&spans).Error
	return spans, err
}

// QuerySpans queries spans using filters.
func (r *TelemetryRepository) QuerySpans(ctx context.Context, filter SpanFilter) ([]Span, error) {
	var spans []Span
	q := r.db.WithContext(ctx).Where("workspace_id = ?", filter.WorkspaceID)

	if filter.TraceID != "" {
		q = q.Where("trace_id = ?", filter.TraceID)
	}
	if filter.Service != "" {
		q = q.Where("service = ?", filter.Service)
	}
	if filter.Operation != "" {
		q = q.Where("operation = ?", filter.Operation)
	}
	if filter.StatusCode != "" {
		q = q.Where("status_code = ?", filter.StatusCode)
	}
	if filter.IsTestGenerated != nil {
		q = q.Where("is_test_generated = ?", *filter.IsTestGenerated)
	}
	if filter.Since != nil {
		q = q.Where("created_at >= ?", *filter.Since)
	}
	if filter.Until != nil {
		q = q.Where("created_at <= ?", *filter.Until)
	}

	limit := filter.Limit
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	q = q.Order("start_time DESC").Limit(limit).Offset(filter.Offset)

	err := q.Find(&spans).Error
	return spans, err
}

// DeleteOldSpans removes spans older than the given retention period.
func (r *TelemetryRepository) DeleteOldSpans(ctx context.Context, workspaceID uuid.UUID, retentionDays int) (int64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND created_at < ?", workspaceID, cutoff).
		Delete(&Span{})
	return result.RowsAffected, result.Error
}

// --- Discovered Flow operations ---

// UpsertDiscoveredFlow creates or updates a discovered flow by fingerprint.
func (r *TelemetryRepository) UpsertDiscoveredFlow(ctx context.Context, flow *DiscoveredFlow) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "workspace_id"},
				{Name: "fingerprint"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"occurrence_count", "last_seen_at", "avg_duration_ms",
				"error_rate", "risk_score", "drifted", "drift_details",
				"sample_trace_id", "updated_at",
			}),
		}).
		Create(flow).Error
}

// GetFlowByFingerprint retrieves a discovered flow by its fingerprint.
func (r *TelemetryRepository) GetFlowByFingerprint(ctx context.Context, workspaceID uuid.UUID, fingerprint string) (*DiscoveredFlow, error) {
	var flow DiscoveredFlow
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND fingerprint = ?", workspaceID, fingerprint).
		First(&flow).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &flow, nil
}

// GetFlowByID retrieves a discovered flow by its ID.
func (r *TelemetryRepository) GetFlowByID(ctx context.Context, workspaceID uuid.UUID, flowID uuid.UUID) (*DiscoveredFlow, error) {
	var flow DiscoveredFlow
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND id = ?", workspaceID, flowID).
		First(&flow).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &flow, nil
}

// ListDiscoveredFlows returns discovered flows for a workspace with optional sorting.
func (r *TelemetryRepository) ListDiscoveredFlows(ctx context.Context, workspaceID uuid.UUID, sortBy string, driftedOnly bool) ([]DiscoveredFlow, error) {
	var flows []DiscoveredFlow
	q := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)

	if driftedOnly {
		q = q.Where("drifted = true")
	}

	switch sortBy {
	case "risk_score":
		q = q.Order("risk_score DESC")
	case "occurrence_count":
		q = q.Order("occurrence_count DESC")
	case "error_rate":
		q = q.Order("error_rate DESC")
	case "last_seen_at":
		q = q.Order("last_seen_at DESC")
	default:
		q = q.Order("risk_score DESC")
	}

	err := q.Find(&flows).Error
	return flows, err
}

// --- Validation operations ---

// CreateValidationResult stores a trace validation result.
func (r *TelemetryRepository) CreateValidationResult(ctx context.Context, result *TraceValidationResult) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "execution_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"status", "path_match", "missing_nodes", "unexpected_nodes",
				"order_violations", "slow_spans", "error_spans",
				"failed_assertions", "root_cause_diff",
			}),
		}).
		Create(result).Error
}

// GetValidationByExecutionID retrieves a validation result by execution ID.
func (r *TelemetryRepository) GetValidationByExecutionID(ctx context.Context, executionID uuid.UUID) (*TraceValidationResult, error) {
	var result TraceValidationResult
	err := r.db.WithContext(ctx).
		Where("execution_id = ?", executionID).
		First(&result).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &result, nil
}

// --- Settings operations ---

// GetTraceSettings retrieves telemetry settings for a workspace.
func (r *TelemetryRepository) GetTraceSettings(ctx context.Context, workspaceID uuid.UUID) (*TraceSettings, error) {
	var settings TraceSettings
	err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		First(&settings).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Return defaults
			return &TraceSettings{
				WorkspaceID:      workspaceID,
				Enabled:          true,
				RetentionDays:    30,
				DefaultTimeoutMs: 30000,
				AutoDiscovery:    true,
				AutoValidation:   true,
			}, nil
		}
		return nil, err
	}
	return &settings, nil
}

// UpdateTraceSettings creates or updates telemetry settings.
func (r *TelemetryRepository) UpdateTraceSettings(ctx context.Context, settings *TraceSettings) error {
	return r.db.WithContext(ctx).
		Where("workspace_id = ?", settings.WorkspaceID).
		Assign(settings).
		FirstOrCreate(settings).Error
}

// --- Analytics ---

// ComputeP95Duration computes the P95 duration for spans matching a service+operation.
func (r *TelemetryRepository) ComputeP95Duration(ctx context.Context, workspaceID uuid.UUID, service, operation string) (float64, error) {
	var p95 float64
	err := r.db.WithContext(ctx).Raw(`
		SELECT COALESCE(
			percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0
		)
		FROM telemetry.spans
		WHERE workspace_id = ? AND service = ? AND operation = ?
			AND created_at > NOW() - INTERVAL '7 days'
	`, workspaceID, service, operation).Scan(&p95).Error
	return p95, err
}

// GetDistinctTraceIDs returns distinct trace IDs for spans in a time window.
func (r *TelemetryRepository) GetDistinctTraceIDs(ctx context.Context, workspaceID uuid.UUID, since time.Time) ([]string, error) {
	var traceIDs []string
	err := r.db.WithContext(ctx).
		Model(&Span{}).
		Where("workspace_id = ? AND created_at >= ?", workspaceID, since).
		Distinct("trace_id").
		Pluck("trace_id", &traceIDs).Error
	return traceIDs, err
}

// GetAllWorkspaceIDs returns all distinct workspace IDs that have trace settings or spans.
func (r *TelemetryRepository) GetAllWorkspaceIDs(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&TraceSettings{}).
		Distinct("workspace_id").
		Pluck("workspace_id", &ids).Error
	return ids, err
}

// ListCoverageGaps returns coverage gaps for a workspace with optional filtering and sorting.
func (r *TelemetryRepository) ListCoverageGaps(ctx context.Context, workspaceID uuid.UUID, uncoveredOnly bool, sort string, limit, offset int) ([]CoverageGap, error) {
	q := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if uncoveredOnly {
		q = q.Where("has_test_flow = false")
	}
	allowedSort := map[string]bool{"risk_score": true, "last_seen_at": true, "occurrence_count": true}
	if !allowedSort[sort] {
		sort = "risk_score"
	}
	q = q.Order(sort + " DESC").Limit(limit).Offset(offset)
	var gaps []CoverageGap
	return gaps, q.Find(&gaps).Error
}

// CountCoverageGaps returns the count of coverage gaps for a workspace.
func (r *TelemetryRepository) CountCoverageGaps(ctx context.Context, workspaceID uuid.UUID, uncoveredOnly bool) (int64, error) {
	q := r.db.WithContext(ctx).Model(&CoverageGap{}).Where("workspace_id = ?", workspaceID)
	if uncoveredOnly {
		q = q.Where("has_test_flow = false")
	}
	var count int64
	return count, q.Count(&count).Error
}

// --- Repair Suggestion operations ---

// GetRepairSuggestions returns all repair suggestions for a given execution, newest first.
func (r *TelemetryRepository) GetRepairSuggestions(ctx context.Context, executionID uuid.UUID) ([]RepairSuggestion, error) {
	var suggestions []RepairSuggestion
	err := r.db.WithContext(ctx).
		Where("execution_id = ?", executionID).
		Order("created_at DESC").
		Find(&suggestions).Error
	return suggestions, err
}

// ApplyRepairSuggestion marks a repair suggestion as accepted and records the applied time.
func (r *TelemetryRepository) ApplyRepairSuggestion(ctx context.Context, suggestionID uuid.UUID) (*RepairSuggestion, error) {
	var s RepairSuggestion
	if err := r.db.WithContext(ctx).Where("id = ?", suggestionID).First(&s).Error; err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	s.Status = "accepted"
	s.AppliedAt = &now
	return &s, r.db.WithContext(ctx).Save(&s).Error
}

// DismissRepairSuggestion marks a repair suggestion as dismissed.
func (r *TelemetryRepository) DismissRepairSuggestion(ctx context.Context, suggestionID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&RepairSuggestion{}).
		Where("id = ?", suggestionID).
		Update("status", "dismissed").Error
}
