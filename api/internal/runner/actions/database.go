package actions

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// DatabaseHandler handles database query actions
type DatabaseHandler struct {
	logger *zap.Logger
}

// NewDatabaseHandler creates a new database action handler
func NewDatabaseHandler(logger *zap.Logger) *DatabaseHandler {
	return &DatabaseHandler{
		logger: logger,
	}
}

// Execute executes a database query action
func (h *DatabaseHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Extract configuration
	query, ok := config["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Get connection string (required)
	dsn, ok := config["connection"].(string)
	if !ok || dsn == "" {
		return nil, fmt.Errorf("connection string is required")
	}

	// Get query parameters (optional)
	var params []interface{}
	if paramsConfig, ok := config["params"]; ok {
		switch p := paramsConfig.(type) {
		case []interface{}:
			params = p
		case map[string]interface{}:
			// Convert map to slice (order may vary)
			for _, v := range p {
				params = append(params, v)
			}
		}
	}

	// Connect to database
	db, err := h.connect(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Get underlying sql.DB for connection management
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get database instance: %w", err)
	}
	defer sqlDB.Close()

	// Determine query type
	queryType := h.determineQueryType(query)

	h.logger.Info("Executing database query",
		zap.String("type", queryType),
		zap.String("query", query),
	)

	// Execute query based on type
	switch queryType {
	case "SELECT":
		return h.executeSelect(db, query, params)
	case "INSERT", "UPDATE", "DELETE":
		return h.executeModify(db, query, params)
	default:
		return h.executeRaw(db, query, params)
	}
}

// connect establishes a database connection
func (h *DatabaseHandler) connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: nil, // Disable GORM logging for cleaner output
	})
	if err != nil {
		return nil, err
	}

	return db, nil
}

// determineQueryType determines the type of SQL query
func (h *DatabaseHandler) determineQueryType(query string) string {
	query = strings.TrimSpace(strings.ToUpper(query))

	if strings.HasPrefix(query, "SELECT") {
		return "SELECT"
	}
	if strings.HasPrefix(query, "INSERT") {
		return "INSERT"
	}
	if strings.HasPrefix(query, "UPDATE") {
		return "UPDATE"
	}
	if strings.HasPrefix(query, "DELETE") {
		return "DELETE"
	}

	return "OTHER"
}

// executeSelect executes a SELECT query and returns results
func (h *DatabaseHandler) executeSelect(db *gorm.DB, query string, params []interface{}) (models.OutputData, error) {
	var results []map[string]interface{}

	rows, err := db.Raw(query, params...).Rows()
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}

	// Scan results
	for rows.Next() {
		row := make(map[string]interface{})
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))

		for i := range columns {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		for i, col := range columns {
			val := values[i]

			// Convert byte arrays to strings
			if b, ok := val.([]byte); ok {
				val = string(b)
			}

			row[col] = val
		}

		results = append(results, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	output := models.OutputData{
		"rows":       results,
		"row_count":  len(results),
		"query_type": "SELECT",
	}

	// If single row, also add first_row for convenience
	if len(results) > 0 {
		output["first_row"] = results[0]
	}

	h.logger.Info("SELECT query completed",
		zap.Int("row_count", len(results)),
	)

	return output, nil
}

// executeModify executes INSERT, UPDATE, or DELETE queries
func (h *DatabaseHandler) executeModify(db *gorm.DB, query string, params []interface{}) (models.OutputData, error) {
	result := db.Exec(query, params...)
	if result.Error != nil {
		return nil, fmt.Errorf("query failed: %w", result.Error)
	}

	queryType := h.determineQueryType(query)

	output := models.OutputData{
		"rows_affected": result.RowsAffected,
		"query_type":    queryType,
	}

	h.logger.Info("Modify query completed",
		zap.String("type", queryType),
		zap.Int64("rows_affected", result.RowsAffected),
	)

	return output, nil
}

// executeRaw executes other types of queries
func (h *DatabaseHandler) executeRaw(db *gorm.DB, query string, params []interface{}) (models.OutputData, error) {
	var result sql.Result
	var err error

	sqlDB, _ := db.DB()
	result, err = sqlDB.Exec(query, params...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()

	output := models.OutputData{
		"rows_affected": rowsAffected,
		"query_type":    "OTHER",
	}

	h.logger.Info("Raw query completed",
		zap.Int64("rows_affected", rowsAffected),
	)

	return output, nil
}
