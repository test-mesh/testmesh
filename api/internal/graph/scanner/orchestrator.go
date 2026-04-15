package scanner

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// Orchestrator coordinates scanners in dependency order and feeds results to the graph engine.
type Orchestrator struct {
	engine      graph.Engine
	mergeEngine *graph.MergeEngine
	merger      *CrossRepoMerger
	scanners    []Scanner
	logger      *zap.Logger
}

// NewOrchestrator creates a scanner orchestrator.
// Scanners should be provided in execution order (infra → spec → code → flow).
// If mergeEngine is nil, results are bulk-upserted directly without merge resolution.
func NewOrchestrator(engine graph.Engine, mergeEngine *graph.MergeEngine, merger *CrossRepoMerger, scanners []Scanner, logger *zap.Logger) *Orchestrator {
	return &Orchestrator{
		engine:      engine,
		mergeEngine: mergeEngine,
		merger:      merger,
		scanners:    scanners,
		logger:      logger,
	}
}

// RegisterScanner adds a scanner to the orchestrator.
func (o *Orchestrator) RegisterScanner(s Scanner) {
	o.scanners = append(o.scanners, s)
}

// RunFullScan executes all scanners in order and writes results to the graph.
func (o *Orchestrator) RunFullScan(ctx context.Context, input ScanInput) (*graph.GraphScan, error) {
	scan := &graph.GraphScan{
		WorkspaceID: input.WorkspaceID,
		RepoID:      &input.RepoID,
		Type:        "full",
		Status:      graph.ScanStatusRunning,
		StartedAt:   time.Now().UTC(),
	}

	if err := o.engine.CreateScan(ctx, scan); err != nil {
		return nil, fmt.Errorf("failed to create scan record: %w", err)
	}

	o.logger.Info("Starting full scan",
		zap.String("scan_id", scan.ID.String()),
		zap.String("workspace_id", input.WorkspaceID.String()),
		zap.String("repo_path", input.RepoPath),
	)

	combined := &ScannerOutput{}
	var layersScanned []string

	for _, s := range o.scanners {
		caps := s.Capabilities()

		o.logger.Info("Running scanner",
			zap.String("scanner", caps.Name),
			zap.String("layer", string(caps.Layer)),
		)

		output, err := s.Scan(ctx, input)
		if err != nil {
			warning := ScanWarning{
				Message: fmt.Sprintf("Scanner %s failed: %v", caps.Name, err),
				Level:   "error",
			}
			combined.Warnings = append(combined.Warnings, warning)
			o.logger.Error("Scanner failed",
				zap.String("scanner", caps.Name),
				zap.Error(err),
			)
			continue
		}

		if output != nil {
			o.logger.Info("Scanner completed",
				zap.String("scanner", caps.Name),
				zap.Int("nodes", len(output.Nodes)),
				zap.Int("edges", len(output.Edges)),
				zap.Int("warnings", len(output.Warnings)),
			)

			// Stamp workspace/repo/layer on all produced nodes and edges
			for i := range output.Nodes {
				output.Nodes[i].WorkspaceID = input.WorkspaceID
				output.Nodes[i].RepoID = &input.RepoID
				output.Nodes[i].SourceLayer = caps.Layer
				if output.Nodes[i].ID == uuid.Nil {
					output.Nodes[i].ID = uuid.New()
				}
			}
			for i := range output.Edges {
				output.Edges[i].WorkspaceID = input.WorkspaceID
				output.Edges[i].SourceLayer = caps.Layer
				if output.Edges[i].ID == uuid.Nil {
					output.Edges[i].ID = uuid.New()
				}
			}

			combined.Merge(output)
			layersScanned = append(layersScanned, caps.Name)
		}
	}

	// Write all discovered nodes and edges to the graph (with merge if available)
	nodesAdded, nodesUpdated, edgesAdded, err := o.writeResults(ctx, input.WorkspaceID, combined)
	if err != nil {
		o.finalizeScan(ctx, scan, graph.ScanStatusFailed, layersScanned, 0, 0, 0, combined)
		return scan, fmt.Errorf("failed to write scan results: %w", err)
	}

	o.finalizeScan(ctx, scan, graph.ScanStatusCompleted, layersScanned, nodesAdded, nodesUpdated, edgesAdded, combined)

	o.logger.Info("Full scan completed",
		zap.String("scan_id", scan.ID.String()),
		zap.Int("nodes_added", nodesAdded),
		zap.Int("nodes_updated", nodesUpdated),
		zap.Int("edges_added", edgesAdded),
		zap.Int("warnings", len(combined.Warnings)),
	)

	// Trigger cross-repo dependency merge in background
	if o.merger != nil {
		go o.merger.EnqueueForWorkspace(context.Background(), input.WorkspaceID, scan.ID)
	}

	return scan, nil
}

// RunIncrementalScan executes scanners for changed files only.
func (o *Orchestrator) RunIncrementalScan(ctx context.Context, input DiffInput) (*graph.GraphScan, error) {
	scan := &graph.GraphScan{
		WorkspaceID: input.WorkspaceID,
		RepoID:      &input.RepoID,
		Type:        "incremental",
		Status:      graph.ScanStatusRunning,
		StartedAt:   time.Now().UTC(),
	}

	if err := o.engine.CreateScan(ctx, scan); err != nil {
		return nil, fmt.Errorf("failed to create scan record: %w", err)
	}

	o.logger.Info("Starting incremental scan",
		zap.String("scan_id", scan.ID.String()),
		zap.Int("changed_files", len(input.ChangedFiles)),
	)

	combined := &ScannerOutput{}
	var layersScanned []string

	for _, s := range o.scanners {
		caps := s.Capabilities()

		// Check if any changed files match this scanner's patterns
		if !hasMatchingFiles(input.ChangedFiles, caps.FilePatterns) {
			continue
		}

		output, err := s.ScanDiff(ctx, input)
		if err != nil {
			combined.Warnings = append(combined.Warnings, ScanWarning{
				Message: fmt.Sprintf("Scanner %s failed on diff: %v", caps.Name, err),
				Level:   "error",
			})
			continue
		}

		if output != nil {
			for i := range output.Nodes {
				output.Nodes[i].WorkspaceID = input.WorkspaceID
				output.Nodes[i].RepoID = &input.RepoID
				output.Nodes[i].SourceLayer = caps.Layer
				if output.Nodes[i].ID == uuid.Nil {
					output.Nodes[i].ID = uuid.New()
				}
			}
			for i := range output.Edges {
				output.Edges[i].WorkspaceID = input.WorkspaceID
				output.Edges[i].SourceLayer = caps.Layer
				if output.Edges[i].ID == uuid.Nil {
					output.Edges[i].ID = uuid.New()
				}
			}
			combined.Merge(output)
			layersScanned = append(layersScanned, caps.Name)
		}
	}

	nodesAdded, nodesUpdated, edgesAdded, err := o.writeResults(ctx, input.WorkspaceID, combined)
	if err != nil {
		o.finalizeScan(ctx, scan, graph.ScanStatusFailed, layersScanned, 0, 0, 0, combined)
		return scan, err
	}

	o.finalizeScan(ctx, scan, graph.ScanStatusCompleted, layersScanned, nodesAdded, nodesUpdated, edgesAdded, combined)
	return scan, nil
}

// writeResults persists scanner output to the graph engine.
// When a merge engine is available, nodes go through identity resolution
// and property merging before being written. Otherwise, bulk upsert directly.
func (o *Orchestrator) writeResults(ctx context.Context, workspaceID uuid.UUID, output *ScannerOutput) (nodesAdded, nodesUpdated, edgesAdded int, err error) {
	if o.mergeEngine != nil {
		return o.writeResultsMerged(ctx, workspaceID, output)
	}

	// Direct bulk upsert (no merge)
	if len(output.Nodes) > 0 {
		if err := o.engine.BulkUpsertNodes(ctx, output.Nodes); err != nil {
			return 0, 0, 0, fmt.Errorf("bulk upsert nodes: %w", err)
		}
		nodesAdded = len(output.Nodes)
	}

	if len(output.Edges) > 0 {
		if err := o.engine.BulkUpsertEdges(ctx, output.Edges); err != nil {
			return nodesAdded, 0, 0, fmt.Errorf("bulk upsert edges: %w", err)
		}
		edgesAdded = len(output.Edges)
	}

	return nodesAdded, 0, edgesAdded, nil
}

// writeResultsMerged uses the merge engine for identity resolution and conflict detection.
func (o *Orchestrator) writeResultsMerged(ctx context.Context, workspaceID uuid.UUID, output *ScannerOutput) (nodesAdded, nodesUpdated, edgesAdded int, err error) {
	mergeResult, err := o.mergeEngine.MergeNodes(ctx, workspaceID, output.Nodes)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("merge nodes: %w", err)
	}

	if err := o.mergeEngine.MergeEdges(ctx, workspaceID, output.Edges, mergeResult.IDMapping); err != nil {
		return mergeResult.NodesCreated, mergeResult.NodesUpdated, 0, fmt.Errorf("merge edges: %w", err)
	}

	edgesAdded = len(output.Edges)

	if mergeResult.ConflictsFound > 0 {
		o.logger.Info("Merge conflicts detected",
			zap.Int("conflicts", mergeResult.ConflictsFound),
		)
	}

	return mergeResult.NodesCreated, mergeResult.NodesUpdated, edgesAdded, nil
}

// finalizeScan updates the scan record with results.
func (o *Orchestrator) finalizeScan(
	ctx context.Context,
	scan *graph.GraphScan,
	status graph.ScanStatus,
	layers []string,
	nodesAdded, nodesUpdated, edgesAdded int,
	output *ScannerOutput,
) {
	now := time.Now().UTC()
	durationMs := int(now.Sub(scan.StartedAt).Milliseconds())

	scan.Status = status
	scan.LayersScanned = graph.StringArray(layers)
	scan.NodesAdded = nodesAdded
	scan.NodesUpdated = nodesUpdated
	scan.EdgesAdded = edgesAdded
	scan.CompletedAt = &now
	scan.DurationMs = &durationMs

	// Convert warnings to JSON array
	warnings := make(graph.JSONArray, len(output.Warnings))
	for i, w := range output.Warnings {
		warnings[i] = map[string]any{
			"file":    w.File,
			"line":    w.Line,
			"message": w.Message,
			"level":   w.Level,
		}
	}
	scan.Warnings = warnings
	scan.Conflicts = 0

	if err := o.engine.UpdateScan(ctx, scan); err != nil {
		o.logger.Error("Failed to update scan record", zap.Error(err))
	}
}

// hasMatchingFiles checks if any changed files match the scanner's file patterns.
func hasMatchingFiles(changedFiles []string, patterns []string) bool {
	if len(patterns) == 0 {
		return true // Scanner accepts all files
	}
	for _, file := range changedFiles {
		for _, pattern := range patterns {
			if matchGlob(file, pattern) {
				return true
			}
		}
	}
	return false
}

// matchGlob performs simple glob matching (supports * and **).
func matchGlob(path, pattern string) bool {
	// Simple glob matching for common patterns
	// For production, consider using doublestar or filepath.Match
	if pattern == "**" || pattern == "*" {
		return true
	}

	// Handle suffix patterns like "*.yaml"
	if len(pattern) > 1 && pattern[0] == '*' && pattern[1] == '.' {
		ext := pattern[1:] // ".yaml"
		return len(path) > len(ext) && path[len(path)-len(ext):] == ext
	}

	// Handle prefix patterns like "*.go"
	if len(pattern) > 0 && pattern[0] == '*' {
		suffix := pattern[1:]
		return len(path) >= len(suffix) && path[len(path)-len(suffix):] == suffix
	}

	return path == pattern
}
