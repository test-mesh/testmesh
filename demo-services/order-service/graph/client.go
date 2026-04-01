package graph

import (
	"context"
	"fmt"
	"os"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// Client wraps the Neo4j driver with order-graph operations.
type Client struct {
	driver neo4j.DriverWithContext
}

// NewClient creates a Neo4j client from env vars.
// NEO4J_URI defaults to bolt://neo4j:7687
// NEO4J_USER defaults to neo4j
// NEO4J_PASSWORD defaults to testmesh
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

	// Verify connectivity on startup (consistent with other clients in this service)
	if err := driver.VerifyConnectivity(context.Background()); err != nil {
		driver.Close(context.Background())
		return nil, fmt.Errorf("failed to connect to neo4j: %w", err)
	}

	return &Client{driver: driver}, nil
}

// Close closes the driver.
func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

// CreatePurchasedEdges writes PURCHASED relationship edges for all items in an order.
// Idempotent via MERGE.
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

// PurchaseNode represents a node in the purchase graph response.
type PurchaseNode struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

// PurchaseEdge represents an edge in the purchase graph response.
type PurchaseEdge struct {
	FromUserID  string `json:"from_user_id"`
	ToProductID string `json:"to_product_id"`
	OrderID     string `json:"order_id"`
}

// GetUserPurchaseGraph returns the purchase graph for a user (all PURCHASED edges).
func (c *Client) GetUserPurchaseGraph(ctx context.Context, userID string) ([]PurchaseNode, []PurchaseEdge, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (u:User {id: $user_id})-[r:PURCHASED]->(p:Product)
			 RETURN u.id AS user_id, p.id AS product_id, r.order_id AS order_id`,
			map[string]any{"user_id": userID},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, nil, err
	}

	records := result.([]*neo4j.Record)
	if len(records) == 0 {
		return []PurchaseNode{}, []PurchaseEdge{}, nil
	}

	nodeSet := map[string]PurchaseNode{}
	var edges []PurchaseEdge
	for _, rec := range records {
		uid, ok1 := rec.Get("user_id")
		pid, ok2 := rec.Get("product_id")
		oid, ok3 := rec.Get("order_id")
		if !ok1 || !ok2 || !ok3 || uid == nil || pid == nil || oid == nil {
			return nil, nil, fmt.Errorf("malformed neo4j record: missing required fields")
		}
		nodeSet[uid.(string)] = PurchaseNode{ID: uid.(string), Type: "User"}
		nodeSet[pid.(string)] = PurchaseNode{ID: pid.(string), Type: "Product"}
		edges = append(edges, PurchaseEdge{
			FromUserID:  uid.(string),
			ToProductID: pid.(string),
			OrderID:     oid.(string),
		})
	}

	var nodes []PurchaseNode
	for _, n := range nodeSet {
		nodes = append(nodes, n)
	}
	return nodes, edges, nil
}
