package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"
)

// OAuth2GrantType represents the OAuth 2.0 grant type
type OAuth2GrantType string

const (
	GrantTypeAuthorizationCode OAuth2GrantType = "authorization_code"
	GrantTypeClientCredentials OAuth2GrantType = "client_credentials"
	GrantTypePassword          OAuth2GrantType = "password"
	GrantTypeRefreshToken      OAuth2GrantType = "refresh_token"
)

// OAuth2Config holds the configuration for an OAuth 2.0 flow
type OAuth2Config struct {
	GrantType    OAuth2GrantType `json:"grant_type"`
	ClientID     string          `json:"client_id"`
	ClientSecret string          `json:"client_secret,omitempty"`
	AuthURL      string          `json:"auth_url,omitempty"`
	TokenURL     string          `json:"token_url"`
	RedirectURI  string          `json:"redirect_uri,omitempty"`
	Scope        string          `json:"scope,omitempty"`
	State        string          `json:"state,omitempty"`
}

// OAuth2Token represents an OAuth 2.0 token response
type OAuth2Token struct {
	AccessToken  string    `json:"access_token"`
	TokenType    string    `json:"token_type"`
	ExpiresIn    int       `json:"expires_in,omitempty"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	Scope        string    `json:"scope,omitempty"`
	ExpiresAt    time.Time `json:"expires_at,omitempty"`
}

// OAuth2Error represents an OAuth 2.0 error response
type OAuth2Error struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorURI         string `json:"error_uri,omitempty"`
}

// OAuth2Provider represents a pre-configured OAuth 2.0 provider
type OAuth2Provider struct {
	Name         string `json:"name"`
	AuthURL      string `json:"auth_url"`
	TokenURL     string `json:"token_url"`
	UserInfoURL  string `json:"user_info_url,omitempty"`
	Scopes       string `json:"scopes,omitempty"`
	LogoURL      string `json:"logo_url,omitempty"`
	DocumentsURL string `json:"docs_url,omitempty"`
}

// Pre-configured OAuth 2.0 providers
var KnownProviders = map[string]OAuth2Provider{
	"google": {
		Name:         "Google",
		AuthURL:      "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:     "https://oauth2.googleapis.com/token",
		UserInfoURL:  "https://www.googleapis.com/oauth2/v3/userinfo",
		Scopes:       "openid email profile",
		DocumentsURL: "https://developers.google.com/identity/protocols/oauth2",
	},
	"github": {
		Name:         "GitHub",
		AuthURL:      "https://github.com/login/oauth/authorize",
		TokenURL:     "https://github.com/login/oauth/access_token",
		UserInfoURL:  "https://api.github.com/user",
		Scopes:       "user:email",
		DocumentsURL: "https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps",
	},
	"auth0": {
		Name:         "Auth0",
		AuthURL:      "https://{domain}/authorize",
		TokenURL:     "https://{domain}/oauth/token",
		UserInfoURL:  "https://{domain}/userinfo",
		Scopes:       "openid profile email",
		DocumentsURL: "https://auth0.com/docs/get-started/authentication-and-authorization-flow",
	},
	"okta": {
		Name:         "Okta",
		AuthURL:      "https://{domain}/oauth2/v1/authorize",
		TokenURL:     "https://{domain}/oauth2/v1/token",
		UserInfoURL:  "https://{domain}/oauth2/v1/userinfo",
		Scopes:       "openid profile email",
		DocumentsURL: "https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/",
	},
	"azure": {
		Name:         "Azure AD",
		AuthURL:      "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
		TokenURL:     "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
		UserInfoURL:  "https://graph.microsoft.com/oidc/userinfo",
		Scopes:       "openid profile email User.Read",
		DocumentsURL: "https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow",
	},
	"keycloak": {
		Name:         "Keycloak",
		AuthURL:      "https://{host}/realms/{realm}/protocol/openid-connect/auth",
		TokenURL:     "https://{host}/realms/{realm}/protocol/openid-connect/token",
		UserInfoURL:  "https://{host}/realms/{realm}/protocol/openid-connect/userinfo",
		Scopes:       "openid profile email",
		DocumentsURL: "https://www.keycloak.org/docs/latest/securing_apps/",
	},
}

// OAuth2Service handles OAuth 2.0 authentication
type OAuth2Service struct {
	httpClient *http.Client
	logger     *zap.Logger
}

// NewOAuth2Service creates a new OAuth 2.0 service
func NewOAuth2Service(logger *zap.Logger) *OAuth2Service {
	return &OAuth2Service{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// GetAuthorizationURL generates the authorization URL for the authorization code flow
func (s *OAuth2Service) GetAuthorizationURL(config *OAuth2Config) (string, error) {
	if config.AuthURL == "" {
		return "", fmt.Errorf("auth_url is required for authorization code flow")
	}

	u, err := url.Parse(config.AuthURL)
	if err != nil {
		return "", fmt.Errorf("invalid auth_url: %w", err)
	}

	q := u.Query()
	q.Set("client_id", config.ClientID)
	q.Set("response_type", "code")

	if config.RedirectURI != "" {
		q.Set("redirect_uri", config.RedirectURI)
	}
	if config.Scope != "" {
		q.Set("scope", config.Scope)
	}
	if config.State != "" {
		q.Set("state", config.State)
	}

	u.RawQuery = q.Encode()
	return u.String(), nil
}

// ExchangeAuthorizationCode exchanges an authorization code for tokens
func (s *OAuth2Service) ExchangeAuthorizationCode(ctx context.Context, config *OAuth2Config, code string) (*OAuth2Token, error) {
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("client_id", config.ClientID)

	if config.ClientSecret != "" {
		data.Set("client_secret", config.ClientSecret)
	}
	if config.RedirectURI != "" {
		data.Set("redirect_uri", config.RedirectURI)
	}

	return s.doTokenRequest(ctx, config.TokenURL, data)
}

// GetClientCredentialsToken gets a token using client credentials
func (s *OAuth2Service) GetClientCredentialsToken(ctx context.Context, config *OAuth2Config) (*OAuth2Token, error) {
	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("client_id", config.ClientID)

	if config.ClientSecret != "" {
		data.Set("client_secret", config.ClientSecret)
	}
	if config.Scope != "" {
		data.Set("scope", config.Scope)
	}

	return s.doTokenRequest(ctx, config.TokenURL, data)
}

// GetPasswordToken gets a token using password grant
func (s *OAuth2Service) GetPasswordToken(ctx context.Context, config *OAuth2Config, username, password string) (*OAuth2Token, error) {
	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("client_id", config.ClientID)
	data.Set("username", username)
	data.Set("password", password)

	if config.ClientSecret != "" {
		data.Set("client_secret", config.ClientSecret)
	}
	if config.Scope != "" {
		data.Set("scope", config.Scope)
	}

	return s.doTokenRequest(ctx, config.TokenURL, data)
}

// RefreshToken refreshes an access token
func (s *OAuth2Service) RefreshToken(ctx context.Context, config *OAuth2Config, refreshToken string) (*OAuth2Token, error) {
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", refreshToken)
	data.Set("client_id", config.ClientID)

	if config.ClientSecret != "" {
		data.Set("client_secret", config.ClientSecret)
	}

	return s.doTokenRequest(ctx, config.TokenURL, data)
}

// doTokenRequest performs a token request
func (s *OAuth2Service) doTokenRequest(ctx context.Context, tokenURL string, data url.Values) (*OAuth2Token, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for error response
	if resp.StatusCode >= 400 {
		var oauthErr OAuth2Error
		if err := json.Unmarshal(body, &oauthErr); err == nil && oauthErr.Error != "" {
			return nil, fmt.Errorf("oauth2 error: %s - %s", oauthErr.Error, oauthErr.ErrorDescription)
		}
		return nil, fmt.Errorf("token request failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse token response
	var token OAuth2Token
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	// Calculate expiration time
	if token.ExpiresIn > 0 {
		token.ExpiresAt = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	}

	return &token, nil
}

// ValidateToken validates that a token is properly formatted
func (s *OAuth2Service) ValidateToken(token *OAuth2Token) error {
	if token.AccessToken == "" {
		return fmt.Errorf("access_token is empty")
	}
	if token.TokenType == "" {
		token.TokenType = "Bearer"
	}
	return nil
}

// IsTokenExpired checks if a token has expired
func (s *OAuth2Service) IsTokenExpired(token *OAuth2Token) bool {
	if token.ExpiresAt.IsZero() {
		return false
	}
	// Add 30 second buffer
	return time.Now().After(token.ExpiresAt.Add(-30 * time.Second))
}

// GetProviders returns the list of known OAuth 2.0 providers
func (s *OAuth2Service) GetProviders() map[string]OAuth2Provider {
	return KnownProviders
}

// GetProvider returns a specific provider by name
func (s *OAuth2Service) GetProvider(name string) (OAuth2Provider, bool) {
	provider, ok := KnownProviders[strings.ToLower(name)]
	return provider, ok
}
