package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/test-mesh/testmesh/internal/api"
	"github.com/test-mesh/testmesh/internal/api/websocket"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/shared/config"
	"github.com/test-mesh/testmesh/internal/shared/database"
	"github.com/test-mesh/testmesh/internal/shared/logger"
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

	// Initialize graph engine
	var graphEngine graph.Engine
	if cfg.Graph.Enabled {
		neo4jClient, err := database.NewNeo4j(cfg.Neo4j, log)
		if err != nil {
			log.Warn("Failed to connect to Neo4j — graph traversal disabled", zap.Error(err))
		}
		if neo4jClient != nil {
			if err := neo4jClient.EnsureConstraints(context.Background()); err != nil {
				log.Warn("Failed to ensure Neo4j constraints", zap.Error(err))
			}
			defer neo4jClient.Close(context.Background())
		}

		engine := graph.NewEngine(db, neo4jClient, log)

		// Wrap with Redis cache if Redis is configured
		rdb := redis.NewClient(&redis.Options{
			Addr:     fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port),
			Password: cfg.Redis.Password,
			DB:       cfg.Redis.DB,
		})
		if err := rdb.Ping(context.Background()).Err(); err != nil {
			log.Warn("Redis not available for graph cache", zap.Error(err))
			graphEngine = engine
		} else {
			graphEngine = graph.NewCachedEngine(engine, rdb, log)
		}

		log.Info("Graph engine initialized",
			zap.Bool("neo4j_available", engine.IsAvailable()),
			zap.String("embedding_provider", cfg.Graph.EmbeddingProvider),
		)
	} else {
		graphEngine = graph.NewNoopEngine()
		log.Info("Graph features disabled")
	}
	// Initialize WebSocket hub
	wsHub := websocket.NewHub(log)
	go wsHub.Run()

	// Initialize API server
	router := api.NewRouter(db, cfg, log, wsHub, cfg.Server.Port, graphEngine)

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
