package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type APIKeyRepository struct {
	db *gorm.DB
}

func NewAPIKeyRepository(db *gorm.DB) *APIKeyRepository {
	return &APIKeyRepository{db: db}
}

func (r *APIKeyRepository) Create(ctx context.Context, workspaceID uuid.UUID, name string) (*models.WorkspaceAPIKey, string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("generate key bytes: %w", err)
	}
	plaintext := "tm_live_" + hex.EncodeToString(raw)
	prefix := plaintext[:12]

	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("hash key: %w", err)
	}

	key := &models.WorkspaceAPIKey{
		WorkspaceID: workspaceID,
		Name:        name,
		KeyHash:     string(hash),
		Prefix:      prefix,
	}
	if err := r.db.WithContext(ctx).Create(key).Error; err != nil {
		return nil, "", fmt.Errorf("insert key: %w", err)
	}
	return key, plaintext, nil
}

func (r *APIKeyRepository) ResolveKey(ctx context.Context, plaintext string) (uuid.UUID, error) {
	if len(plaintext) < 12 {
		return uuid.Nil, fmt.Errorf("invalid key format")
	}
	prefix := plaintext[:12]

	var key models.WorkspaceAPIKey
	err := r.db.WithContext(ctx).
		Where("prefix = ? AND revoked_at IS NULL", prefix).
		First(&key).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid api key")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(key.KeyHash), []byte(plaintext)); err != nil {
		return uuid.Nil, fmt.Errorf("invalid api key")
	}

	now := time.Now()
	go func() {
		if err := r.db.WithContext(context.Background()).Model(&key).Update("last_used_at", now).Error; err != nil {
			_ = err // best-effort, non-fatal
		}
	}()

	return key.WorkspaceID, nil
}

func (r *APIKeyRepository) Revoke(ctx context.Context, keyID uuid.UUID) error {
	now := time.Now()
	result := r.db.WithContext(ctx).Model(&models.WorkspaceAPIKey{}).
		Where("id = ?", keyID).
		Update("revoked_at", now)
	if result.Error != nil {
		return fmt.Errorf("revoke key: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("key not found or already revoked")
	}
	return nil
}

func (r *APIKeyRepository) ListForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]models.WorkspaceAPIKey, error) {
	var keys []models.WorkspaceAPIKey
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND revoked_at IS NULL", workspaceID).
		Order("created_at DESC").
		Find(&keys).Error
	return keys, err
}
