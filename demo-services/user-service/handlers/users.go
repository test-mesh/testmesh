package handlers

import (
	"encoding/json"
	"net/http"
	"user-service/kafka"
	"user-service/models"
	redisclient "user-service/redis"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UserHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
}

func NewUserHandler(db *gorm.DB, redisClient *redisclient.Client, kafkaProducer *kafka.Producer) *UserHandler {
	return &UserHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
	}
}

type CreateUserRequest struct {
	Email string `json:"email" binding:"required,email"`
	Name  string `json:"name" binding:"required"`
}

func (h *UserHandler) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if user already exists
	var existingUser models.User
	if err := h.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user with this email already exists"})
		return
	}

	user := models.User{
		Email: req.Email,
		Name:  req.Name,
	}

	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	// Cache user in Redis
	_ = h.redisClient.SetUser(c.Request.Context(), user.ID, user)

	// Publish Kafka event
	_ = h.kafkaProducer.PublishUserCreated(c.Request.Context(), user.ID, user.Email, user.Name)

	c.JSON(http.StatusCreated, user)
}

func (h *UserHandler) GetUser(c *gin.Context) {
	userID := c.Param("id")

	// Try to get from cache first
	cachedData, err := h.redisClient.GetUser(c.Request.Context(), userID)
	if err == nil && cachedData != nil {
		var user models.User
		if err := json.Unmarshal(cachedData, &user); err == nil {
			c.JSON(http.StatusOK, user)
			return
		}
	}

	// Get from database
	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
		return
	}

	// Cache for next time
	_ = h.redisClient.SetUser(c.Request.Context(), user.ID, user)

	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) ListUsers(c *gin.Context) {
	var users []models.User

	if err := h.db.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}
