package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// HTTPHandler wraps GRPCHandler to expose REST fallback endpoints.
type HTTPHandler struct {
	grpc *GRPCHandler
}

func NewHTTPHandler(grpc *GRPCHandler) *HTTPHandler {
	return &HTTPHandler{grpc: grpc}
}

func (h *HTTPHandler) GetRecommendations(c *gin.Context) {
	userID := c.Param("user_id")
	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	ids, err := h.grpc.graphClient.GetRecommendationsForUser(c.Request.Context(), userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if ids == nil {
		ids = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"user_id": userID, "product_ids": ids})
}
