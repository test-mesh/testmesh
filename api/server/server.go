// Package server exposes a minimal public API so the cloud binary can embed
// the OSS engine without violating Go's internal package restriction.
package server

import (
	"github.com/gin-gonic/gin"
	ossapi "github.com/test-mesh/testmesh/internal/api"
	osswebsocket "github.com/test-mesh/testmesh/internal/api/websocket"
	ossdatabase "github.com/test-mesh/testmesh/internal/shared/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// NewRouter creates the OSS API router and its WebSocket hub.
// The returned engine listens for HTTP on the given port when served.
func NewRouter(db *gorm.DB, logger *zap.Logger, port int) *gin.Engine {
	hub := osswebsocket.NewHub(logger)
	go hub.Run()
	return ossapi.NewRouter(db, logger, hub, port)
}

// AutoMigrate runs OSS database schema migrations on db.
func AutoMigrate(db *gorm.DB) error {
	return ossdatabase.AutoMigrate(db)
}
