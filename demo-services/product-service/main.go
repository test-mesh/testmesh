package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"product-service/database"
	"product-service/handlers"
	"product-service/kafka"
	"product-service/redis"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize database
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, _ := db.DB()
	defer sqlDB.Close()

	// Run migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	log.Println("Database migrations completed successfully")

	// Initialize Redis client
	redisClient, err := redis.NewClient()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	log.Println("Connected to Redis successfully")

	// Initialize Kafka producer
	kafkaProducer, err := kafka.NewProducer()
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}
	defer kafkaProducer.Close()

	log.Println("Kafka producer initialized successfully")

	// Initialize Kafka consumer
	kafkaConsumer, err := kafka.NewConsumer(db)
	if err != nil {
		log.Fatalf("Failed to create Kafka consumer: %v", err)
	}
	defer kafkaConsumer.Close()

	// Start consuming messages
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kafkaConsumer.Start(ctx)
	log.Println("Kafka consumer started successfully")

	// Initialize handlers
	productHandler := handlers.NewProductHandler(db, redisClient, kafkaProducer)

	// Setup router
	router := gin.Default()

	// Health check
	router.GET("/health", func(c *gin.Context) {
		// Check database connection
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":   "unhealthy",
				"database": "down",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   "healthy",
			"service":  "product-service",
			"database": "up",
		})
	})

	// Product routes
	api := router.Group("/api/v1")
	{
		api.POST("/products", productHandler.CreateProduct)
		api.GET("/products/:id", productHandler.GetProduct)
		api.GET("/products", productHandler.ListProducts)
		api.PUT("/products/:id/inventory", productHandler.UpdateInventory)
	}

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "5002"
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", port),
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Product Service starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Cancel context for Kafka consumer
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
