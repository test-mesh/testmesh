package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/runner/actions/async"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// DBPollHandler handles the db_poll action type.
type DBPollHandler struct {
	logger *zap.Logger
}

// NewDBPollHandler creates a new DBPollHandler.
func NewDBPollHandler(logger *zap.Logger) *DBPollHandler {
	return &DBPollHandler{logger: logger}
}

// Execute polls a database query until a condition is satisfied or timeout is reached.
func (h *DBPollHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	cfg := &async.DBPollingConfig{
		Driver: "postgres",
	}

	if v, ok := config["connection"].(string); ok {
		cfg.DSN = v
	} else {
		return nil, fmt.Errorf("connection is required")
	}
	if v, ok := config["query"].(string); ok {
		cfg.Query = v
	} else {
		return nil, fmt.Errorf("query is required")
	}
	if v, ok := config["timeout"].(string); ok {
		cfg.Timeout = v
	}
	if v, ok := config["interval"].(string); ok {
		cfg.Interval = v
	}
	if v, ok := config["max_attempts"]; ok {
		switch n := v.(type) {
		case int:
			cfg.MaxAttempts = n
		case float64:
			cfg.MaxAttempts = int(n)
		}
	}

	// Query params
	if v, ok := config["params"]; ok {
		switch p := v.(type) {
		case []interface{}:
			cfg.Params = p
		case []string:
			for _, s := range p {
				cfg.Params = append(cfg.Params, s)
			}
		}
	}

	// Condition
	if v, ok := config["condition"]; ok {
		if m, ok := v.(map[string]interface{}); ok {
			cond := &async.PollCondition{}
			if t, ok := m["type"].(string); ok {
				cond.Type = t
			}
			if col, ok := m["column"].(string); ok {
				cond.Column = col
			}
			if val, ok := m["value"]; ok {
				cond.Value = val
			}
			if mc, ok := m["min_count"]; ok {
				switch n := mc.(type) {
				case int:
					cond.MinCount = n
				case float64:
					cond.MinCount = int(n)
				}
			}
			cfg.Condition = cond
		}
	}

	h.logger.Info("Starting db_poll",
		zap.String("query", cfg.Query),
		zap.String("timeout", cfg.Timeout),
		zap.String("interval", cfg.Interval),
	)

	poller := async.NewDBPoller(cfg)
	result, err := poller.Poll(ctx)
	if err != nil {
		return nil, err
	}

	if !result.Success {
		return nil, fmt.Errorf("db_poll condition not satisfied after %d attempts: %s", result.Attempts, result.Error)
	}

	h.logger.Info("db_poll condition satisfied",
		zap.Int("attempts", result.Attempts),
		zap.Int("row_count", result.RowCount),
		zap.Int64("duration_ms", result.Duration),
	)

	// Expose rows as generic interface slice for output mapping
	rows := make([]interface{}, len(result.Rows))
	for i, r := range result.Rows {
		rows[i] = r
	}

	out := models.OutputData{
		"success":     result.Success,
		"row_count":   result.RowCount,
		"attempts":    result.Attempts,
		"duration_ms": result.Duration,
		"rows":        rows,
	}
	if len(result.Rows) > 0 {
		out["first_row"] = result.Rows[0]
	}

	return out, nil
}
