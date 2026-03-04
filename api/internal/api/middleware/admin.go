package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireAdmin middleware restricts access to admin users only
// TODO: This is a simplified implementation. In production, this should:
// 1. Check the user's authentication token
// 2. Query the user's admin status from the database
// 3. Validate proper authentication before checking admin status
//
// For now, this checks for an X-Admin header or X-User-ID matching a known admin UUID
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check for X-Admin header (development mode)
		isAdmin := c.GetHeader("X-Admin") == "true"

		// Check if user ID matches the default admin user (from migrations)
		if !isAdmin {
			userID := c.GetHeader("X-User-ID")
			// Default admin user ID from database migrations
			isAdmin = userID == "00000000-0000-0000-0000-000000000001"
		}

		if !isAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Admin access required",
			})
			return
		}

		c.Set("is_admin", true)
		c.Next()
	}
}

// IsAdmin checks if the current user is an admin
func IsAdmin(c *gin.Context) bool {
	if isAdmin, exists := c.Get("is_admin"); exists {
		return isAdmin.(bool)
	}
	return false
}
