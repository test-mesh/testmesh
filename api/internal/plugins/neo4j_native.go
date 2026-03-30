// api/internal/plugins/neo4j_native.go
package plugins

import (
	"context"
	"fmt"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// Neo4jNativePlugin provides native Neo4j integration.
// Actions: neo4j.query, neo4j.assert
type Neo4jNativePlugin struct {
	logger *zap.Logger
}

func NewNeo4jNativePlugin(logger *zap.Logger) *Neo4jNativePlugin {
	return &Neo4jNativePlugin{logger: logger}
}

func (p *Neo4jNativePlugin) Name() string { return "neo4j" }

func (p *Neo4jNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "neo4j.query":
		return p.query(ctx, config)
	case "neo4j.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown neo4j action: %s", action)
	}
}

func (p *Neo4jNativePlugin) driver(config map[string]interface{}) (neo4j.DriverWithContext, error) {
	url, _ := config["url"].(string)
	if url == "" {
		url = "bolt://localhost:7687"
	}
	username, _ := config["username"].(string)
	if username == "" {
		username = "neo4j"
	}
	password, _ := config["password"].(string)
	return neo4j.NewDriverWithContext(url, neo4j.BasicAuth(username, password, ""))
}

func (p *Neo4jNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	cypher, ok := config["query"].(string)
	if !ok || cypher == "" {
		return nil, fmt.Errorf("neo4j.query: query is required")
	}

	database, _ := config["database"].(string)
	if database == "" {
		database = "neo4j"
	}

	var params map[string]interface{}
	if raw, ok := config["params"].(map[string]interface{}); ok {
		params = raw
	}

	driver, err := p.driver(config)
	if err != nil {
		return nil, fmt.Errorf("neo4j.query: connect: %w", err)
	}
	defer driver.Close(ctx)

	session := driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: database})
	defer session.Close(ctx)

	result, err := session.Run(ctx, cypher, params)
	if err != nil {
		return nil, fmt.Errorf("neo4j.query: run: %w", err)
	}

	var rows []map[string]interface{}
	for result.Next(ctx) {
		row := make(map[string]interface{})
		for k, v := range result.Record().AsMap() {
			row[k] = v
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		return nil, fmt.Errorf("neo4j.query: iterate: %w", err)
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}

	p.logger.Info("neo4j.query", zap.String("query", cypher), zap.Int("rows", len(rows)))
	return map[string]interface{}{"rows": rows, "count": len(rows)}, nil
}

func (p *Neo4jNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	result, err := p.query(ctx, config)
	if err != nil {
		return nil, err
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}

	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("neo4j.assert: %w", err)
		}
	}

	return result, nil
}
