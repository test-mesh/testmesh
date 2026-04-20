package telemetry

import (
	"context"
	"math"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// CoverageGap represents an endpoint seen in real traffic with no test flow.
type CoverageGap struct {
	ID              uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Service         string    `gorm:"not null" json:"service"`
	Operation       string    `json:"operation"`
	Method          string    `json:"method"`
	Route           string    `json:"route"`
	OccurrenceCount int       `gorm:"default:1" json:"occurrence_count"`
	ErrorCount      int       `gorm:"default:0" json:"error_count"`
	AvgLatencyMs    float64   `gorm:"default:0" json:"avg_latency_ms"`
	LastSeenAt      time.Time `json:"last_seen_at"`
	RiskScore       float64   `gorm:"default:0" json:"risk_score"`
	HasTestFlow     bool      `gorm:"default:false" json:"has_test_flow"`
	SampleTraceID   string    `json:"sample_trace_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (CoverageGap) TableName() string { return "telemetry.coverage_gaps" }

// stepURL holds a method+route pair for coverage marking.
type stepURL struct {
	Method string
	Route  string
}

// CoverageIndexer maintains the coverage_gaps table from incoming traces.
type CoverageIndexer struct {
	repo   *TelemetryRepository
	db     *gorm.DB
	logger *zap.Logger
}

func NewCoverageIndexer(repo *TelemetryRepository, _ interface{}, logger *zap.Logger) *CoverageIndexer {
	return &CoverageIndexer{repo: repo, db: repo.db, logger: logger}
}

// Update extracts HTTP endpoints from the trace and upserts coverage_gaps rows.
func (c *CoverageIndexer) Update(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	spans, err := c.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()

	for _, s := range spans {
		if s.IsTestGenerated {
			continue
		}

		method := getStringAttrMap(s.Attributes, "http.method")
		route := getStringAttrMap(s.Attributes, "http.route")
		if method == "" || route == "" {
			continue
		}

		errorInc := 0
		if s.StatusCode == "error" {
			errorInc = 1
		}

		err := c.db.WithContext(ctx).Exec(`
			INSERT INTO telemetry.coverage_gaps
				(workspace_id, service, operation, method, route, occurrence_count, error_count,
				 avg_latency_ms, last_seen_at, sample_trace_id, risk_score, updated_at)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?)
			ON CONFLICT (workspace_id, service, method, route) DO UPDATE SET
				occurrence_count = telemetry.coverage_gaps.occurrence_count + 1,
				error_count      = telemetry.coverage_gaps.error_count + EXCLUDED.error_count,
				avg_latency_ms   = (telemetry.coverage_gaps.avg_latency_ms *
				                    telemetry.coverage_gaps.occurrence_count + EXCLUDED.avg_latency_ms)
				                   / (telemetry.coverage_gaps.occurrence_count + 1),
				last_seen_at     = EXCLUDED.last_seen_at,
				sample_trace_id  = EXCLUDED.sample_trace_id,
				updated_at       = EXCLUDED.updated_at
		`,
			workspaceID, s.Service, s.Operation, method, route,
			errorInc, float64(s.DurationMs), now, traceID, now, now,
		).Error
		if err != nil {
			c.logger.Warn("failed to upsert coverage gap",
				zap.String("service", s.Service), zap.Error(err))
			continue
		}

		c.recomputeRisk(ctx, workspaceID, s.Service, method, route)
	}

	return nil
}

func (c *CoverageIndexer) recomputeRisk(ctx context.Context, wsID uuid.UUID, service, method, route string) {
	var gap CoverageGap
	if err := c.db.WithContext(ctx).
		Where("workspace_id = ? AND service = ? AND method = ? AND route = ?",
			wsID, service, method, route).
		First(&gap).Error; err != nil {
		return
	}

	errorRate := 0.0
	if gap.OccurrenceCount > 0 {
		errorRate = float64(gap.ErrorCount) / float64(gap.OccurrenceCount)
	}
	freqScore := math.Min(float64(gap.OccurrenceCount)/1000.0, 1.0)
	latScore := math.Min(gap.AvgLatencyMs/10000.0, 1.0)
	risk := 0.3*freqScore + 0.5*errorRate + 0.2*latScore

	c.db.WithContext(ctx).Model(&gap).Update("risk_score", risk) //nolint:errcheck
}

// MarkFlowCoverage sets has_test_flow=true for any gap matching the given method+route pairs.
func (c *CoverageIndexer) MarkFlowCoverage(ctx context.Context, workspaceID uuid.UUID, stepURLs []stepURL) error {
	for _, su := range stepURLs {
		c.db.WithContext(ctx).
			Model(&CoverageGap{}).
			Where("workspace_id = ? AND method = ? AND route = ?", workspaceID, su.Method, su.Route).
			Update("has_test_flow", true) //nolint:errcheck
	}
	return nil
}
