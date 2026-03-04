package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/api"
	"github.com/georgi-georgiev/testmesh/internal/api/websocket"
	"github.com/georgi-georgiev/testmesh/internal/shared/config"
	"github.com/georgi-georgiev/testmesh/internal/shared/database"
	"github.com/georgi-georgiev/testmesh/internal/shared/logger"
	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	log := logger.New()
	defer log.Sync()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load configuration", zap.Error(err))
	}

	// Initialize database
	db, err := database.New(cfg.Database)
	if err != nil {
		log.Fatal("Failed to initialize database", zap.Error(err))
	}

	// Auto-migrate database schemas
	if err := database.AutoMigrate(db); err != nil {
		log.Fatal("Failed to auto-migrate database", zap.Error(err))
	}

	// Initialize WebSocket hub
	wsHub := websocket.NewHub(log)
	go wsHub.Run()

	// Initialize API server
	router := api.NewRouter(db, log, wsHub, cfg.Server.Port)

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Start server in a goroutine
	go func() {
		log.Info("Starting TestMesh API server",
			zap.Int("port", cfg.Server.Port),
			zap.String("environment", cfg.Environment),
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown", zap.Error(err))
	}

	log.Info("Server exited")
}
