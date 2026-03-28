package database

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/test-mesh/testmesh/internal/shared/config"
	"go.uber.org/zap"
)

// Neo4jClient wraps the Neo4j driver with convenience methods for the graph engine.
type Neo4jClient struct {
	driver   neo4j.DriverWithContext
	database string
	logger   *zap.Logger
}

// NewNeo4j creates a new Neo4j connection. Returns nil if URI is empty (graph disabled).
func NewNeo4j(cfg config.Neo4jConfig, logger *zap.Logger) (*Neo4jClient, error) {
	if cfg.URI == "" {
		logger.Info("Neo4j not configured — graph features disabled")
		return nil, nil
	}

	driver, err := neo4j.NewDriverWithContext(cfg.URI, neo4j.BasicAuth(cfg.User, cfg.Password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}

	// Verify connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := driver.VerifyConnectivity(ctx); err != nil {
		driver.Close(ctx)
		return nil, fmt.Errorf("failed to connect to neo4j at %s: %w", cfg.URI, err)
	}

	logger.Info("Connected to Neo4j",
		zap.String("uri", cfg.URI),
		zap.String("database", cfg.Database),
	)

	return &Neo4jClient{
		driver:   driver,
		database: cfg.Database,
		logger:   logger,
	}, nil
}

// Session creates a new Neo4j session for the configured database.
func (c *Neo4jClient) Session(ctx context.Context) neo4j.SessionWithContext {
	return c.driver.NewSession(ctx, neo4j.SessionConfig{
		DatabaseName: c.database,
	})
}

// ReadTransaction executes a read transaction and returns the result.
func (c *Neo4jClient) ReadTransaction(ctx context.Context, work func(tx neo4j.ManagedTransaction) (any, error)) (any, error) {
	session := c.Session(ctx)
	defer session.Close(ctx)
	return session.ExecuteRead(ctx, work)
}

// WriteTransaction executes a write transaction and returns the result.
func (c *Neo4jClient) WriteTransaction(ctx context.Context, work func(tx neo4j.ManagedTransaction) (any, error)) (any, error) {
	session := c.Session(ctx)
	defer session.Close(ctx)
	return session.ExecuteWrite(ctx, work)
}

// HealthCheck verifies Neo4j connectivity.
func (c *Neo4jClient) HealthCheck(ctx context.Context) error {
	return c.driver.VerifyConnectivity(ctx)
}

// Close closes the Neo4j driver.
func (c *Neo4jClient) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

// EnsureConstraints creates required Neo4j indexes and constraints for the graph schema.
func (c *Neo4jClient) EnsureConstraints(ctx context.Context) error {
	constraints := []string{
		// Unique constraint on node ID
		"CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE",
		// Index on workspace_id for tenant isolation
		"CREATE INDEX node_workspace_idx IF NOT EXISTS FOR (n:Node) ON (n.workspace_id)",
		// Index on node type for filtered queries
		"CREATE INDEX node_type_idx IF NOT EXISTS FOR (n:Node) ON (n.type)",
		// Composite index for service lookups
		"CREATE INDEX node_service_idx IF NOT EXISTS FOR (n:Node) ON (n.workspace_id, n.service)",
		// Index on node name for search
		"CREATE INDEX node_name_idx IF NOT EXISTS FOR (n:Node) ON (n.name)",
	}

	session := c.Session(ctx)
	defer session.Close(ctx)

	for _, constraint := range constraints {
		if _, err := session.Run(ctx, constraint, nil); err != nil {
			return fmt.Errorf("failed to create constraint: %s: %w", constraint, err)
		}
	}

	c.logger.Info("Neo4j constraints and indexes ensured")
	return nil
}
