package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"recommendation-service/database"
	"recommendation-service/graph"
	"recommendation-service/handlers"
	"recommendation-service/kafka"
	serviceOtel "recommendation-service/otel"
	pb "recommendation-service/proto"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	db, err := database.InitDB()
	if err != nil {
		logger.Fatal("failed to connect to database", zap.Error(err))
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()

	if err := database.RunMigrations(db); err != nil {
		logger.Fatal("failed to run migrations", zap.Error(err))
	}

	shutdownTracer, err := serviceOtel.InitTracer("recommendation-service")
	if err != nil {
		logger.Warn("failed to init tracer", zap.Error(err))
	} else {
		defer shutdownTracer(context.Background())
	}

	graphClient, err := graph.NewClient()
	if err != nil {
		logger.Fatal("failed to connect to neo4j", zap.Error(err))
	}
	defer graphClient.Close(context.Background())

	kafkaConsumer, err := kafka.NewConsumer(graphClient, logger)
	if err != nil {
		logger.Warn("kafka unavailable, consumer disabled", zap.Error(err))
	} else {
		defer kafkaConsumer.Close()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		kafkaConsumer.Start(ctx)
	}

	grpcHandler := handlers.NewGRPCHandler(graphClient)
	httpHandler := handlers.NewHTTPHandler(grpcHandler)

	// gRPC server on port 5005
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "5005"
	}
	grpcServer := grpc.NewServer()
	pb.RegisterRecommendationServiceServer(grpcServer, grpcHandler)

	go func() {
		lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
		if err != nil {
			logger.Fatal("failed to listen for gRPC", zap.Error(err))
		}
		logger.Info("recommendation-service gRPC starting", zap.String("port", grpcPort))
		if err := grpcServer.Serve(lis); err != nil {
			logger.Error("gRPC server error", zap.Error(err))
		}
	}()

	// HTTP server on port 5006
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(serviceOtel.Middleware("recommendation-service"))

	router.GET("/health", func(c *gin.Context) {
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "recommendation-service"})
	})

	api := router.Group("/api/v1")
	{
		api.GET("/recommendations/:user_id", httpHandler.GetRecommendations)
	}

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "5006"
	}
	srv := &http.Server{Addr: fmt.Sprintf(":%s", httpPort), Handler: router}

	go func() {
		logger.Info("recommendation-service HTTP starting", zap.String("port", httpPort))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down recommendation-service")
	grpcServer.GracefulStop()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Warn("HTTP server shutdown error", zap.Error(err))
	}
}
