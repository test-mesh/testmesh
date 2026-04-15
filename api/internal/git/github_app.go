package git

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// githubAppJWT generates a GitHub App JWT valid for 10 minutes.
func githubAppJWT(appID int64, privateKeyPEM string) (string, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return "", fmt.Errorf("failed to decode PEM block from private key")
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// Try PKCS8
		parsed, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err2 != nil {
			return "", fmt.Errorf("failed to parse private key: PKCS1 err: %v, PKCS8 err: %v", err, err2)
		}
		var ok bool
		key, ok = parsed.(*rsa.PrivateKey)
		if !ok {
			return "", fmt.Errorf("private key is not RSA")
		}
	}

	now := time.Now().UTC()
	header := base64.RawURLEncoding.EncodeToString(mustJSON(map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	}))
	payload := base64.RawURLEncoding.EncodeToString(mustJSON(map[string]any{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
		"iss": fmt.Sprintf("%d", appID),
	}))

	signingInput := header + "." + payload
	hash := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// ExchangeInstallationToken exchanges a GitHub App JWT for an installation access token.
func ExchangeInstallationToken(ctx context.Context, appID int64, privateKeyPEM string, installationID int64) (string, error) {
	jwt, err := githubAppJWT(appID, privateKeyPEM)
	if err != nil {
		return "", fmt.Errorf("failed to generate app JWT: %w", err)
	}

	apiURL := fmt.Sprintf("https://api.github.com/app/installations/%d/access_tokens", installationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}
	return result.Token, nil
}

// NewGitHubProviderFromApp creates a GitHubProvider authenticated as a GitHub App installation.
func NewGitHubProviderFromApp(ctx context.Context, appID int64, privateKeyPEM string, installationID int64) (*GitHubProvider, error) {
	token, err := ExchangeInstallationToken(ctx, appID, privateKeyPEM, installationID)
	if err != nil {
		return nil, err
	}
	return &GitHubProvider{token: token}, nil
}

// ListAppInstallations lists GitHub App installations accessible to the authenticated user.
func ListAppInstallations(ctx context.Context, userToken string) ([]GitHubInstallation, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/installations", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Authorization", "token "+userToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Installations []struct {
			ID      int64 `json:"id"`
			Account struct {
				Login     string `json:"login"`
				AvatarURL string `json:"avatar_url"`
				Type      string `json:"type"`
			} `json:"account"`
		} `json:"installations"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse installations response: %w", err)
	}

	out := make([]GitHubInstallation, len(result.Installations))
	for i, inst := range result.Installations {
		out[i] = GitHubInstallation{
			ID:        inst.ID,
			Login:     inst.Account.Login,
			AvatarURL: inst.Account.AvatarURL,
			Type:      inst.Account.Type,
		}
	}
	return out, nil
}

// ExchangeOAuthCode exchanges a GitHub OAuth authorization code for a user access token.
// Returns (accessToken, userLogin, error).
func ExchangeOAuthCode(ctx context.Context, clientID, clientSecret, code string) (string, string, error) {
	payload, _ := json.Marshal(map[string]string{
		"client_id":     clientID,
		"client_secret": clientSecret,
		"code":          code,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		bytes.NewReader(payload))
	if err != nil {
		return "", "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("GitHub OAuth request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("GitHub OAuth returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", fmt.Errorf("failed to parse OAuth response: %w", err)
	}
	if result.Error != "" {
		return "", "", fmt.Errorf("GitHub OAuth error: %s — %s", result.Error, result.ErrorDesc)
	}

	login, err := fetchGitHubUserLogin(ctx, result.AccessToken)
	if err != nil {
		return result.AccessToken, "", nil // non-fatal
	}
	return result.AccessToken, login, nil
}

func fetchGitHubUserLogin(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var u struct {
		Login string `json:"login"`
	}
	json.NewDecoder(resp.Body).Decode(&u)
	return u.Login, nil
}

// GitHubInstallation represents a GitHub App installation.
type GitHubInstallation struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Type      string `json:"type"`
}

// GenerateOAuthState generates a cryptographically random state token for OAuth CSRF protection.
func GenerateOAuthState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.TrimRight(base64.URLEncoding.EncodeToString(b), "="), nil
}
