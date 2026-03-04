package async

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// DBPollingConfig defines configuration for database polling
type DBPollingConfig struct {
	Driver          string        `yaml:"driver" json:"driver"`
	DSN             string        `yaml:"dsn" json:"dsn"`
	Query           string        `yaml:"query" json:"query"`
	Params          []interface{} `yaml:"params,omitempty" json:"params,omitempty"`
	Timeout         string        `yaml:"timeout" json:"timeout"`
	Interval        string        `yaml:"interval" json:"interval"`
	Condition       *PollCondition `yaml:"condition" json:"condition"`
	MaxAttempts     int           `yaml:"max_attempts" json:"max_attempts"`
}

// PollCondition defines when polling should stop
type PollCondition struct {
	Type     string      `yaml:"type" json:"type"` // "row_exists", "row_count", "value_equals", "value_matches"
	Column   string      `yaml:"column,omitempty" json:"column,omitempty"`
	Value    interface{} `yaml:"value,omitempty" json:"value,omitempty"`
	MinCount int         `yaml:"min_count,omitempty" json:"min_count,omitempty"`
	Pattern  string      `yaml:"pattern,omitempty" json:"pattern,omitempty"`
}

// DBPollingResult holds the result of database polling
type DBPollingResult struct {
	Success     bool                     `json:"success"`
	Rows        []map[string]interface{} `json:"rows"`
	RowCount    int                      `json:"row_count"`
	Attempts    int                      `json:"attempts"`
	Duration    int64                    `json:"duration_ms"`
	Satisfied   bool                     `json:"condition_satisfied"`
	Error       string                   `json:"error,omitempty"`
}

// DBPoller handles database polling operations
type DBPoller struct {
	config *DBPollingConfig
}

// NewDBPoller creates a new database poller
func NewDBPoller(config *DBPollingConfig) *DBPoller {
	return &DBPoller{config: config}
}

// Poll polls the database until condition is met or timeout
func (p *DBPoller) Poll(ctx context.Context) (*DBPollingResult, error) {
	start := time.Now()
	result := &DBPollingResult{
		Rows: make([]map[string]interface{}, 0),
	}

	// Parse timeout
	timeout := 60 * time.Second
	if p.config.Timeout != "" {
		if parsed, err := time.ParseDuration(p.config.Timeout); err == nil {
			timeout = parsed
		}
	}

	// Parse interval
	interval := 1 * time.Second
	if p.config.Interval != "" {
		if parsed, err := time.ParseDuration(p.config.Interval); err == nil {
			interval = parsed
		}
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Connect to database
	db, err := sql.Open(p.config.Driver, p.config.DSN)
	if err != nil {
		result.Error = fmt.Sprintf("failed to connect: %v", err)
		return result, err
	}
	defer db.Close()

	// Polling loop
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	maxAttempts := p.config.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = 100
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result.Attempts = attempt

		rows, err := p.executeQuery(ctx, db)
		if err != nil {
			result.Error = err.Error()
			return result, err
		}

		result.Rows = rows
		result.RowCount = len(rows)

		// Check condition
		if p.checkCondition(rows) {
			result.Success = true
			result.Satisfied = true
			result.Duration = time.Since(start).Milliseconds()
			return result, nil
		}

		// Wait for next attempt or timeout
		select {
		case <-ctx.Done():
			result.Duration = time.Since(start).Milliseconds()
			result.Error = "timeout waiting for condition"
			return result, nil
		case <-ticker.C:
			// Continue to next attempt
		}
	}

	result.Duration = time.Since(start).Milliseconds()
	result.Error = "max attempts reached"
	return result, nil
}

func (p *DBPoller) executeQuery(ctx context.Context, db *sql.DB) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, p.config.Query, p.config.Params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	results := make([]map[string]interface{}, 0)

	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}

		row := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]
			if b, ok := val.([]byte); ok {
				// Try to parse as JSON
				var jsonVal interface{}
				if json.Unmarshal(b, &jsonVal) == nil {
					row[col] = jsonVal
				} else {
					row[col] = string(b)
				}
			} else {
				row[col] = val
			}
		}
		results = append(results, row)
	}

	return results, nil
}

func (p *DBPoller) checkCondition(rows []map[string]interface{}) bool {
	if p.config.Condition == nil {
		return len(rows) > 0
	}

	switch p.config.Condition.Type {
	case "row_exists":
		return len(rows) > 0

	case "row_count":
		minCount := p.config.Condition.MinCount
		if minCount == 0 {
			minCount = 1
		}
		return len(rows) >= minCount

	case "value_equals":
		if len(rows) == 0 {
			return false
		}
		for _, row := range rows {
			if val, ok := row[p.config.Condition.Column]; ok {
				if fmt.Sprintf("%v", val) == fmt.Sprintf("%v", p.config.Condition.Value) {
					return true
				}
			}
		}
		return false

	case "value_not_null":
		if len(rows) == 0 {
			return false
		}
		for _, row := range rows {
			if val, ok := row[p.config.Condition.Column]; ok && val != nil {
				return true
			}
		}
		return false

	default:
		return len(rows) > 0
	}
}
