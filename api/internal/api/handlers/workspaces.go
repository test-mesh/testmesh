package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WorkspaceHandler handles workspace-related requests
type WorkspaceHandler struct {
	repo   *repository.WorkspaceRepository
	logger *zap.Logger
}

// NewWorkspaceHandler creates a new workspace handler
func NewWorkspaceHandler(repo *repository.WorkspaceRepository, logger *zap.Logger) *WorkspaceHandler {
	return &WorkspaceHandler{
		repo:   repo,
		logger: logger,
	}
}

// CreateWorkspaceRequest represents a workspace creation request
type CreateWorkspaceRequest struct {
	Name        string                   `json:"name" binding:"required"`
	Description string                   `json:"description"`
	Type        models.WorkspaceType     `json:"type"`
	Settings    *models.WorkspaceSettings `json:"settings"`
}

// UpdateWorkspaceRequest represents a workspace update request
type UpdateWorkspaceRequest struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Settings    *models.WorkspaceSettings `json:"settings"`
}

// AddMemberRequest represents a request to add a member
type AddMemberRequest struct {
	UserID uuid.UUID           `json:"user_id"`
	Email  string              `json:"email" binding:"required"`
	Name   string              `json:"name"`
	Role   models.WorkspaceRole `json:"role" binding:"required"`
}

// UpdateMemberRequest represents a request to update a member
type UpdateMemberRequest struct {
	Role models.WorkspaceRole `json:"role" binding:"required"`
}

// InviteMemberRequest represents a request to invite a member
type InviteMemberRequest struct {
	Email string              `json:"email" binding:"required,email"`
	Role  models.WorkspaceRole `json:"role" binding:"required"`
}

// AcceptInvitationRequest represents a request to accept an invitation
type AcceptInvitationRequest struct {
	Token  string    `json:"token" binding:"required"`
	UserID uuid.UUID `json:"user_id" binding:"required"`
	Name   string    `json:"name"`
}

// Create handles POST /api/v1/workspaces
func (h *WorkspaceHandler) Create(c *gin.Context) {
	var req CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user ID from context (would come from auth middleware)
	userID := getUserIDFromContext(c)

	workspace := &models.Workspace{
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		OwnerID:     userID,
	}

	if req.Settings != nil {
		workspace.Settings = *req.Settings
	}

	if workspace.Type == "" {
		workspace.Type = models.WorkspaceTypeTeam
	}

	if err := h.repo.Create(workspace); err != nil {
		h.logger.Error("Failed to create workspace", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create workspace"})
		return
	}

	c.JSON(http.StatusCreated, workspace)
}

// Get handles GET /api/v1/workspaces/:id
func (h *WorkspaceHandler) Get(c *gin.Context) {
	idStr := c.Param("workspace_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	workspace, err := h.repo.GetByIDWithMembers(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	c.JSON(http.StatusOK, workspace)
}

// GetBySlug handles GET /api/v1/workspaces/slug/:slug
func (h *WorkspaceHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")

	workspace, err := h.repo.GetBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	c.JSON(http.StatusOK, workspace)
}

// List handles GET /api/v1/workspaces
func (h *WorkspaceHandler) List(c *gin.Context) {
	userID := getUserIDFromContext(c)

	params := &repository.ListWorkspacesParams{
		Type:   c.Query("type"),
		Search: c.Query("search"),
		SortBy: c.Query("sort_by"),
	}

	if c.Query("sort_desc") == "true" {
		params.SortDesc = true
	}

	if limit := c.Query("limit"); limit != "" {
		params.Limit = parseIntOrDefault(limit, 20)
	}
	if offset := c.Query("offset"); offset != "" {
		params.Offset = parseIntOrDefault(offset, 0)
	}

	workspaces, total, err := h.repo.List(userID, params)
	if err != nil {
		h.logger.Error("Failed to list workspaces", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list workspaces"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"workspaces": workspaces,
		"total":      total,
	})
}

// Update handles PUT /api/v1/workspaces/:id
func (h *WorkspaceHandler) Update(c *gin.Context) {
	idStr := c.Param("workspace_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var req UpdateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	workspace, err := h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	if req.Name != "" {
		workspace.Name = req.Name
	}
	if req.Description != "" {
		workspace.Description = req.Description
	}
	if req.Settings != nil {
		workspace.Settings = *req.Settings
	}

	if err := h.repo.Update(workspace); err != nil {
		h.logger.Error("Failed to update workspace", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update workspace"})
		return
	}

	c.JSON(http.StatusOK, workspace)
}

// Delete handles DELETE /api/v1/workspaces/:id
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	idStr := c.Param("workspace_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	// Check if it's a personal workspace (can't be deleted)
	workspace, err := h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	if workspace.Type == models.WorkspaceTypePersonal {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete personal workspace"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		h.logger.Error("Failed to delete workspace", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete workspace"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Workspace deleted"})
}

// GetPersonal handles GET /api/v1/workspaces/personal
func (h *WorkspaceHandler) GetPersonal(c *gin.Context) {
	userID := getUserIDFromContext(c)
	userName := c.Query("name")
	if userName == "" {
		userName = "User"
	}

	workspace, err := h.repo.GetPersonalWorkspace(userID, userName)
	if err != nil {
		h.logger.Error("Failed to get personal workspace", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get personal workspace"})
		return
	}

	c.JSON(http.StatusOK, workspace)
}

// Member operations

// ListMembers handles GET /api/v1/workspaces/:id/members
func (h *WorkspaceHandler) ListMembers(c *gin.Context) {
	idStr := c.Param("workspace_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	members, err := h.repo.ListMembers(id)
	if err != nil {
		h.logger.Error("Failed to list members", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list members"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"members": members})
}

// AddMember handles POST /api/v1/workspaces/:id/members
func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	idStr := c.Param("workspace_id")
	workspaceID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var req AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member := &models.WorkspaceMember{
		WorkspaceID: workspaceID,
		UserID:      req.UserID,
		Email:       req.Email,
		Name:        req.Name,
		Role:        req.Role,
	}

	if err := h.repo.AddMember(member); err != nil {
		h.logger.Error("Failed to add member", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add member"})
		return
	}

	c.JSON(http.StatusCreated, member)
}

// UpdateMember handles PUT /api/v1/workspaces/:id/members/:user_id
func (h *WorkspaceHandler) UpdateMember(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req UpdateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := h.repo.GetMember(workspaceID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Member not found"})
		return
	}

	member.Role = req.Role
	if err := h.repo.UpdateMember(member); err != nil {
		h.logger.Error("Failed to update member", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update member"})
		return
	}

	c.JSON(http.StatusOK, member)
}

// RemoveMember handles DELETE /api/v1/workspaces/:id/members/:user_id
func (h *WorkspaceHandler) RemoveMember(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.repo.RemoveMember(workspaceID, userID); err != nil {
		h.logger.Error("Failed to remove member", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove member"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Member removed"})
}

// Invitation operations

// InviteMember handles POST /api/v1/workspaces/:id/invitations
func (h *WorkspaceHandler) InviteMember(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var req InviteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := getUserIDFromContext(c)

	invitation := &models.WorkspaceInvitation{
		WorkspaceID: workspaceID,
		Email:       req.Email,
		Role:        req.Role,
		InvitedBy:   userID,
	}

	if err := h.repo.CreateInvitation(invitation); err != nil {
		h.logger.Error("Failed to create invitation", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invitation"})
		return
	}

	// In a real app, send invitation email here

	c.JSON(http.StatusCreated, invitation)
}

// ListInvitations handles GET /api/v1/workspaces/:id/invitations
func (h *WorkspaceHandler) ListInvitations(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	invitations, err := h.repo.ListInvitations(workspaceID)
	if err != nil {
		h.logger.Error("Failed to list invitations", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list invitations"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"invitations": invitations})
}

// RevokeInvitation handles DELETE /api/v1/workspaces/:id/invitations/:invitation_id
func (h *WorkspaceHandler) RevokeInvitation(c *gin.Context) {
	invitationID, err := uuid.Parse(c.Param("invitation_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invitation ID"})
		return
	}

	if err := h.repo.DeleteInvitation(invitationID); err != nil {
		h.logger.Error("Failed to revoke invitation", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke invitation"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Invitation revoked"})
}

// AcceptInvitation handles POST /api/v1/invitations/accept
func (h *WorkspaceHandler) AcceptInvitation(c *gin.Context) {
	var req AcceptInvitationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := h.repo.AcceptInvitation(req.Token, req.UserID, req.Name)
	if err != nil {
		h.logger.Error("Failed to accept invitation", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, member)
}

// GetUserRole handles GET /api/v1/workspaces/:id/role
func (h *WorkspaceHandler) GetUserRole(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	userID := getUserIDFromContext(c)

	role, err := h.repo.GetUserRole(workspaceID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not a member of this workspace"})
		return
	}

	// Get permissions for this role
	permissions := models.RolePermissions[role]

	c.JSON(http.StatusOK, gin.H{
		"role":        role,
		"permissions": permissions,
	})
}

// Helper to get user ID from context (placeholder - would come from auth middleware)
func getUserIDFromContext(c *gin.Context) uuid.UUID {
	// In a real app, this would extract the user ID from JWT or session
	userIDStr := c.GetHeader("X-User-ID")
	if userIDStr == "" {
		// Return a default/demo user ID
		return uuid.MustParse("00000000-0000-0000-0000-000000000001")
	}
	id, err := uuid.Parse(userIDStr)
	if err != nil {
		return uuid.MustParse("00000000-0000-0000-0000-000000000001")
	}
	return id
}

// Helper to parse int with default
func parseIntOrDefault(s string, def int) int {
	var n int
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil {
		return def
	}
	return n
}
