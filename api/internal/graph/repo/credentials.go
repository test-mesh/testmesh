package repo

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
)

// RepoCredentials holds decrypted credentials for a GraphRepo.
type RepoCredentials struct {
	PAT    string // Personal access token
	SSHKey string // SSH private key contents
}

// CredentialsKeyFromEnv reads the 32-byte AES key from GRAPH_CREDENTIALS_KEY
// (base64-encoded). Returns an error if the var is missing or not 32 bytes.
func CredentialsKeyFromEnv() ([]byte, error) {
	encoded := os.Getenv("GRAPH_CREDENTIALS_KEY")
	if encoded == "" {
		return nil, fmt.Errorf("GRAPH_CREDENTIALS_KEY env var is not set")
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("GRAPH_CREDENTIALS_KEY: base64 decode failed: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("GRAPH_CREDENTIALS_KEY must be 32 bytes after base64 decode, got %d", len(key))
	}
	return key, nil
}

// Encrypt encrypts plaintext using AES-GCM and returns base64(nonce + ciphertext).
func Encrypt(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt reverses Encrypt. Returns the original plaintext or an error.
func Decrypt(encoded string, key []byte) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}
