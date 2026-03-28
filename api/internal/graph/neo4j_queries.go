package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// --- Neo4j Helper Methods (Dual-Write Support) ---

// upsertNodeNeo4j creates or updates a node in Neo4j with workspace isolation.
// The node is labeled with both :Node and its specific type (e.g., :Service, :ApiEndpoint).
func (e *DefaultEngine) upsertNodeNeo4j(ctx context.Context, node *GraphNode) error {
	cypher := `
		MERGE (n:Node {id: $id})
		SET n.workspace_id = $workspace_id,
		    n.type = $type,
		    n.name = $name,
		    n.service = $service,
		    n.source_layer = $source_layer,
		    n.source_file = $source_file,
		    n.confidence = $confidence,
		    n.version = $version,
		    n.updated_at = datetime()
		WITH n
		CALL apoc.create.addLabels(n, [$label]) YIELD node
		RETURN node
	`

	// Fallback if APOC is not available: use simple MERGE without dynamic labels
	cypherSimple := `
		MERGE (n:Node {id: $id})
		SET n.workspace_id = $workspace_id,
		    n.type = $type,
		    n.name = $name,
		    n.service = $service,
		    n.source_layer = $source_layer,
		    n.source_file = $source_file,
		    n.confidence = $confidence,
		    n.version = $version,
		    n.updated_at = datetime()
		RETURN n
	`

	params := map[string]any{
		"id":           node.ID.String(),
		"workspace_id": node.WorkspaceID.String(),
		"type":         string(node.Type),
		"name":         node.Name,
		"service":      node.Service,
		"source_layer": string(node.SourceLayer),
		"source_file":  node.SourceFile,
		"confidence":   node.Confidence,
		"version":      node.Version,
		"label":        neo4jLabel(node.Type),
	}

	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		// Try with APOC first for dynamic labels
		_, err := tx.Run(ctx, cypher, params)
		if err != nil {
			// Fallback to simple version without dynamic labels
			_, err = tx.Run(ctx, cypherSimple, params)
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	})

	if err != nil {
		return fmt.Errorf("neo4j upsert node: %w", err)
	}

	// Store the Neo4j ID back on the node for PostgreSQL reference
	if node.Neo4jID == "" {
		node.Neo4jID = node.ID.String()
	}

	return nil
}

// deleteNodeNeo4j removes a node and all its relationships from Neo4j.
func (e *DefaultEngine) deleteNodeNeo4j(ctx context.Context, neo4jID string) error {
	cypher := `
		MATCH (n:Node {id: $id})
		DETACH DELETE n
	`
	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, cypher, map[string]any{"id": neo4jID})
		return nil, err
	})
	return err
}

// upsertEdgeNeo4j creates or updates a relationship in Neo4j.
func (e *DefaultEngine) upsertEdgeNeo4j(ctx context.Context, edge *GraphEdge) error {
	// Neo4j relationship types must be uppercase identifiers
	relType := neo4jRelType(edge.Type)

	// Use APOC to create relationship with dynamic type
	cypher := fmt.Sprintf(`
		MATCH (from:Node {id: $from_id})
		MATCH (to:Node {id: $to_id})
		MERGE (from)-[r:%s {id: $id}]->(to)
		SET r.workspace_id = $workspace_id,
		    r.type = $type,
		    r.source_layer = $source_layer,
		    r.confidence = $confidence,
		    r.created_at = datetime()
		RETURN r
	`, relType)

	params := map[string]any{
		"id":           edge.ID.String(),
		"from_id":      edge.FromNodeID.String(),
		"to_id":        edge.ToNodeID.String(),
		"workspace_id": edge.WorkspaceID.String(),
		"type":         string(edge.Type),
		"source_layer": string(edge.SourceLayer),
		"confidence":   edge.Confidence,
	}

	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, cypher, params)
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("neo4j upsert edge: %w", err)
	}

	if edge.Neo4jID == "" {
		edge.Neo4jID = edge.ID.String()
	}

	return nil
}

// deleteEdgeNeo4j removes a relationship from Neo4j by its ID property.
func (e *DefaultEngine) deleteEdgeNeo4j(ctx context.Context, neo4jID string) error {
	cypher := `
		MATCH ()-[r {id: $id}]->()
		DELETE r
	`
	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, cypher, map[string]any{"id": neo4jID})
		return nil, err
	})
	return err
}

// bulkUpsertNodesNeo4j batch-upserts nodes using UNWIND for efficiency.
func (e *DefaultEngine) bulkUpsertNodesNeo4j(ctx context.Context, nodes []GraphNode) error {
	cypher := `
		UNWIND $nodes AS node
		MERGE (n:Node {id: node.id})
		SET n.workspace_id = node.workspace_id,
		    n.type = node.type,
		    n.name = node.name,
		    n.service = node.service,
		    n.source_layer = node.source_layer,
		    n.source_file = node.source_file,
		    n.confidence = node.confidence,
		    n.version = node.version,
		    n.updated_at = datetime()
	`

	// Build parameter list
	nodeParams := make([]map[string]any, len(nodes))
	for i, n := range nodes {
		nodeParams[i] = map[string]any{
			"id":           n.ID.String(),
			"workspace_id": n.WorkspaceID.String(),
			"type":         string(n.Type),
			"name":         n.Name,
			"service":      n.Service,
			"source_layer": string(n.SourceLayer),
			"source_file":  n.SourceFile,
			"confidence":   n.Confidence,
			"version":      n.Version,
		}
		if n.Neo4jID == "" {
			nodes[i].Neo4jID = n.ID.String()
		}
	}

	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, cypher, map[string]any{"nodes": nodeParams})
		return nil, err
	})

	if err != nil {
		return fmt.Errorf("neo4j bulk upsert nodes: %w", err)
	}
	return nil
}

// bulkUpsertEdgesNeo4j batch-upserts edges grouped by relationship type.
// Neo4j requires static relationship types in Cypher, so we group edges by type
// and execute one UNWIND per group.
func (e *DefaultEngine) bulkUpsertEdgesNeo4j(ctx context.Context, edges []GraphEdge) error {
	// Group edges by type since Neo4j needs static relationship types in MERGE
	grouped := make(map[EdgeType][]GraphEdge)
	for _, edge := range edges {
		grouped[edge.Type] = append(grouped[edge.Type], edge)
	}

	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for edgeType, group := range grouped {
			relType := neo4jRelType(edgeType)

			cypher := fmt.Sprintf(`
				UNWIND $edges AS edge
				MATCH (from:Node {id: edge.from_id})
				MATCH (to:Node {id: edge.to_id})
				MERGE (from)-[r:%s {id: edge.id}]->(to)
				SET r.workspace_id = edge.workspace_id,
				    r.type = edge.type,
				    r.source_layer = edge.source_layer,
				    r.confidence = edge.confidence,
				    r.created_at = datetime()
			`, relType)

			edgeParams := make([]map[string]any, len(group))
			for i, e := range group {
				edgeParams[i] = map[string]any{
					"id":           e.ID.String(),
					"from_id":      e.FromNodeID.String(),
					"to_id":        e.ToNodeID.String(),
					"workspace_id": e.WorkspaceID.String(),
					"type":         string(e.Type),
					"source_layer": string(e.SourceLayer),
					"confidence":   e.Confidence,
				}
			}

			if _, err := tx.Run(ctx, cypher, map[string]any{"edges": edgeParams}); err != nil {
				return nil, fmt.Errorf("neo4j bulk upsert edges type %s: %w", edgeType, err)
			}
		}
		return nil, nil
	})

	if err != nil {
		return fmt.Errorf("neo4j bulk upsert edges: %w", err)
	}

	// Backfill Neo4j IDs
	for i := range edges {
		if edges[i].Neo4jID == "" {
			edges[i].Neo4jID = edges[i].ID.String()
		}
	}

	return nil
}

// clearWorkspaceNeo4j removes all nodes and relationships for a workspace.
func (e *DefaultEngine) clearWorkspaceNeo4j(ctx context.Context, workspaceID uuid.UUID) error {
	// Delete in batches to avoid memory issues with large graphs
	cypher := `
		MATCH (n:Node {workspace_id: $workspace_id})
		WITH n LIMIT 10000
		DETACH DELETE n
		RETURN count(*) as deleted
	`

	_, err := e.neo4j.WriteTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for {
			result, err := tx.Run(ctx, cypher, map[string]any{
				"workspace_id": workspaceID.String(),
			})
			if err != nil {
				return nil, err
			}
			record, err := result.Single(ctx)
			if err != nil {
				return nil, err
			}
			deleted, _ := record.Get("deleted")
			if deleted.(int64) == 0 {
				break
			}
		}
		return nil, nil
	})

	return err
}

// --- Traversal Queries (Neo4j-powered) ---

// GetDependencies returns the downstream subgraph reachable from a node up to `depth` hops.
func (e *DefaultEngine) GetDependencies(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	if e.neo4j == nil {
		return e.getDependenciesSQL(ctx, nodeID, depth)
	}

	if depth <= 0 {
		depth = 3
	}

	cypher := fmt.Sprintf(`
		MATCH path = (start:Node {id: $id})-[*1..%d]->(downstream)
		WITH nodes(path) AS ns, relationships(path) AS rs
		UNWIND ns AS n
		WITH COLLECT(DISTINCT n) AS nodes, rs
		UNWIND rs AS r
		RETURN nodes, COLLECT(DISTINCT r) AS edges
	`, depth)

	return e.executeSubgraphQuery(ctx, cypher, map[string]any{"id": nodeID.String()})
}

// GetDependents returns the upstream subgraph that depends on a node up to `depth` hops.
func (e *DefaultEngine) GetDependents(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	if e.neo4j == nil {
		return e.getDependentsSQL(ctx, nodeID, depth)
	}

	if depth <= 0 {
		depth = 3
	}

	cypher := fmt.Sprintf(`
		MATCH path = (upstream)-[*1..%d]->(target:Node {id: $id})
		WITH nodes(path) AS ns, relationships(path) AS rs
		UNWIND ns AS n
		WITH COLLECT(DISTINCT n) AS nodes, rs
		UNWIND rs AS r
		RETURN nodes, COLLECT(DISTINCT r) AS edges
	`, depth)

	return e.executeSubgraphQuery(ctx, cypher, map[string]any{"id": nodeID.String()})
}

// FindPaths finds all shortest paths between two nodes.
func (e *DefaultEngine) FindPaths(ctx context.Context, fromID, toID uuid.UUID) ([]GraphPath, error) {
	if e.neo4j == nil {
		return e.findPathsSQL(ctx, fromID, toID)
	}

	cypher := `
		MATCH path = allShortestPaths(
			(start:Node {id: $from_id})-[*..10]-(end:Node {id: $to_id})
		)
		RETURN nodes(path) AS nodes, relationships(path) AS edges
	`

	result, err := e.neo4j.ReadTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, cypher, map[string]any{
			"from_id": fromID.String(),
			"to_id":   toID.String(),
		})
		if err != nil {
			return nil, err
		}

		var paths []GraphPath
		for records.Next(ctx) {
			record := records.Record()
			nodeIDs := extractNodeIDs(record, "nodes")
			edgeIDs := extractEdgeIDs(record, "edges")

			path := GraphPath{}
			path.Nodes, _ = e.loadNodesByNeo4jIDs(ctx, nodeIDs)
			path.Edges, _ = e.loadEdgesByNeo4jIDs(ctx, edgeIDs)
			paths = append(paths, path)
		}

		return paths, records.Err()
	})

	if err != nil {
		return nil, fmt.Errorf("find paths: %w", err)
	}
	return result.([]GraphPath), nil
}

// GetFlowsForNode returns flow IDs connected to a given node via tested_by edges.
func (e *DefaultEngine) GetFlowsForNode(ctx context.Context, nodeID uuid.UUID) ([]uuid.UUID, error) {
	var edges []GraphEdge
	err := e.db.WithContext(ctx).
		Where("(from_node = ? OR to_node = ?) AND type = ?", nodeID, nodeID, EdgeTypeTestedBy).
		Find(&edges).Error
	if err != nil {
		return nil, err
	}

	flowIDs := make([]uuid.UUID, 0, len(edges))
	for _, edge := range edges {
		// The "other" node in a tested_by edge contains the flow reference
		if edge.FromNodeID == nodeID {
			flowIDs = append(flowIDs, edge.ToNodeID)
		} else {
			flowIDs = append(flowIDs, edge.FromNodeID)
		}
	}
	return flowIDs, nil
}

// GetUncoveredNodes returns testable nodes with no tested_by edges.
func (e *DefaultEngine) GetUncoveredNodes(ctx context.Context, workspaceID uuid.UUID) ([]GraphNode, error) {
	var nodes []GraphNode
	err := e.db.WithContext(ctx).Raw(`
		SELECT gn.*
		FROM graph.graph_nodes gn
		WHERE gn.workspace_id = ?
		  AND gn.type IN ('api_endpoint', 'topic', 'grpc_method', 'websocket')
		  AND NOT EXISTS (
		    SELECT 1 FROM graph.graph_edges ge
		    WHERE ge.to_node = gn.id AND ge.type = 'tested_by'
		  )
		ORDER BY gn.name ASC
	`, workspaceID).Scan(&nodes).Error
	return nodes, err
}

// GetSystemFlows discovers end-to-end paths starting from an entry node.
func (e *DefaultEngine) GetSystemFlows(ctx context.Context, entryID uuid.UUID) ([]SystemFlow, error) {
	if e.neo4j == nil {
		return nil, fmt.Errorf("system flow discovery requires Neo4j")
	}

	cypher := `
		MATCH path = (entry:Node {id: $id})-[:CALLS|PUBLISHES|TRIGGERS*1..8]->(downstream)
		WHERE NOT (downstream)-[:CALLS|PUBLISHES|TRIGGERS]->()
		RETURN nodes(path) AS nodes, relationships(path) AS rels
		ORDER BY length(path) DESC
		LIMIT 20
	`

	result, err := e.neo4j.ReadTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, cypher, map[string]any{"id": entryID.String()})
		if err != nil {
			return nil, err
		}

		var flows []SystemFlow
		for records.Next(ctx) {
			record := records.Record()
			nodeIDs := extractNodeIDs(record, "nodes")
			edgeIDs := extractEdgeIDs(record, "rels")

			nodes, _ := e.loadNodesByNeo4jIDs(ctx, nodeIDs)
			edges, _ := e.loadEdgesByNeo4jIDs(ctx, edgeIDs)

			if len(nodes) == 0 {
				continue
			}

			flow := SystemFlow{
				ID:    uuid.New().String(),
				Entry: nodes[0],
			}

			for i := 1; i < len(nodes); i++ {
				step := FlowStep{Node: nodes[i]}
				if i-1 < len(edges) {
					step.Via = edges[i-1].Type
				}
				flow.Steps = append(flow.Steps, step)
			}

			flows = append(flows, flow)
		}

		return flows, records.Err()
	})

	if err != nil {
		return nil, fmt.Errorf("get system flows: %w", err)
	}
	return result.([]SystemFlow), nil
}

// GetImpact performs impact analysis for changed nodes, finding affected nodes and flows.
func (e *DefaultEngine) GetImpact(ctx context.Context, changedNodeIDs []uuid.UUID) (*ImpactReport, error) {
	report := &ImpactReport{}

	// Load the changed nodes
	for _, id := range changedNodeIDs {
		node, err := e.GetNode(ctx, id)
		if err != nil {
			continue
		}
		report.ChangedNodes = append(report.ChangedNodes, *node)
	}

	if e.neo4j == nil {
		return e.getImpactSQL(ctx, changedNodeIDs, report)
	}

	// Find affected nodes up to 3 hops away
	ids := make([]string, len(changedNodeIDs))
	for i, id := range changedNodeIDs {
		ids[i] = id.String()
	}

	cypher := `
		UNWIND $ids AS changedID
		MATCH (changed:Node {id: changedID})
		OPTIONAL MATCH path = (changed)<-[*1..3]-(upstream)
		WITH changed, upstream, length(path) AS distance
		WHERE upstream IS NOT NULL AND upstream.id <> changed.id
		RETURN DISTINCT upstream.id AS id, MIN(distance) AS min_distance
	`

	type affectedEntry struct {
		id       string
		distance int64
	}

	result, err := e.neo4j.ReadTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, cypher, map[string]any{"ids": ids})
		if err != nil {
			return nil, err
		}

		var affected []affectedEntry
		for records.Next(ctx) {
			record := records.Record()
			id, _ := record.Get("id")
			dist, _ := record.Get("min_distance")
			affected = append(affected, affectedEntry{
				id:       id.(string),
				distance: dist.(int64),
			})
		}
		return affected, records.Err()
	})

	if err != nil {
		return report, fmt.Errorf("impact analysis: %w", err)
	}

	entries := result.([]affectedEntry)
	for _, entry := range entries {
		uid, err := uuid.Parse(entry.id)
		if err != nil {
			continue
		}
		node, err := e.GetNode(ctx, uid)
		if err != nil {
			continue
		}
		report.AffectedNodes = append(report.AffectedNodes, *node)

		// Check if this affected node is part of any flows
		flowIDs, _ := e.GetFlowsForNode(ctx, uid)
		for _, flowID := range flowIDs {
			relevance := 0.4 // default 2+ hops
			if entry.distance == 1 {
				relevance = 1.0
			} else if entry.distance == 2 {
				relevance = 0.7
			}

			report.AffectedFlows = append(report.AffectedFlows, AffectedFlow{
				FlowID:    flowID,
				Relevance: relevance,
				Reason:    fmt.Sprintf("%s is %d hop(s) from changed node", node.Name, entry.distance),
			})
		}
	}

	return report, nil
}

// GetContracts discovers service-to-service contracts via shared intermediaries.
func (e *DefaultEngine) GetContracts(ctx context.Context, workspaceID uuid.UUID) ([]Contract, error) {
	if e.neo4j == nil {
		return e.getContractsSQL(ctx, workspaceID)
	}

	cypher := `
		MATCH (producer:Node {workspace_id: $ws})-[:PUBLISHES|EXPOSES]->(via:Node)-[:CONSUMES|CALLS]-(consumer:Node)
		WHERE producer.type = 'service' AND consumer.type = 'service'
		  AND producer.id <> consumer.id
		RETURN producer.id AS producer_id,
		       consumer.id AS consumer_id,
		       via.id AS via_id
		ORDER BY producer.name, consumer.name
	`

	result, err := e.neo4j.ReadTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, cypher, map[string]any{"ws": workspaceID.String()})
		if err != nil {
			return nil, err
		}

		var contracts []Contract
		for records.Next(ctx) {
			record := records.Record()
			producerID, _ := record.Get("producer_id")
			consumerID, _ := record.Get("consumer_id")
			viaID, _ := record.Get("via_id")

			pID, _ := uuid.Parse(producerID.(string))
			cID, _ := uuid.Parse(consumerID.(string))
			vID, _ := uuid.Parse(viaID.(string))

			producer, _ := e.GetNode(ctx, pID)
			consumer, _ := e.GetNode(ctx, cID)
			via, _ := e.GetNode(ctx, vID)

			if producer != nil && consumer != nil && via != nil {
				contracts = append(contracts, Contract{
					ID:       fmt.Sprintf("%s-%s-%s", pID, vID, cID),
					Producer: *producer,
					Consumer: *consumer,
					Via:      *via,
				})
			}
		}

		return contracts, records.Err()
	})

	if err != nil {
		return nil, fmt.Errorf("get contracts: %w", err)
	}
	return result.([]Contract), nil
}

// --- SQL Fallbacks (when Neo4j is not available) ---

// getDependenciesSQL provides a limited depth=1 fallback using PostgreSQL.
func (e *DefaultEngine) getDependenciesSQL(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	_ = depth // SQL fallback only supports 1 hop
	subgraph := &Subgraph{}

	// Get outgoing edges
	var edges []GraphEdge
	if err := e.db.WithContext(ctx).Where("from_node = ?", nodeID).Find(&edges).Error; err != nil {
		return nil, err
	}
	subgraph.Edges = edges

	// Get the target nodes
	targetIDs := make([]uuid.UUID, 0, len(edges)+1)
	targetIDs = append(targetIDs, nodeID)
	for _, edge := range edges {
		targetIDs = append(targetIDs, edge.ToNodeID)
	}

	var nodes []GraphNode
	if err := e.db.WithContext(ctx).Where("id IN ?", targetIDs).Find(&nodes).Error; err != nil {
		return nil, err
	}
	subgraph.Nodes = nodes

	return subgraph, nil
}

// getDependentsSQL provides a limited depth=1 fallback using PostgreSQL.
func (e *DefaultEngine) getDependentsSQL(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	_ = depth
	subgraph := &Subgraph{}

	var edges []GraphEdge
	if err := e.db.WithContext(ctx).Where("to_node = ?", nodeID).Find(&edges).Error; err != nil {
		return nil, err
	}
	subgraph.Edges = edges

	sourceIDs := make([]uuid.UUID, 0, len(edges)+1)
	sourceIDs = append(sourceIDs, nodeID)
	for _, edge := range edges {
		sourceIDs = append(sourceIDs, edge.FromNodeID)
	}

	var nodes []GraphNode
	if err := e.db.WithContext(ctx).Where("id IN ?", sourceIDs).Find(&nodes).Error; err != nil {
		return nil, err
	}
	subgraph.Nodes = nodes

	return subgraph, nil
}

// findPathsSQL provides a basic SQL fallback — only finds direct edges.
func (e *DefaultEngine) findPathsSQL(ctx context.Context, fromID, toID uuid.UUID) ([]GraphPath, error) {
	var edges []GraphEdge
	err := e.db.WithContext(ctx).
		Where("(from_node = ? AND to_node = ?) OR (from_node = ? AND to_node = ?)",
			fromID, toID, toID, fromID).
		Find(&edges).Error
	if err != nil || len(edges) == 0 {
		return nil, err
	}

	// Load both nodes
	var nodes []GraphNode
	e.db.WithContext(ctx).Where("id IN ?", []uuid.UUID{fromID, toID}).Find(&nodes)

	return []GraphPath{{Nodes: nodes, Edges: edges}}, nil
}

// getImpactSQL provides a SQL-based impact analysis (1 hop only).
func (e *DefaultEngine) getImpactSQL(ctx context.Context, changedNodeIDs []uuid.UUID, report *ImpactReport) (*ImpactReport, error) {
	var edges []GraphEdge
	err := e.db.WithContext(ctx).
		Where("to_node IN ?", changedNodeIDs).
		Find(&edges).Error
	if err != nil {
		return report, err
	}

	seen := make(map[uuid.UUID]bool)
	for _, edge := range edges {
		if seen[edge.FromNodeID] {
			continue
		}
		seen[edge.FromNodeID] = true

		node, err := e.GetNode(ctx, edge.FromNodeID)
		if err != nil {
			continue
		}
		report.AffectedNodes = append(report.AffectedNodes, *node)

		flowIDs, _ := e.GetFlowsForNode(ctx, edge.FromNodeID)
		for _, flowID := range flowIDs {
			report.AffectedFlows = append(report.AffectedFlows, AffectedFlow{
				FlowID:    flowID,
				Relevance: 1.0,
				Reason:    fmt.Sprintf("%s directly depends on changed node", node.Name),
			})
		}
	}

	return report, nil
}

// getContractsSQL discovers contracts using SQL joins.
func (e *DefaultEngine) getContractsSQL(ctx context.Context, workspaceID uuid.UUID) ([]Contract, error) {
	var results []struct {
		ProducerID uuid.UUID
		ViaID      uuid.UUID
		ConsumerID uuid.UUID
	}

	err := e.db.WithContext(ctx).Raw(`
		SELECT DISTINCT
			e1.from_node AS producer_id,
			e1.to_node AS via_id,
			e2.from_node AS consumer_id
		FROM graph.graph_edges e1
		JOIN graph.graph_edges e2 ON e1.to_node = e2.to_node
		JOIN graph.graph_nodes producer ON e1.from_node = producer.id AND producer.type = 'service'
		JOIN graph.graph_nodes consumer ON e2.from_node = consumer.id AND consumer.type = 'service'
		WHERE e1.workspace_id = ?
		  AND e1.type IN ('publishes', 'exposes')
		  AND e2.type IN ('consumes', 'calls')
		  AND e1.from_node <> e2.from_node
	`, workspaceID).Scan(&results).Error
	if err != nil {
		return nil, err
	}

	var contracts []Contract
	for _, r := range results {
		producer, _ := e.GetNode(ctx, r.ProducerID)
		consumer, _ := e.GetNode(ctx, r.ConsumerID)
		via, _ := e.GetNode(ctx, r.ViaID)
		if producer != nil && consumer != nil && via != nil {
			contracts = append(contracts, Contract{
				ID:       fmt.Sprintf("%s-%s-%s", r.ProducerID, r.ViaID, r.ConsumerID),
				Producer: *producer,
				Consumer: *consumer,
				Via:      *via,
			})
		}
	}

	return contracts, nil
}

// --- Internal Helpers ---

// executeSubgraphQuery runs a Cypher query that returns nodes and edges, then hydrates from PostgreSQL.
func (e *DefaultEngine) executeSubgraphQuery(ctx context.Context, cypher string, params map[string]any) (*Subgraph, error) {
	result, err := e.neo4j.ReadTransaction(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		records, err := tx.Run(ctx, cypher, params)
		if err != nil {
			return nil, err
		}

		allNodeIDs := make(map[string]bool)
		allEdgeIDs := make(map[string]bool)

		for records.Next(ctx) {
			record := records.Record()
			for _, id := range extractNodeIDs(record, "nodes") {
				allNodeIDs[id] = true
			}
			for _, id := range extractEdgeIDs(record, "edges") {
				allEdgeIDs[id] = true
			}
		}

		return &struct {
			nodeIDs []string
			edgeIDs []string
		}{
			nodeIDs: mapKeys(allNodeIDs),
			edgeIDs: mapKeys(allEdgeIDs),
		}, records.Err()
	})

	if err != nil {
		return nil, err
	}

	ids := result.(*struct {
		nodeIDs []string
		edgeIDs []string
	})

	subgraph := &Subgraph{}
	subgraph.Nodes, _ = e.loadNodesByNeo4jIDs(ctx, ids.nodeIDs)
	subgraph.Edges, _ = e.loadEdgesByNeo4jIDs(ctx, ids.edgeIDs)

	return subgraph, nil
}

// loadNodesByNeo4jIDs loads PostgreSQL nodes by their Neo4j IDs (which are UUID strings).
func (e *DefaultEngine) loadNodesByNeo4jIDs(ctx context.Context, neo4jIDs []string) ([]GraphNode, error) {
	if len(neo4jIDs) == 0 {
		return nil, nil
	}

	// Neo4j IDs are the UUID strings, so we can query by id directly
	uuids := make([]uuid.UUID, 0, len(neo4jIDs))
	for _, id := range neo4jIDs {
		uid, err := uuid.Parse(id)
		if err != nil {
			continue
		}
		uuids = append(uuids, uid)
	}

	var nodes []GraphNode
	err := e.db.WithContext(ctx).Where("id IN ?", uuids).Find(&nodes).Error
	return nodes, err
}

// loadEdgesByNeo4jIDs loads PostgreSQL edges by their Neo4j IDs (which are UUID strings).
func (e *DefaultEngine) loadEdgesByNeo4jIDs(ctx context.Context, neo4jIDs []string) ([]GraphEdge, error) {
	if len(neo4jIDs) == 0 {
		return nil, nil
	}

	uuids := make([]uuid.UUID, 0, len(neo4jIDs))
	for _, id := range neo4jIDs {
		uid, err := uuid.Parse(id)
		if err != nil {
			continue
		}
		uuids = append(uuids, uid)
	}

	var edges []GraphEdge
	err := e.db.WithContext(ctx).Where("id IN ?", uuids).Find(&edges).Error
	return edges, err
}

// extractNodeIDs pulls node IDs from a Neo4j record field containing a list of nodes.
func extractNodeIDs(record *neo4j.Record, key string) []string {
	val, ok := record.Get(key)
	if !ok || val == nil {
		return nil
	}

	nodes, ok := val.([]any)
	if !ok {
		return nil
	}

	var ids []string
	for _, n := range nodes {
		if node, ok := n.(neo4j.Node); ok {
			if id, exists := node.Props["id"]; exists {
				ids = append(ids, fmt.Sprintf("%v", id))
			}
		}
	}
	return ids
}

// extractEdgeIDs pulls edge IDs from a Neo4j record field containing a list of relationships.
func extractEdgeIDs(record *neo4j.Record, key string) []string {
	val, ok := record.Get(key)
	if !ok || val == nil {
		return nil
	}

	rels, ok := val.([]any)
	if !ok {
		return nil
	}

	var ids []string
	for _, r := range rels {
		if rel, ok := r.(neo4j.Relationship); ok {
			if id, exists := rel.Props["id"]; exists {
				ids = append(ids, fmt.Sprintf("%v", id))
			}
		}
	}
	return ids
}

// neo4jLabel converts a NodeType to a Neo4j-friendly label (PascalCase).
func neo4jLabel(t NodeType) string {
	switch t {
	case NodeTypeService:
		return "Service"
	case NodeTypeAPIEndpoint:
		return "ApiEndpoint"
	case NodeTypeTopic:
		return "Topic"
	case NodeTypeQueue:
		return "Queue"
	case NodeTypeDatabase:
		return "Database"
	case NodeTypeTable:
		return "Table"
	case NodeTypeExternal:
		return "External"
	case NodeTypeGRPCMethod:
		return "GrpcMethod"
	case NodeTypeWebSocket:
		return "WebSocket"
	case NodeTypeRedisKeyPattern:
		return "RedisKeyPattern"
	case NodeTypeJob:
		return "Job"
	case NodeTypeEnvironment:
		return "Environment"
	default:
		return "Node"
	}
}

// neo4jRelType converts an EdgeType to a Neo4j relationship type (UPPER_SNAKE_CASE).
func neo4jRelType(t EdgeType) string {
	return strings.ToUpper(string(t))
}

// mapKeys returns the keys of a map as a slice.
func mapKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// Ensure DefaultEngine implements Engine at compile time.
var _ Engine = (*DefaultEngine)(nil)
