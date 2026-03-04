package repository

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceRepository handles workspace database operations
type WorkspaceRepository struct {
	db *gorm.DB
}

// NewWorkspaceRepository creates a new workspace repository
func NewWorkspaceRepository(db *gorm.DB) *WorkspaceRepository {
	return &WorkspaceRepository{db: db}
}

// Create creates a new workspace
func (r *WorkspaceRepository) Create(workspace *models.Workspace) error {
	// Generate slug if not provided
	if workspace.Slug == "" {
		workspace.Slug = generateSlug(workspace.Name)
	}

	// Ensure unique slug
	baseSlug := workspace.Slug
	counter := 1
	for {
		existing, err := r.GetBySlug(workspace.Slug)
		if err != nil || existing == nil {
			break
		}
		workspace.Slug = fmt.Sprintf("%s-%d", baseSlug, counter)
		counter++
	}

	return r.db.Create(workspace).Error
}

// GetByID retrieves a workspace by ID
func (r *WorkspaceRepository) GetByID(id uuid.UUID) (*models.Workspace, error) {
	var workspace models.Workspace
	if err := r.db.First(&workspace, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &workspace, nil
}

// GetBySlug retrieves a workspace by slug
func (r *WorkspaceRepository) GetBySlug(slug string) (*models.Workspace, error) {
	var workspace models.Workspace
	if err := r.db.First(&workspace, "slug = ?", slug).Error; err != nil {
		return nil, err
	}
	return &workspace, nil
}

// GetByIDWithMembers retrieves a workspace with its members
func (r *WorkspaceRepository) GetByIDWithMembers(id uuid.UUID) (*models.Workspace, error) {
	var workspace models.Workspace
	if err := r.db.Preload("Members").First(&workspace, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &workspace, nil
}

// Update updates a workspace
func (r *WorkspaceRepository) Update(workspace *models.Workspace) error {
	return r.db.Save(workspace).Error
}

// Delete soft-deletes a workspace
func (r *WorkspaceRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.Workspace{}, "id = ?", id).Error
}

// List retrieves workspaces with pagination and filtering
func (r *WorkspaceRepository) List(userID uuid.UUID, params *ListWorkspacesParams) ([]*models.Workspace, int64, error) {
	var workspaces []*models.Workspace
	var total int64

	query := r.db.Model(&models.Workspace{}).
		Joins("LEFT JOIN workspace_members ON workspaces.id = workspace_members.workspace_id").
		Where("workspaces.owner_id = ? OR workspace_members.user_id = ?", userID, userID).
		Group("workspaces.id")

	if params.Type != "" {
		query = query.Where("workspaces.type = ?", params.Type)
	}

	if params.Search != "" {
		search := "%" + params.Search + "%"
		query = query.Where("workspaces.name ILIKE ? OR workspaces.description ILIKE ?", search, search)
	}

	// Count total before pagination
	countQuery := r.db.Model(&models.Workspace{}).
		Joins("LEFT JOIN workspace_members ON workspaces.id = workspace_members.workspace_id").
		Where("workspaces.owner_id = ? OR workspace_members.user_id = ?", userID, userID).
		Group("workspaces.id")
	if params.Type != "" {
		countQuery = countQuery.Where("workspaces.type = ?", params.Type)
	}
	if params.Search != "" {
		search := "%" + params.Search + "%"
		countQuery = countQuery.Where("workspaces.name ILIKE ? OR workspaces.description ILIKE ?", search, search)
	}
	countQuery.Count(&total)

	// Apply sorting
	if params.SortBy != "" {
		order := "ASC"
		if params.SortDesc {
			order = "DESC"
		}
		query = query.Order(fmt.Sprintf("workspaces.%s %s", params.SortBy, order))
	} else {
		query = query.Order("workspaces.created_at DESC")
	}

	// Apply pagination
	if params.Limit > 0 {
		query = query.Limit(params.Limit)
	}
	if params.Offset > 0 {
		query = query.Offset(params.Offset)
	}

	if err := query.Find(&workspaces).Error; err != nil {
		return nil, 0, err
	}

	return workspaces, total, nil
}

// ListWorkspacesParams contains parameters for listing workspaces
type ListWorkspacesParams struct {
	Type     string
	Search   string
	SortBy   string
	SortDesc bool
	Limit    int
	Offset   int
}

// GetUserRole returns the user's role in a workspace
func (r *WorkspaceRepository) GetUserRole(workspaceID, userID uuid.UUID) (models.WorkspaceRole, error) {
	// Check if owner
	var workspace models.Workspace
	if err := r.db.First(&workspace, "id = ?", workspaceID).Error; err != nil {
		return "", err
	}
	if workspace.OwnerID == userID {
		return models.WorkspaceRoleOwner, nil
	}

	// Check membership
	var member models.WorkspaceMember
	if err := r.db.First(&member, "workspace_id = ? AND user_id = ?", workspaceID, userID).Error; err != nil {
		return "", err
	}
	return member.Role, nil
}

// Member operations

// AddMember adds a user as a member of a workspace
func (r *WorkspaceRepository) AddMember(member *models.WorkspaceMember) error {
	now := time.Now()
	member.JoinedAt = &now
	return r.db.Create(member).Error
}

// GetMember retrieves a workspace member
func (r *WorkspaceRepository) GetMember(workspaceID, userID uuid.UUID) (*models.WorkspaceMember, error) {
	var member models.WorkspaceMember
	if err := r.db.First(&member, "workspace_id = ? AND user_id = ?", workspaceID, userID).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

// UpdateMember updates a workspace member
func (r *WorkspaceRepository) UpdateMember(member *models.WorkspaceMember) error {
	return r.db.Save(member).Error
}

// RemoveMember removes a user from a workspace
func (r *WorkspaceRepository) RemoveMember(workspaceID, userID uuid.UUID) error {
	return r.db.Delete(&models.WorkspaceMember{}, "workspace_id = ? AND user_id = ?", workspaceID, userID).Error
}

// ListMembers retrieves all members of a workspace
func (r *WorkspaceRepository) ListMembers(workspaceID uuid.UUID) ([]*models.WorkspaceMember, error) {
	var members []*models.WorkspaceMember
	if err := r.db.Where("workspace_id = ?", workspaceID).Order("created_at").Find(&members).Error; err != nil {
		return nil, err
	}
	return members, nil
}

// Invitation operations

// CreateInvitation creates a new invitation
func (r *WorkspaceRepository) CreateInvitation(invitation *models.WorkspaceInvitation) error {
	// Generate token
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return err
	}
	invitation.Token = hex.EncodeToString(token)

	// Set expiration (7 days)
	invitation.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)

	return r.db.Create(invitation).Error
}

// GetInvitationByToken retrieves an invitation by token
func (r *WorkspaceRepository) GetInvitationByToken(token string) (*models.WorkspaceInvitation, error) {
	var invitation models.WorkspaceInvitation
	if err := r.db.Preload("Workspace").First(&invitation, "token = ?", token).Error; err != nil {
		return nil, err
	}
	return &invitation, nil
}

// GetInvitationByEmail retrieves an invitation by workspace and email
func (r *WorkspaceRepository) GetInvitationByEmail(workspaceID uuid.UUID, email string) (*models.WorkspaceInvitation, error) {
	var invitation models.WorkspaceInvitation
	if err := r.db.First(&invitation, "workspace_id = ? AND email = ?", workspaceID, email).Error; err != nil {
		return nil, err
	}
	return &invitation, nil
}

// DeleteInvitation deletes an invitation
func (r *WorkspaceRepository) DeleteInvitation(id uuid.UUID) error {
	return r.db.Delete(&models.WorkspaceInvitation{}, "id = ?", id).Error
}

// ListInvitations retrieves all pending invitations for a workspace
func (r *WorkspaceRepository) ListInvitations(workspaceID uuid.UUID) ([]*models.WorkspaceInvitation, error) {
	var invitations []*models.WorkspaceInvitation
	if err := r.db.Where("workspace_id = ? AND expires_at > ?", workspaceID, time.Now()).
		Order("created_at DESC").Find(&invitations).Error; err != nil {
		return nil, err
	}
	return invitations, nil
}

// AcceptInvitation accepts an invitation and creates membership
func (r *WorkspaceRepository) AcceptInvitation(token string, userID uuid.UUID, name string) (*models.WorkspaceMember, error) {
	invitation, err := r.GetInvitationByToken(token)
	if err != nil {
		return nil, err
	}

	if time.Now().After(invitation.ExpiresAt) {
		return nil, fmt.Errorf("invitation has expired")
	}

	// Check if already a member
	existing, _ := r.GetMember(invitation.WorkspaceID, userID)
	if existing != nil {
		// Already a member, just delete the invitation
		r.DeleteInvitation(invitation.ID)
		return existing, nil
	}

	// Create membership
	now := time.Now()
	member := &models.WorkspaceMember{
		WorkspaceID: invitation.WorkspaceID,
		UserID:      userID,
		Email:       invitation.Email,
		Name:        name,
		Role:        invitation.Role,
		InvitedBy:   &invitation.InvitedBy,
		InvitedAt:   &invitation.CreatedAt,
		JoinedAt:    &now,
	}

	if err := r.AddMember(member); err != nil {
		return nil, err
	}

	// Delete the invitation
	r.DeleteInvitation(invitation.ID)

	return member, nil
}

// GetPersonalWorkspace retrieves or creates a user's personal workspace
func (r *WorkspaceRepository) GetPersonalWorkspace(userID uuid.UUID, userName string) (*models.Workspace, error) {
	var workspace models.Workspace
	err := r.db.First(&workspace, "owner_id = ? AND type = ?", userID, models.WorkspaceTypePersonal).Error
	if err == nil {
		return &workspace, nil
	}

	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// Create personal workspace
	workspace = models.Workspace{
		Name:        fmt.Sprintf("%s's Workspace", userName),
		Slug:        generateSlug(userName + "-workspace"),
		Description: "Personal workspace",
		Type:        models.WorkspaceTypePersonal,
		OwnerID:     userID,
	}

	if err := r.Create(&workspace); err != nil {
		return nil, err
	}

	return &workspace, nil
}

// Helper to generate URL-friendly slug
func generateSlug(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)

	// Replace spaces and special characters with hyphens
	reg := regexp.MustCompile(`[^a-z0-9]+`)
	slug = reg.ReplaceAllString(slug, "-")

	// Remove leading/trailing hyphens
	slug = strings.Trim(slug, "-")

	return slug
}
