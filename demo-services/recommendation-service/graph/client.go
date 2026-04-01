package graph

import (
	"context"
	"fmt"
	"os"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Client struct {
	driver neo4j.DriverWithContext
}

func NewClient() (*Client, error) {
	uri := os.Getenv("NEO4J_URI")
	if uri == "" {
		uri = "bolt://neo4j:7687"
	}
	user := os.Getenv("NEO4J_USER")
	if user == "" {
		user = "neo4j"
	}
	password := os.Getenv("NEO4J_PASSWORD")
	if password == "" {
		password = "testmesh"
	}

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}
	if err := driver.VerifyConnectivity(context.Background()); err != nil {
		driver.Close(context.Background())
		return nil, fmt.Errorf("neo4j connectivity check failed: %w", err)
	}
	return &Client{driver: driver}, nil
}

func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

// CreatePurchasedEdges creates PURCHASED relationship edges. Called from the Kafka consumer.
func (c *Client) CreatePurchasedEdges(ctx context.Context, orderID, userID string, productIDs []string) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, pid := range productIDs {
			_, err := tx.Run(ctx,
				`MERGE (u:User {id: $user_id})
				 MERGE (p:Product {id: $product_id})
				 MERGE (u)-[r:PURCHASED {order_id: $order_id}]->(p)`,
				map[string]any{
					"user_id":    userID,
					"product_id": pid,
					"order_id":   orderID,
				},
			)
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

// GetRecommendationsForUser returns product IDs purchased by users who also purchased
// products this user bought (collaborative filtering). Excludes already-purchased products.
func (c *Client) GetRecommendationsForUser(ctx context.Context, userID string, limit int) ([]string, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (u:User {id: $user_id})-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(other:User)
			 MATCH (other)-[:PURCHASED]->(rec:Product)
			 WHERE NOT (u)-[:PURCHASED]->(rec)
			 RETURN rec.id AS product_id, count(*) AS score
			 ORDER BY score DESC
			 LIMIT $limit`,
			map[string]any{"user_id": userID, "limit": int64(limit)},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, err
	}

	var ids []string
	for _, rec := range result.([]*neo4j.Record) {
		if pid, ok := rec.Get("product_id"); ok && pid != nil {
			ids = append(ids, pid.(string))
		}
	}
	return ids, nil
}

// GetSimilarProducts returns products frequently purchased together with a given product.
func (c *Client) GetSimilarProducts(ctx context.Context, productID string, limit int) ([]string, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (p:Product {id: $product_id})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(other:Product)
			 WHERE other.id <> $product_id
			 RETURN other.id AS product_id, count(*) AS score
			 ORDER BY score DESC
			 LIMIT $limit`,
			map[string]any{"product_id": productID, "limit": int64(limit)},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, err
	}

	var ids []string
	for _, rec := range result.([]*neo4j.Record) {
		if pid, ok := rec.Get("product_id"); ok && pid != nil {
			ids = append(ids, pid.(string))
		}
	}
	return ids, nil
}
