package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// BulkHandler handles bulk operations
type BulkHandler struct {
	flowRepo       *repository.FlowRepository
	collectionRepo *repository.CollectionRepository
	logger         *zap.Logger
}

// NewBulkHandler creates a new bulk handler
func NewBulkHandler(flowRepo *repository.FlowRepository, collectionRepo *repository.CollectionRepository, logger *zap.Logger) *BulkHandler {
	return &BulkHandler{
		flowRepo:       flowRepo,
		collectionRepo: collectionRepo,
		logger:         logger,
	}
}

// BulkTagRequest represents a request to add/remove tags from multiple flows
type BulkTagRequest struct {
	FlowIDs []string `json:"flow_ids" binding:"required"`
	Tags    []string `json:"tags" binding:"required"`
}

// BulkMoveRequest represents a request to move flows to a collection
type BulkMoveRequest struct {
	FlowIDs      []string `json:"flow_ids" binding:"required"`
	CollectionID string   `json:"collection_id"` // Empty string means remove from collection
}

// BulkDeleteRequest represents a request to delete multiple flows
type BulkDeleteRequest struct {
	FlowIDs []string `json:"flow_ids" binding:"required"`
}

// BulkUpdateRequest represents a request to update multiple flows
type BulkUpdateRequest struct {
	FlowIDs []string               `json:"flow_ids" binding:"required"`
	Updates map[string]interface{} `json:"updates" binding:"required"`
}

// FindReplaceRequest represents a find and replace request
type FindReplaceRequest struct {
	FlowIDs   []string `json:"flow_ids"` // Empty means all flows
	Find      string   `json:"find" binding:"required"`
	Replace   string   `json:"replace"`
	MatchCase bool     `json:"match_case"`
	WholeWord bool     `json:"whole_word"`
	InField   string   `json:"in_field"` // "name", "description", "yaml", or empty for all
	Preview   bool     `json:"preview"`  // If true, just preview matches
}

// BulkResult represents the result of a bulk operation
type BulkResult struct {
	Total     int      `json:"total"`
	Succeeded int      `json:"succeeded"`
	Failed    int      `json:"failed"`
	Errors    []string `json:"errors,omitempty"`
}

// AddTags handles POST /api/v1/workspaces/:workspace_id/bulk/flows/tags/add
func (h *BulkHandler) AddTags(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := BulkResult{Total: len(req.FlowIDs)}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Invalid ID: "+idStr)
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Flow not found: "+idStr)
			continue
		}

		// Add tags (avoiding duplicates)
		tagMap := make(map[string]bool)
		for _, t := range flow.Tags {
			tagMap[t] = true
		}
		for _, t := range req.Tags {
			tagMap[t] = true
		}
		newTags := make([]string, 0, len(tagMap))
		for t := range tagMap {
			newTags = append(newTags, t)
		}
		flow.Tags = newTags

		if err := h.flowRepo.Update(flow, workspaceID); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Failed to update: "+idStr)
			continue
		}

		result.Succeeded++
	}

	c.JSON(http.StatusOK, result)
}

// RemoveTags handles POST /api/v1/workspaces/:workspace_id/bulk/flows/tags/remove
func (h *BulkHandler) RemoveTags(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := BulkResult{Total: len(req.FlowIDs)}
	removeSet := make(map[string]bool)
	for _, t := range req.Tags {
		removeSet[t] = true
	}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Invalid ID: "+idStr)
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Flow not found: "+idStr)
			continue
		}

		// Remove specified tags
		newTags := make([]string, 0)
		for _, t := range flow.Tags {
			if !removeSet[t] {
				newTags = append(newTags, t)
			}
		}
		flow.Tags = newTags

		if err := h.flowRepo.Update(flow, workspaceID); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Failed to update: "+idStr)
			continue
		}

		result.Succeeded++
	}

	c.JSON(http.StatusOK, result)
}

// Move handles POST /api/v1/workspaces/:workspace_id/bulk/flows/move
func (h *BulkHandler) Move(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkMoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var collectionID *uuid.UUID
	if req.CollectionID != "" {
		id, err := uuid.Parse(req.CollectionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
			return
		}
		// Verify collection exists in workspace
		if _, err := h.collectionRepo.GetByID(id, workspaceID); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
			return
		}
		collectionID = &id
	}

	result := BulkResult{Total: len(req.FlowIDs)}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Invalid ID: "+idStr)
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Flow not found: "+idStr)
			continue
		}

		flow.CollectionID = collectionID

		if err := h.flowRepo.Update(flow, workspaceID); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Failed to update: "+idStr)
			continue
		}

		result.Succeeded++
	}

	c.JSON(http.StatusOK, result)
}

// Delete handles POST /api/v1/workspaces/:workspace_id/bulk/flows/delete
func (h *BulkHandler) Delete(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := BulkResult{Total: len(req.FlowIDs)}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Invalid ID: "+idStr)
			continue
		}

		if err := h.flowRepo.Delete(id, workspaceID); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Failed to delete: "+idStr)
			continue
		}

		result.Succeeded++
	}

	c.JSON(http.StatusOK, result)
}

// Duplicate handles POST /api/v1/workspaces/:workspace_id/bulk/flows/duplicate
func (h *BulkHandler) Duplicate(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkDeleteRequest // Same structure - just needs flow IDs
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := BulkResult{Total: len(req.FlowIDs)}
	var newFlows []interface{}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Invalid ID: "+idStr)
			continue
		}

		original, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Flow not found: "+idStr)
			continue
		}

		// Create duplicate
		duplicate := *original
		duplicate.ID = uuid.Nil // Let DB generate new ID
		duplicate.Name = original.Name + " (Copy)"

		if err := h.flowRepo.Create(&duplicate, workspaceID); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, "Failed to duplicate: "+idStr)
			continue
		}

		result.Succeeded++
		newFlows = append(newFlows, gin.H{
			"original_id": idStr,
			"new_id":      duplicate.ID.String(),
			"name":        duplicate.Name,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"result":    result,
		"new_flows": newFlows,
	})
}

// Export handles POST /api/v1/workspaces/:workspace_id/bulk/flows/export
func (h *BulkHandler) Export(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req BulkDeleteRequest // Same structure
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var flows []interface{}

	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}

		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			continue
		}

		flows = append(flows, gin.H{
			"id":          flow.ID,
			"name":        flow.Name,
			"description": flow.Description,
			"tags":        flow.Tags,
			"suite":       flow.Suite,
			"definition":  flow.Definition,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"version": "1.0",
		"flows":   flows,
		"count":   len(flows),
	})
}

// FindReplaceMatch represents a match found during find/replace
type FindReplaceMatch struct {
	FlowID    string `json:"flow_id"`
	FlowName  string `json:"flow_name"`
	Field     string `json:"field"`
	Line      int    `json:"line,omitempty"`
	Context   string `json:"context"`
	MatchText string `json:"match_text"`
}

// FindReplace handles POST /api/v1/workspaces/:workspace_id/bulk/flows/find-replace
func (h *BulkHandler) FindReplace(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req FindReplaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get flows to search
	var flowIDs []uuid.UUID
	if len(req.FlowIDs) == 0 {
		// Search all flows in workspace
		flows, _, _ := h.flowRepo.List(workspaceID, "", nil, 1000, 0)
		for _, f := range flows {
			flowIDs = append(flowIDs, f.ID)
		}
	} else {
		for _, idStr := range req.FlowIDs {
			if id, err := uuid.Parse(idStr); err == nil {
				flowIDs = append(flowIDs, id)
			}
		}
	}

	var matches []FindReplaceMatch
	result := BulkResult{Total: len(flowIDs)}

	for _, id := range flowIDs {
		flow, err := h.flowRepo.GetByID(id, workspaceID)
		if err != nil {
			continue
		}

		found := false

		// Serialize definition for searching
		definitionJSON, _ := json.Marshal(flow.Definition)

		// Search in specified fields
		searchFields := []struct {
			name  string
			value string
		}{
			{"name", flow.Name},
			{"description", flow.Description},
			{"definition", string(definitionJSON)},
		}

		for _, sf := range searchFields {
			if req.InField != "" && req.InField != sf.name {
				continue
			}

			// Simple string search (could be enhanced with regex)
			if containsMatch(sf.value, req.Find, req.MatchCase, req.WholeWord) {
				matches = append(matches, FindReplaceMatch{
					FlowID:    id.String(),
					FlowName:  flow.Name,
					Field:     sf.name,
					MatchText: req.Find,
					Context:   getContext(sf.value, req.Find, 50),
				})
				found = true

				// Apply replacement if not preview mode
				if !req.Preview && req.Replace != "" {
					switch sf.name {
					case "name":
						flow.Name = replaceString(flow.Name, req.Find, req.Replace, req.MatchCase)
					case "description":
						flow.Description = replaceString(flow.Description, req.Find, req.Replace, req.MatchCase)
					// Note: definition replacement is complex since it's structured,
					// only name and description support replace for now
					}
				}
			}
		}

		if found && !req.Preview {
			if err := h.flowRepo.Update(flow, workspaceID); err != nil {
				result.Failed++
			} else {
				result.Succeeded++
			}
		} else if found {
			result.Succeeded++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"matches": matches,
		"result":  result,
		"preview": req.Preview,
	})
}

// Helper functions

func containsMatch(text, find string, matchCase, wholeWord bool) bool {
	if !matchCase {
		text = strings.ToLower(text)
		find = strings.ToLower(find)
	}
	if wholeWord {
		// Simple word boundary check
		return strings.Contains(" "+text+" ", " "+find+" ")
	}
	return strings.Contains(text, find)
}

func replaceString(text, find, replace string, matchCase bool) string {
	if matchCase {
		return strings.ReplaceAll(text, find, replace)
	}
	// Case-insensitive replacement (simple approach)
	lower := strings.ToLower(text)
	lowerFind := strings.ToLower(find)

	result := ""
	start := 0
	for {
		idx := strings.Index(lower[start:], lowerFind)
		if idx == -1 {
			result += text[start:]
			break
		}
		result += text[start : start+idx]
		result += replace
		start = start + idx + len(find)
	}
	return result
}

func getContext(text, find string, contextLen int) string {
	lowerText := strings.ToLower(text)
	lowerFind := strings.ToLower(find)

	idx := strings.Index(lowerText, lowerFind)
	if idx == -1 {
		return ""
	}

	start := idx - contextLen
	if start < 0 {
		start = 0
	}
	end := idx + len(find) + contextLen
	if end > len(text) {
		end = len(text)
	}

	prefix := ""
	suffix := ""
	if start > 0 {
		prefix = "..."
	}
	if end < len(text) {
		suffix = "..."
	}

	return prefix + text[start:end] + suffix
}
