package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"user-service/database"
	"user-service/handlers"
	"user-service/kafka"
	serviceMetrics "user-service/metrics"
	serviceOtel "user-service/otel"
	"user-service/redis"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
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
	logger.Info("database migrations completed")

	shutdown, err := serviceOtel.InitTracer("user-service")
	if err != nil {
		logger.Warn("failed to init tracer", zap.Error(err))
	} else {
		defer shutdown(context.Background())
	}

	redisClient, err := redis.NewClient()
	if err != nil {
		logger.Fatal("failed to connect to redis", zap.Error(err))
	}
	defer redisClient.Close()

	kafkaProducer, err := kafka.NewProducer()
	if err != nil {
		logger.Fatal("failed to create kafka producer", zap.Error(err))
	}
	defer kafkaProducer.Close()

	userHandler := handlers.NewUserHandler(db, redisClient, kafkaProducer)
	authHandler := handlers.NewAuthHandler(db, redisClient, kafkaProducer)

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(serviceOtel.Middleware("user-service"))
	router.Use(serviceMetrics.Middleware("user-service"))

	router.GET("/health", func(c *gin.Context) {
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "database": "down"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "user-service", "database": "up"})
	})
	router.GET("/metrics", serviceMetrics.Handler())

	api := router.Group("/api/v1")
	{
		api.POST("/users", userHandler.CreateUser)
		api.GET("/users/:id", userHandler.GetUser)
		api.GET("/users", userHandler.ListUsers)
		api.POST("/auth/login", authHandler.Login)
		api.GET("/auth/verify", authHandler.VerifySession)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "5001"
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", port),
		Handler: router,
	}

	go func() {
		logger.Info("user-service starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
