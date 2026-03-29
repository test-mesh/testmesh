package handlers

import (
	"net/http"
	"user-service/kafka"
	"user-service/models"
	redisclient "user-service/redis"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
}

func NewAuthHandler(db *gorm.DB, redisClient *redisclient.Client, kafkaProducer *kafka.Producer) *AuthHandler {
	return &AuthHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
	}
}

type LoginRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type LoginResponse struct {
	Token  string       `json:"token"`
	User   models.User  `json:"user"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to authenticate"})
		return
	}

	// Generate session token
	token := uuid.New().String()

	// Store session in Redis
	if err := h.redisClient.SetSession(c.Request.Context(), token, user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	// Publish login event
	_ = h.kafkaProducer.PublishUserLogin(c.Request.Context(), user.ID, user.Email)

	c.JSON(http.StatusOK, LoginResponse{
		Token: token,
		User:  user,
	})
}

type VerifyResponse struct {
	Valid  bool   `json:"valid"`
	UserID string `json:"user_id,omitempty"`
}

func (h *AuthHandler) VerifySession(c *gin.Context) {
	token := c.GetHeader("Authorization")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no authorization token provided"})
		return
	}

	userID, err := h.redisClient.GetSession(c.Request.Context(), token)
	if err != nil || userID == "" {
		c.JSON(http.StatusOK, VerifyResponse{Valid: false})
		return
	}

	c.JSON(http.StatusOK, VerifyResponse{
		Valid:  true,
		UserID: userID,
	})
}
