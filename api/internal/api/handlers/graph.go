package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/graph"
	graphrepo "github.com/test-mesh/testmesh/internal/graph/repo"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"go.uber.org/zap"
)

// GraphHandler handles all /graph/* API endpoints.
type GraphHandler struct {
	engine       graph.Engine
	orchestrator *scanner.Orchestrator
	repoManager  *graphrepo.Manager
	logger       *zap.Logger
}

// NewGraphHandler creates a new graph handler.
func NewGraphHandler(engine graph.Engine, orchestrator *scanner.Orchestrator, repoManager *graphrepo.Manager, logger *zap.Logger) *GraphHandler {
	return &GraphHandler{
		engine:       engine,
		orchestrator: orchestrator,
		repoManager:  repoManager,
		logger:       logger,
	}
}

// encryptCredentialsForStorage encrypts pat and/or sshKey into a JSONMap
// suitable for storing in GraphRepo.Credentials.
// Returns nil if both are empty (no credentials to store).
// Returns an error if credentials are provided but the encryption key is unavailable.
func encryptCredentialsForStorage(pat, sshKey string) (*graph.JSONMap, error) {
	if pat == "" && sshKey == "" {
		return nil, nil
	}
	key, err := graphrepo.CredentialsKeyFromEnv()
	if err != nil {
		return nil, fmt.Errorf("credentials encryption key not available: %w", err)
	}
	creds := graph.JSONMap{}
	if pat != "" {
		encrypted, err := graphrepo.Encrypt(pat, key)
		if err != nil {
			return nil, fmt.Errorf("encrypt PAT: %w", err)
		}
		creds["pat"] = encrypted
	}
	if sshKey != "" {
		encrypted, err := graphrepo.Encrypt(sshKey, key)
		if err != nil {
			return nil, fmt.Errorf("encrypt SSH key: %w", err)
		}
		creds["ssh_key"] = encrypted
	}
	return &creds, nil
}

// --- Graph Management ---

// TriggerScan handles POST /graph/scan
func (h *GraphHandler) TriggerScan(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		RepoID   string `json:"repo_id" binding:"required"`
		RepoPath string `json:"repo_path"` // For CLI-initiated local scans
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoID, err := uuid.Parse(req.RepoID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
		return
	}

	var repoPath string
	if req.RepoPath != "" {
		// CLI scan mode — local path provided
		repoPath = req.RepoPath
	} else {
		// Clone mode — prepare from repo record
		graphRepo, err := h.engine.GetRepo(c.Request.Context(), repoID, workspaceID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "repo not found"})
			return
		}
		info, err := h.repoManager.PrepareRepo(c.Request.Context(), graphRepo)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare repo: " + err.Error()})
			return
		}
		defer h.repoManager.Cleanup(info)
		repoPath = info.LocalPath
	}

	input := scanner.ScanInput{
		RepoPath:    repoPath,
		RepoID:      repoID,
		WorkspaceID: workspaceID,
		Config:      scanner.ScannerConfig{},
	}

	scan, err := h.orchestrator.RunFullScan(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, scan)
}

// GetGraphStatus handles GET /graph/status
func (h *GraphHandler) GetGraphStatus(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	stats, err := h.engine.GetGraphStats(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// ClearGraph handles DELETE /graph
func (h *GraphHandler) ClearGraph(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	if err := h.engine.ClearWorkspaceGraph(c.Request.Context(), workspaceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "cleared"})
}

// --- Repo Endpoints ---

// CreateRepo handles POST /graph/repos
func (h *GraphHandler) CreateRepo(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		Name       string        `json:"name"`
		URL        string        `json:"url"`
		Branch     string        `json:"branch"`
		ScanConfig graph.JSONMap `json:"scan_config"`
		PAT        string        `json:"pat"`
		SSHKey     string        `json:"ssh_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newRepo := graph.GraphRepo{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		URL:         req.URL,
		Branch:      req.Branch,
		ScanConfig:  req.ScanConfig,
	}

	if req.PAT != "" || req.SSHKey != "" {
		creds, err := encryptCredentialsForStorage(req.PAT, req.SSHKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials: " + err.Error()})
			return
		}
		if creds != nil {
			newRepo.Credentials = *creds
		}
	}

	if err := h.engine.CreateRepo(c.Request.Context(), &newRepo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, newRepo)
}

// ListRepos handles GET /graph/repos
func (h *GraphHandler) ListRepos(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	repos, err := h.engine.ListRepos(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"repos": repos, "total": len(repos)})
}

// UpdateRepo handles PUT /graph/repos/:repo_id
func (h *GraphHandler) UpdateRepo(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	repoID, err := uuid.Parse(c.Param("repo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
		return
	}

	existing, err := h.engine.GetRepo(c.Request.Context(), repoID, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repo not found"})
		return
	}

	var req struct {
		Name       string        `json:"name"`
		URL        string        `json:"url"`
		Branch     string        `json:"branch"`
		ScanConfig graph.JSONMap `json:"scan_config"`
		PAT        string        `json:"pat"`
		SSHKey     string        `json:"ssh_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existing.Name = req.Name
	existing.URL = req.URL
	existing.Branch = req.Branch
	existing.ScanConfig = req.ScanConfig
	existing.WorkspaceID = workspaceID
	existing.ID = repoID

	if req.PAT != "" || req.SSHKey != "" {
		creds, err := encryptCredentialsForStorage(req.PAT, req.SSHKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials: " + err.Error()})
			return
		}
		if creds != nil {
			if existing.Credentials == nil {
				existing.Credentials = graph.JSONMap{}
			}
			for k, v := range *creds {
				existing.Credentials[k] = v
			}
		}
	}

	if err := h.engine.UpdateRepo(c.Request.Context(), existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

// DeleteRepo handles DELETE /graph/repos/:repo_id
func (h *GraphHandler) DeleteRepo(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	repoID, err := uuid.Parse(c.Param("repo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
		return
	}

	if err := h.engine.DeleteRepo(c.Request.Context(), repoID, workspaceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// TriggerRepoScan handles POST /graph/repos/:repo_id/scan
func (h *GraphHandler) TriggerRepoScan(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	repoID, err := uuid.Parse(c.Param("repo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
		return
	}

	graphRepo, err := h.engine.GetRepo(c.Request.Context(), repoID, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repo not found"})
		return
	}

	repoInfo, err := h.repoManager.PrepareRepo(c.Request.Context(), graphRepo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare repo: " + err.Error()})
		return
	}
	defer h.repoManager.Cleanup(repoInfo)

	input := scanner.ScanInput{
		RepoPath:    repoInfo.LocalPath,
		RepoID:      repoInfo.ID,
		WorkspaceID: workspaceID,
		Config:      scanner.ScannerConfig{},
	}

	scan, err := h.orchestrator.RunFullScan(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, scan)
}

// --- Node Endpoints ---

// ListNodes handles GET /graph/nodes
func (h *GraphHandler) ListNodes(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	filter := graph.NodeFilter{
		WorkspaceID: workspaceID,
		Service:     c.Query("service"),
		Search:      c.Query("search"),
	}

	if t := c.Query("type"); t != "" {
		filter.Types = []graph.NodeType{graph.NodeType(t)}
	}
	if sl := c.Query("source_layer"); sl != "" {
		filter.SourceLayer = graph.SourceLayer(sl)
	}
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil {
		filter.Limit = l
	}
	if o, err := strconv.Atoi(c.DefaultQuery("offset", "0")); err == nil {
		filter.Offset = o
	}

	nodes, total, err := h.engine.FindNodes(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "total": total})
}

// GetNode handles GET /graph/nodes/:node_id
func (h *GraphHandler) GetNode(c *gin.Context) {
	nodeID, err := uuid.Parse(c.Param("node_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node_id"})
		return
	}

	node, err := h.engine.GetNode(c.Request.Context(), nodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}

	// Also fetch edges
	edges, _ := h.engine.GetEdgesForNode(c.Request.Context(), nodeID, "both")

	c.JSON(http.StatusOK, gin.H{"node": node, "edges": edges})
}

// GetNodeDependencies handles GET /graph/nodes/:node_id/dependencies
func (h *GraphHandler) GetNodeDependencies(c *gin.Context) {
	nodeID, err := uuid.Parse(c.Param("node_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node_id"})
		return
	}

	depth, _ := strconv.Atoi(c.DefaultQuery("depth", "3"))

	subgraph, err := h.engine.GetDependencies(c.Request.Context(), nodeID, depth)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, subgraph)
}

// GetNodeDependents handles GET /graph/nodes/:node_id/dependents
func (h *GraphHandler) GetNodeDependents(c *gin.Context) {
	nodeID, err := uuid.Parse(c.Param("node_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node_id"})
		return
	}

	depth, _ := strconv.Atoi(c.DefaultQuery("depth", "3"))

	subgraph, err := h.engine.GetDependents(c.Request.Context(), nodeID, depth)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, subgraph)
}

// FindPaths handles GET /graph/paths?from=&to=
func (h *GraphHandler) FindPaths(c *gin.Context) {
	fromID, err := uuid.Parse(c.Query("from"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid 'from' node_id"})
		return
	}
	toID, err := uuid.Parse(c.Query("to"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid 'to' node_id"})
		return
	}

	paths, err := h.engine.FindPaths(c.Request.Context(), fromID, toID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"paths": paths})
}

// SearchNodes handles POST /graph/search
func (h *GraphHandler) SearchNodes(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		Query string `json:"query" binding:"required"`
		Limit int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	nodes, err := h.engine.SearchNodes(c.Request.Context(), workspaceID, req.Query, req.Limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "total": len(nodes)})
}

// --- Coverage & Contracts ---

// GetCoverage handles GET /graph/coverage
func (h *GraphHandler) GetCoverage(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	uncovered, err := h.engine.GetUncoveredNodes(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	stats, _ := h.engine.GetGraphStats(c.Request.Context(), workspaceID)

	c.JSON(http.StatusOK, gin.H{
		"uncovered_nodes":  uncovered,
		"uncovered_count":  len(uncovered),
		"coverage_percent": stats.CoveragePercent,
	})
}

// GetContracts handles GET /graph/contracts
func (h *GraphHandler) GetContracts(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	contracts, err := h.engine.GetContracts(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"contracts": contracts, "total": len(contracts)})
}

// GetConflicts handles GET /graph/conflicts
func (h *GraphHandler) GetConflicts(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	conflicts, err := h.engine.GetMergeConflicts(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"conflicts": conflicts, "total": len(conflicts)})
}

// ResolveConflict handles POST /graph/conflicts/:id/resolve
func (h *GraphHandler) ResolveConflict(c *gin.Context) {
	conflictID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conflict id"})
		return
	}

	var req struct {
		Resolution string `json:"resolution" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.engine.ResolveConflict(c.Request.Context(), conflictID, graph.ConflictResolution(req.Resolution)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}

// GetStats handles GET /graph/stats
func (h *GraphHandler) GetStats(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	stats, err := h.engine.GetGraphStats(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}
