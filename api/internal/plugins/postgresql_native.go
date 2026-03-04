package plugins

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

// PostgreSQLNativePlugin provides native PostgreSQL integration
type PostgreSQLNativePlugin struct {
	logger *zap.Logger
}

// NewPostgreSQLNativePlugin creates a new PostgreSQL plugin
func NewPostgreSQLNativePlugin(logger *zap.Logger) *PostgreSQLNativePlugin {
	return &PostgreSQLNativePlugin{logger: logger}
}

// Name returns the plugin name
func (p *PostgreSQLNativePlugin) Name() string {
	return "postgresql"
}

// Execute runs a PostgreSQL action
func (p *PostgreSQLNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)

	switch action {
	case "postgresql.query":
		return p.query(ctx, config)
	case "postgresql.insert":
		return p.insert(ctx, config)
	case "postgresql.update":
		return p.update(ctx, config)
	case "postgresql.delete":
		return p.delete(ctx, config)
	case "postgresql.assert":
		return p.assert(ctx, config)
	case "postgresql.execute":
		return p.execute(ctx, config)
	case "postgresql.transaction":
		return p.transaction(ctx, config)
	case "postgresql.tables":
		return p.tables(ctx, config)
	case "postgresql.columns":
		return p.columns(ctx, config)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (p *PostgreSQLNativePlugin) getConnectionString(config map[string]interface{}) string {
	if connStr, ok := config["connectionString"].(string); ok {
		return connStr
	}

	host := "localhost"
	port := "5432"
	database := "postgres"
	user := "postgres"
	password := ""
	sslmode := "disable"

	if h, ok := config["host"].(string); ok {
		host = h
	}
	if pt, ok := config["port"].(float64); ok {
		port = fmt.Sprintf("%d", int(pt))
	}
	if db, ok := config["database"].(string); ok {
		database = db
	}
	if u, ok := config["user"].(string); ok {
		user = u
	}
	if pw, ok := config["password"].(string); ok {
		password = pw
	}
	if ssl, ok := config["sslmode"].(string); ok {
		sslmode = ssl
	}

	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, database, sslmode)
}

func (p *PostgreSQLNativePlugin) connect(ctx context.Context, config map[string]interface{}) (*sql.DB, error) {
	connStr := p.getConnectionString(config)
	p.logger.Debug("Connecting to PostgreSQL", zap.String("connection", connStr))

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection: %w", err)
	}

	timeout := 10 * time.Second
	if t, ok := config["connectionTimeout"].(float64); ok {
		timeout = time.Duration(t) * time.Millisecond
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}

func (p *PostgreSQLNativePlugin) getParams(config map[string]interface{}) []interface{} {
	var params []interface{}
	if paramList, ok := config["params"].([]interface{}); ok {
		params = paramList
	}
	return params
}

func (p *PostgreSQLNativePlugin) rowsToMaps(rows *sql.Rows) ([]map[string]interface{}, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
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
			// Convert []byte to string for readability
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		results = append(results, row)
	}

	return results, nil
}

// query executes a SELECT query
func (p *PostgreSQLNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query, _ := config["query"].(string)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	params := p.getParams(config)
	p.logger.Info("Executing query", zap.String("query", truncate(query, 100)))

	start := time.Now()
	rows, err := db.QueryContext(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	duration := time.Since(start).Milliseconds()
	p.logger.Info("Query completed", zap.Int("rowCount", len(results)), zap.Int64("duration_ms", duration))

	columns, _ := rows.Columns()
	var fields []map[string]interface{}
	for _, col := range columns {
		fields = append(fields, map[string]interface{}{"name": col})
	}

	return map[string]interface{}{
		"rows":        results,
		"rowCount":    len(results),
		"fields":      fields,
		"duration_ms": duration,
	}, nil
}

// insert inserts a new record
func (p *PostgreSQLNativePlugin) insert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	table, _ := config["table"].(string)
	if table == "" {
		return nil, fmt.Errorf("table is required")
	}

	data, ok := config["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("data object is required")
	}

	var columns []string
	var placeholders []string
	var values []interface{}

	i := 1
	for col, val := range data {
		columns = append(columns, col)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}

	returning := []string{"*"}
	if ret, ok := config["returning"].([]interface{}); ok {
		returning = make([]string, len(ret))
		for i, r := range ret {
			returning[i] = r.(string)
		}
	}

	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
		table, strings.Join(columns, ", "), strings.Join(placeholders, ", "), strings.Join(returning, ", "))

	p.logger.Info("Inserting record", zap.String("table", table))

	rows, err := db.QueryContext(ctx, query, values...)
	if err != nil {
		return nil, fmt.Errorf("insert failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	return map[string]interface{}{
		"inserted": len(results),
		"rows":     results,
	}, nil
}

// update updates existing records
func (p *PostgreSQLNativePlugin) update(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	table, _ := config["table"].(string)
	if table == "" {
		return nil, fmt.Errorf("table is required")
	}

	data, ok := config["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("data object is required")
	}

	where, _ := config["where"].(string)
	if where == "" {
		return nil, fmt.Errorf("WHERE clause is required for safety")
	}

	var setClauses []string
	var values []interface{}

	i := 1
	for col, val := range data {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, i))
		values = append(values, val)
		i++
	}

	// Add where params
	whereParams := p.getParams(map[string]interface{}{"params": config["whereParams"]})
	values = append(values, whereParams...)

	// Adjust where placeholders
	adjustedWhere := where
	for j := 1; j <= len(whereParams); j++ {
		old := fmt.Sprintf("$%d", j)
		new := fmt.Sprintf("$%d", j+len(data))
		adjustedWhere = strings.Replace(adjustedWhere, old, new, 1)
	}

	returning := []string{"*"}
	if ret, ok := config["returning"].([]interface{}); ok {
		returning = make([]string, len(ret))
		for i, r := range ret {
			returning[i] = r.(string)
		}
	}

	query := fmt.Sprintf("UPDATE %s SET %s WHERE %s RETURNING %s",
		table, strings.Join(setClauses, ", "), adjustedWhere, strings.Join(returning, ", "))

	p.logger.Info("Updating records", zap.String("table", table), zap.String("where", where))

	rows, err := db.QueryContext(ctx, query, values...)
	if err != nil {
		return nil, fmt.Errorf("update failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	return map[string]interface{}{
		"updated": len(results),
		"rows":    results,
	}, nil
}

// delete removes records
func (p *PostgreSQLNativePlugin) delete(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	table, _ := config["table"].(string)
	if table == "" {
		return nil, fmt.Errorf("table is required")
	}

	where, _ := config["where"].(string)
	if where == "" {
		return nil, fmt.Errorf("WHERE clause is required for safety")
	}

	params := p.getParams(config)

	returning := []string{}
	if ret, ok := config["returning"].([]interface{}); ok {
		for _, r := range ret {
			returning = append(returning, r.(string))
		}
	}

	query := fmt.Sprintf("DELETE FROM %s WHERE %s", table, where)
	if len(returning) > 0 {
		query += fmt.Sprintf(" RETURNING %s", strings.Join(returning, ", "))
	}

	p.logger.Info("Deleting records", zap.String("table", table), zap.String("where", where))

	if len(returning) > 0 {
		rows, err := db.QueryContext(ctx, query, params...)
		if err != nil {
			return nil, fmt.Errorf("delete failed: %w", err)
		}
		defer rows.Close()

		results, err := p.rowsToMaps(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to read results: %w", err)
		}

		return map[string]interface{}{
			"deleted": len(results),
			"rows":    results,
		}, nil
	}

	result, err := db.ExecContext(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("delete failed: %w", err)
	}

	affected, _ := result.RowsAffected()
	return map[string]interface{}{
		"deleted": affected,
	}, nil
}

// assert runs a query and validates assertions
func (p *PostgreSQLNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query, _ := config["query"].(string)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	params := p.getParams(config)

	p.logger.Info("Executing assertion query", zap.String("query", truncate(query, 100)))

	rows, err := db.QueryContext(ctx, query, params...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	assertions, ok := config["assertions"].([]interface{})
	if !ok || len(assertions) == 0 {
		return map[string]interface{}{
			"passed":             true,
			"assertions_checked": 0,
			"row":                nil,
		}, nil
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("assertion failed: Query returned no rows")
	}

	row := results[0]
	var failures []map[string]interface{}

	for _, a := range assertions {
		assertion, ok := a.(map[string]interface{})
		if !ok {
			continue
		}

		field, _ := assertion["field"].(string)
		operator, _ := assertion["operator"].(string)
		expected := assertion["value"]
		actual := row[field]

		passed := p.checkAssertion(actual, operator, expected)
		if !passed {
			failures = append(failures, map[string]interface{}{
				"field":    field,
				"operator": operator,
				"expected": expected,
				"actual":   actual,
				"message":  fmt.Sprintf("Expected %s %s %v, got %v", field, operator, expected, actual),
			})
		}
	}

	if len(failures) > 0 {
		messages := make([]string, len(failures))
		for i, f := range failures {
			messages[i] = f["message"].(string)
		}
		return nil, fmt.Errorf("assertion failed: %s", strings.Join(messages, "; "))
	}

	p.logger.Info("All assertions passed", zap.Int("count", len(assertions)))

	return map[string]interface{}{
		"passed":             true,
		"assertions_checked": len(assertions),
		"row":                row,
	}, nil
}

func (p *PostgreSQLNativePlugin) checkAssertion(actual interface{}, operator string, expected interface{}) bool {
	switch operator {
	case "eq", "==", "===":
		return fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", expected)
	case "neq", "!=", "!==":
		return fmt.Sprintf("%v", actual) != fmt.Sprintf("%v", expected)
	case "gt", ">":
		return toFloat(actual) > toFloat(expected)
	case "gte", ">=":
		return toFloat(actual) >= toFloat(expected)
	case "lt", "<":
		return toFloat(actual) < toFloat(expected)
	case "lte", "<=":
		return toFloat(actual) <= toFloat(expected)
	case "contains":
		return strings.Contains(fmt.Sprintf("%v", actual), fmt.Sprintf("%v", expected))
	case "isNull":
		return actual == nil
	case "isNotNull":
		return actual != nil
	default:
		return false
	}
}

func toFloat(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int64:
		return float64(val)
	case int:
		return float64(val)
	case string:
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	default:
		return 0
	}
}

// execute runs one or more statements
func (p *PostgreSQLNativePlugin) execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var statements []interface{}
	if stmts, ok := config["statements"].([]interface{}); ok {
		statements = stmts
	} else if stmt, ok := config["statement"].(string); ok {
		statements = []interface{}{stmt}
	}

	p.logger.Info("Executing statements", zap.Int("count", len(statements)))

	var results []map[string]interface{}
	for _, stmt := range statements {
		var query string
		var params []interface{}

		switch s := stmt.(type) {
		case string:
			query = s
		case map[string]interface{}:
			query, _ = s["query"].(string)
			params = p.getParams(s)
		}

		result, err := db.ExecContext(ctx, query, params...)
		if err != nil {
			return nil, fmt.Errorf("statement failed: %w", err)
		}

		affected, _ := result.RowsAffected()
		results = append(results, map[string]interface{}{
			"rowCount": affected,
		})
	}

	return map[string]interface{}{
		"executed": len(results),
		"results":  results,
	}, nil
}

// transaction runs statements in a transaction
func (p *PostgreSQLNativePlugin) transaction(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	statements, ok := config["statements"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("statements array is required")
	}

	p.logger.Info("Starting transaction", zap.Int("statements", len(statements)))

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	var results []map[string]interface{}
	for _, stmt := range statements {
		var query string
		var params []interface{}

		switch s := stmt.(type) {
		case string:
			query = s
		case map[string]interface{}:
			query, _ = s["query"].(string)
			params = p.getParams(s)
		}

		rows, err := tx.QueryContext(ctx, query, params...)
		if err != nil {
			tx.Rollback()
			p.logger.Error("Transaction rolled back", zap.Error(err))
			return nil, fmt.Errorf("statement failed, transaction rolled back: %w", err)
		}

		rowResults, err := p.rowsToMaps(rows)
		rows.Close()
		if err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to read results: %w", err)
		}

		results = append(results, map[string]interface{}{
			"rowCount": len(rowResults),
			"rows":     rowResults,
		})
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	p.logger.Info("Transaction committed")

	return map[string]interface{}{
		"committed": true,
		"results":   results,
	}, nil
}

// tables lists tables in a schema
func (p *PostgreSQLNativePlugin) tables(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	schema := "public"
	if s, ok := config["schema"].(string); ok {
		schema = s
	}

	p.logger.Info("Listing tables", zap.String("schema", schema))

	query := `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`
	rows, err := db.QueryContext(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	return map[string]interface{}{
		"schema": schema,
		"tables": results,
	}, nil
}

// columns describes columns in a table
func (p *PostgreSQLNativePlugin) columns(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	db, err := p.connect(ctx, config)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	table, _ := config["table"].(string)
	if table == "" {
		return nil, fmt.Errorf("table is required")
	}

	schema := "public"
	if s, ok := config["schema"].(string); ok {
		schema = s
	}

	p.logger.Info("Describing columns", zap.String("table", table), zap.String("schema", schema))

	query := `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
              FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2
              ORDER BY ordinal_position`

	rows, err := db.QueryContext(ctx, query, schema, table)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	results, err := p.rowsToMaps(rows)
	if err != nil {
		return nil, fmt.Errorf("failed to read results: %w", err)
	}

	return map[string]interface{}{
		"table":   table,
		"schema":  schema,
		"columns": results,
	}, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// Helper to convert interface{} to JSON for debugging
func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
