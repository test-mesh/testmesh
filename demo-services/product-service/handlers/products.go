package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"product-service/kafka"
	minioclient "product-service/minio"
	"product-service/models"
	redisclient "product-service/redis"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ProductHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
	minioClient   *minioclient.Client
	logger        *zap.Logger
}

func NewProductHandler(
	db *gorm.DB,
	redisClient *redisclient.Client,
	kafkaProducer *kafka.Producer,
	minioClient *minioclient.Client,
	logger *zap.Logger,
) *ProductHandler {
	return &ProductHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
		minioClient:   minioClient,
		logger:        logger,
	}
}

type CreateProductRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description string  `json:"description"`
	Price       float64 `json:"price" binding:"required,gt=0"`
	Inventory   int     `json:"inventory" binding:"gte=0"`
}

func (h *ProductHandler) CreateProduct(c *gin.Context) {
	var req CreateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	product := models.Product{
		Name:        req.Name,
		Description: req.Description,
		Price:       req.Price,
		Inventory:   req.Inventory,
	}

	if err := h.db.Create(&product).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create product"})
		return
	}

	// Cache product in Redis
	_ = h.redisClient.SetProduct(c.Request.Context(), product.ID, product)

	// Publish Kafka event
	_ = h.kafkaProducer.PublishProductCreated(c.Request.Context(), product.ID, product.Name, product.Price, product.Inventory)

	c.JSON(http.StatusCreated, product)
}

func (h *ProductHandler) GetProduct(c *gin.Context) {
	productID := c.Param("id")

	// Try to get from cache first
	cachedData, err := h.redisClient.GetProduct(c.Request.Context(), productID)
	if err == nil && cachedData != nil {
		var product models.Product
		if err := json.Unmarshal(cachedData, &product); err == nil {
			c.JSON(http.StatusOK, product)
			return
		}
	}

	// Get from database
	var product models.Product
	if err := h.db.First(&product, "id = ?", productID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get product"})
		return
	}

	// Cache for next time
	_ = h.redisClient.SetProduct(c.Request.Context(), product.ID, product)

	c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) ListProducts(c *gin.Context) {
	var products []models.Product

	if err := h.db.Find(&products).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list products"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"products": products})
}

type UpdateInventoryRequest struct {
	Inventory int `json:"inventory" binding:"required,gte=0"`
}

func (h *ProductHandler) UpdateInventory(c *gin.Context) {
	productID := c.Param("id")

	var req UpdateInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Acquire distributed lock
	ctx := c.Request.Context()
	acquired, err := h.redisClient.AcquireLock(ctx, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to acquire lock"})
		return
	}

	if !acquired {
		c.JSON(http.StatusConflict, gin.H{"error": "inventory is being updated by another process"})
		return
	}

	// Ensure lock is released
	defer h.redisClient.ReleaseLock(ctx, productID)

	// Small delay to simulate processing
	time.Sleep(100 * time.Millisecond)

	// Get current product
	var product models.Product
	if err := h.db.First(&product, "id = ?", productID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get product"})
		return
	}

	oldInventory := product.Inventory

	// Update inventory
	if err := h.db.Model(&product).Update("inventory", req.Inventory).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update inventory"})
		return
	}

	product.Inventory = req.Inventory

	// Invalidate cache
	_ = h.redisClient.DeleteProduct(ctx, productID)

	// Publish inventory change event
	_ = h.kafkaProducer.PublishInventoryChanged(ctx, productID, oldInventory, req.Inventory)

	c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) UploadImage(c *gin.Context) {
	productID := c.Param("id")

	// Verify product exists
	var product models.Product
	if err := h.db.First(&product, "id = ?", productID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if h.minioClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not available"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file required"})
		return
	}
	defer file.Close()

	const maxImageSize = 10 << 20 // 10 MB
	data, err := io.ReadAll(io.LimitReader(file, maxImageSize))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := h.minioClient.UploadImage(c.Request.Context(), productID, data, contentType); err != nil {
		h.logger.Error("failed to upload image", zap.String("product_id", productID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "image uploaded", "product_id": productID})
}

func (h *ProductHandler) GetImage(c *gin.Context) {
	productID := c.Param("id")

	if h.minioClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not available"})
		return
	}

	url, exists, err := h.minioClient.PresignedDownloadURL(c.Request.Context(), productID)
	if err != nil {
		h.logger.Error("failed to get presigned url", zap.String("product_id", productID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate download URL"})
		return
	}
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "no image for this product"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": url, "product_id": productID})
}
