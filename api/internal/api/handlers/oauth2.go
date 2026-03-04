package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/auth"
	"go.uber.org/zap"
)

// OAuth2Handler handles OAuth 2.0 related requests
type OAuth2Handler struct {
	oauth2Service *auth.OAuth2Service
	logger        *zap.Logger
}

// NewOAuth2Handler creates a new OAuth2 handler
func NewOAuth2Handler(oauth2Service *auth.OAuth2Service, logger *zap.Logger) *OAuth2Handler {
	return &OAuth2Handler{
		oauth2Service: oauth2Service,
		logger:        logger,
	}
}

// GetAuthURLRequest represents a request to get the authorization URL
type GetAuthURLRequest struct {
	GrantType    string `json:"grant_type" binding:"required"`
	ClientID     string `json:"client_id" binding:"required"`
	ClientSecret string `json:"client_secret"`
	AuthURL      string `json:"auth_url"`
	TokenURL     string `json:"token_url" binding:"required"`
	RedirectURI  string `json:"redirect_uri"`
	Scope        string `json:"scope"`
	State        string `json:"state"`
}

// ExchangeCodeRequest represents a request to exchange an authorization code
type ExchangeCodeRequest struct {
	Code         string `json:"code" binding:"required"`
	ClientID     string `json:"client_id" binding:"required"`
	ClientSecret string `json:"client_secret"`
	TokenURL     string `json:"token_url" binding:"required"`
	RedirectURI  string `json:"redirect_uri"`
}

// ClientCredentialsRequest represents a request for client credentials flow
type ClientCredentialsRequest struct {
	ClientID     string `json:"client_id" binding:"required"`
	ClientSecret string `json:"client_secret" binding:"required"`
	TokenURL     string `json:"token_url" binding:"required"`
	Scope        string `json:"scope"`
}

// PasswordGrantRequest represents a request for password grant flow
type PasswordGrantRequest struct {
	ClientID     string `json:"client_id" binding:"required"`
	ClientSecret string `json:"client_secret"`
	TokenURL     string `json:"token_url" binding:"required"`
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password" binding:"required"`
	Scope        string `json:"scope"`
}

// RefreshTokenRequest represents a request to refresh a token
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
	ClientID     string `json:"client_id" binding:"required"`
	ClientSecret string `json:"client_secret"`
	TokenURL     string `json:"token_url" binding:"required"`
}

// GetProviders handles GET /api/v1/oauth2/providers
func (h *OAuth2Handler) GetProviders(c *gin.Context) {
	providers := h.oauth2Service.GetProviders()

	// Convert to list
	list := make([]map[string]interface{}, 0, len(providers))
	for id, provider := range providers {
		list = append(list, map[string]interface{}{
			"id":       id,
			"name":     provider.Name,
			"auth_url": provider.AuthURL,
			"token_url": provider.TokenURL,
			"user_info_url": provider.UserInfoURL,
			"scopes":   provider.Scopes,
			"docs_url": provider.DocumentsURL,
		})
	}

	c.JSON(http.StatusOK, gin.H{"providers": list})
}

// GetProvider handles GET /api/v1/oauth2/providers/:name
func (h *OAuth2Handler) GetProvider(c *gin.Context) {
	name := c.Param("name")

	provider, ok := h.oauth2Service.GetProvider(name)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       name,
		"name":     provider.Name,
		"auth_url": provider.AuthURL,
		"token_url": provider.TokenURL,
		"user_info_url": provider.UserInfoURL,
		"scopes":   provider.Scopes,
		"docs_url": provider.DocumentsURL,
	})
}

// GetAuthorizationURL handles POST /api/v1/oauth2/auth-url
func (h *OAuth2Handler) GetAuthorizationURL(c *gin.Context) {
	var req GetAuthURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := &auth.OAuth2Config{
		GrantType:    auth.OAuth2GrantType(req.GrantType),
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		AuthURL:      req.AuthURL,
		TokenURL:     req.TokenURL,
		RedirectURI:  req.RedirectURI,
		Scope:        req.Scope,
		State:        req.State,
	}

	authURL, err := h.oauth2Service.GetAuthorizationURL(config)
	if err != nil {
		h.logger.Error("Failed to generate auth URL", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"authorization_url": authURL})
}

// ExchangeCode handles POST /api/v1/oauth2/token/code
func (h *OAuth2Handler) ExchangeCode(c *gin.Context) {
	var req ExchangeCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := &auth.OAuth2Config{
		GrantType:    auth.GrantTypeAuthorizationCode,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		TokenURL:     req.TokenURL,
		RedirectURI:  req.RedirectURI,
	}

	token, err := h.oauth2Service.ExchangeAuthorizationCode(c.Request.Context(), config, req.Code)
	if err != nil {
		h.logger.Error("Failed to exchange code", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  token.AccessToken,
		"token_type":    token.TokenType,
		"expires_in":    token.ExpiresIn,
		"expires_at":    token.ExpiresAt,
		"refresh_token": token.RefreshToken,
		"scope":         token.Scope,
	})
}

// ClientCredentials handles POST /api/v1/oauth2/token/client-credentials
func (h *OAuth2Handler) ClientCredentials(c *gin.Context) {
	var req ClientCredentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := &auth.OAuth2Config{
		GrantType:    auth.GrantTypeClientCredentials,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		TokenURL:     req.TokenURL,
		Scope:        req.Scope,
	}

	token, err := h.oauth2Service.GetClientCredentialsToken(c.Request.Context(), config)
	if err != nil {
		h.logger.Error("Failed to get client credentials token", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": token.AccessToken,
		"token_type":   token.TokenType,
		"expires_in":   token.ExpiresIn,
		"expires_at":   token.ExpiresAt,
		"scope":        token.Scope,
	})
}

// PasswordGrant handles POST /api/v1/oauth2/token/password
func (h *OAuth2Handler) PasswordGrant(c *gin.Context) {
	var req PasswordGrantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := &auth.OAuth2Config{
		GrantType:    auth.GrantTypePassword,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		TokenURL:     req.TokenURL,
		Scope:        req.Scope,
	}

	token, err := h.oauth2Service.GetPasswordToken(c.Request.Context(), config, req.Username, req.Password)
	if err != nil {
		h.logger.Error("Failed to get password grant token", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  token.AccessToken,
		"token_type":    token.TokenType,
		"expires_in":    token.ExpiresIn,
		"expires_at":    token.ExpiresAt,
		"refresh_token": token.RefreshToken,
		"scope":         token.Scope,
	})
}

// RefreshToken handles POST /api/v1/oauth2/token/refresh
func (h *OAuth2Handler) RefreshToken(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := &auth.OAuth2Config{
		GrantType:    auth.GrantTypeRefreshToken,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		TokenURL:     req.TokenURL,
	}

	token, err := h.oauth2Service.RefreshToken(c.Request.Context(), config, req.RefreshToken)
	if err != nil {
		h.logger.Error("Failed to refresh token", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  token.AccessToken,
		"token_type":    token.TokenType,
		"expires_in":    token.ExpiresIn,
		"expires_at":    token.ExpiresAt,
		"refresh_token": token.RefreshToken,
		"scope":         token.Scope,
	})
}
