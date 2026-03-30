package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"notification-service/database"
	"notification-service/handlers"
	"notification-service/kafka"
	serviceMetrics "notification-service/metrics"
	serviceOtel "notification-service/otel"
	"notification-service/redis"

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

	redisClient, err := redis.NewClient()
	if err != nil {
		logger.Fatal("failed to connect to redis", zap.Error(err))
	}
	defer redisClient.Close()

	shutdownTracer, err := serviceOtel.InitTracer("notification-service")
	if err != nil {
		logger.Warn("failed to init tracer", zap.Error(err))
	} else {
		defer shutdownTracer(context.Background())
	}

	kafkaConsumer, err := kafka.NewConsumer(db)
	if err != nil {
		logger.Fatal("failed to create kafka consumer", zap.Error(err))
	}
	defer kafkaConsumer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	kafkaConsumer.Start(ctx)

	notificationHandler := handlers.NewNotificationHandler(db, redisClient)

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(serviceOtel.Middleware("notification-service"))
	router.Use(serviceMetrics.Middleware("notification-service"))

	router.GET("/health", func(c *gin.Context) {
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "database": "down"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "notification-service", "database": "up"})
	})
	router.GET("/metrics", serviceMetrics.Handler())

	api := router.Group("/api/v1")
	{
		api.GET("/notifications/:user_id", notificationHandler.GetNotifications)
		api.GET("/notifications/:user_id/unread", notificationHandler.GetUnreadNotifications)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "5004"
	}
	srv := &http.Server{Addr: fmt.Sprintf(":%s", port), Handler: router}

	go func() {
		logger.Info("notification-service starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down")
	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
}
