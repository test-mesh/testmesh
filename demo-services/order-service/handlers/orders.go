package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"order-service/clients"
	"order-service/graph"
	"order-service/kafka"
	"order-service/models"
	redisclient "order-service/redis"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type OrderHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
	userClient    *clients.UserClient
	productClient *clients.ProductClient
	graphClient   *graph.Client
	logger        *zap.Logger
}

func NewOrderHandler(
	db *gorm.DB,
	redisClient *redisclient.Client,
	kafkaProducer *kafka.Producer,
	userClient *clients.UserClient,
	productClient *clients.ProductClient,
	graphClient *graph.Client,
	logger *zap.Logger,
) *OrderHandler {
	return &OrderHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
		userClient:    userClient,
		productClient: productClient,
		graphClient:   graphClient,
		logger:        logger,
	}
}

type CreateOrderRequest struct {
	UserID string `json:"user_id" binding:"required"`
	Items  []struct {
		ProductID string `json:"product_id" binding:"required"`
		Quantity  int    `json:"quantity" binding:"required,gt=0"`
	} `json:"items" binding:"required,min=1"`
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify user exists via User Service
	user, err := h.userClient.GetUser(c.Request.Context(), req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("user verification failed: %v", err)})
		return
	}

	// Create order
	order := models.Order{
		UserID: user.ID,
		Items:  []models.OrderItem{},
		Total:  0,
		Status: "pending",
	}

	// Process each item
	var kafkaItems []kafka.OrderItem
	for _, item := range req.Items {
		// Get product details from Product Service
		product, err := h.productClient.GetProduct(c.Request.Context(), item.ProductID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("product %s verification failed: %v", item.ProductID, err)})
			return
		}

		// Check inventory
		if product.Inventory < item.Quantity {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("insufficient inventory for product %s: available=%d, requested=%d",
					product.Name, product.Inventory, item.Quantity),
			})
			return
		}

		itemPrice := product.Price * float64(item.Quantity)
		orderItem := models.OrderItem{
			ProductID: product.ID,
			Quantity:  item.Quantity,
			Price:     itemPrice,
		}

		order.Items = append(order.Items, orderItem)
		order.Total += itemPrice

		kafkaItems = append(kafkaItems, kafka.OrderItem{
			ProductID: product.ID,
			Quantity:  item.Quantity,
			Price:     itemPrice,
		})
	}

	// Save order to database
	if err := h.db.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}

	// Load items for response (GORM doesn't auto-load them)
	if err := h.db.Preload("Items").First(&order, "id = ?", order.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load order"})
		return
	}

	// Cache order in Redis
	_ = h.redisClient.SetOrder(c.Request.Context(), order.ID, order)

	// Publish Kafka event
	_ = h.kafkaProducer.PublishOrderPlaced(c.Request.Context(), order.ID, order.UserID, kafkaItems, order.Total)

	// Write PURCHASED graph edges to Neo4j (non-blocking, best-effort)
	if h.graphClient != nil {
		var productIDs []string
		for _, item := range order.Items {
			productIDs = append(productIDs, item.ProductID)
		}
		go func() {
			if err := h.graphClient.CreatePurchasedEdges(context.Background(), order.ID, order.UserID, productIDs); err != nil {
				h.logger.Warn("failed to write graph edges", zap.String("order_id", order.ID), zap.Error(err))
			}
		}()
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
	orderID := c.Param("id")

	// Try to get from cache first
	cachedData, err := h.redisClient.GetOrder(c.Request.Context(), orderID)
	if err == nil && cachedData != nil {
		var order models.Order
		if err := json.Unmarshal(cachedData, &order); err == nil {
			c.JSON(http.StatusOK, order)
			return
		}
	}

	// Get from database
	var order models.Order
	if err := h.db.Preload("Items").First(&order, "id = ?", orderID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get order"})
		return
	}

	// Cache for next time
	_ = h.redisClient.SetOrder(c.Request.Context(), order.ID, order)

	c.JSON(http.StatusOK, order)
}

func (h *OrderHandler) ListOrders(c *gin.Context) {
	userID := c.Query("user_id")

	query := h.db.Preload("Items")
	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	var orders []models.Order
	if err := query.Find(&orders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list orders"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (h *OrderHandler) GetUserPurchaseGraph(c *gin.Context) {
	userID := c.Param("user_id")
	if h.graphClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "graph client not available"})
		return
	}
	nodes, edges, err := h.graphClient.GetUserPurchaseGraph(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("graph query failed: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "edges": edges})
}
