package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
)

// WorkspaceScope middleware ensures the user has access to the workspace
// and sets workspace context for downstream handlers
func WorkspaceScope(workspaceRepo *repository.WorkspaceRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceIDStr := c.Param("workspace_id")
		if workspaceIDStr == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
			return
		}

		workspaceID, err := uuid.Parse(workspaceIDStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id format"})
			return
		}

		// Verify workspace exists
		workspace, err := workspaceRepo.GetByID(workspaceID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
			return
		}

		// Get user ID from context (set by auth middleware)
		// For now, we'll use a header or default since auth isn't fully implemented
		userIDStr := c.GetHeader("X-User-ID")
		if userIDStr == "" {
			// Default user for development - in production, this would come from auth
			userIDStr = workspace.OwnerID.String()
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid user_id format"})
			return
		}

		// Verify user has access to workspace
		role, err := workspaceRepo.GetUserRole(workspaceID, userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "access denied to workspace"})
			return
		}

		// Set workspace context for downstream handlers
		c.Set("workspace_id", workspaceID)
		c.Set("workspace", workspace)
		c.Set("workspace_role", role)
		c.Set("user_id", userID)

		c.Next()
	}
}

// GetWorkspaceID extracts the workspace ID from the Gin context
func GetWorkspaceID(c *gin.Context) uuid.UUID {
	if id, exists := c.Get("workspace_id"); exists {
		return id.(uuid.UUID)
	}
	return uuid.Nil
}

// GetWorkspace extracts the workspace from the Gin context
func GetWorkspace(c *gin.Context) *models.Workspace {
	if ws, exists := c.Get("workspace"); exists {
		return ws.(*models.Workspace)
	}
	return nil
}

// GetWorkspaceRole extracts the user's workspace role from the Gin context
func GetWorkspaceRole(c *gin.Context) models.WorkspaceRole {
	if role, exists := c.Get("workspace_role"); exists {
		return role.(models.WorkspaceRole)
	}
	return ""
}

// GetUserID extracts the user ID from the Gin context
func GetUserID(c *gin.Context) uuid.UUID {
	if id, exists := c.Get("user_id"); exists {
		return id.(uuid.UUID)
	}
	return uuid.Nil
}

// RequirePermission middleware checks if the user has a specific permission
func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetWorkspaceRole(c)
		if role == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "no workspace role"})
			return
		}

		if !models.HasPermission(role, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":      "insufficient permissions",
				"required":   permission,
				"your_role":  role,
			})
			return
		}

		c.Next()
	}
}
