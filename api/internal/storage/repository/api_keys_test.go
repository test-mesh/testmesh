package repository_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	host := envOrDefault("TEST_DB_HOST", "localhost")
	port := envOrDefault("TEST_DB_PORT", "5432")
	user := envOrDefault("TEST_DB_USER", "root")
	pass := envOrDefault("TEST_DB_PASS", "admin")
	dbname := envOrDefault("TEST_DB_NAME", "postgres")
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", host, port, user, pass, dbname)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("database not available: %v", err)
	}
	db.Exec(`
		CREATE TABLE IF NOT EXISTS workspaces (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL DEFAULT 'default',
			slug VARCHAR(255) NOT NULL UNIQUE DEFAULT 'default',
			type VARCHAR(20) NOT NULL DEFAULT 'personal',
			owner_id UUID,
			settings JSONB DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW(),
			deleted_at TIMESTAMPTZ
		);
		INSERT INTO workspaces (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default') ON CONFLICT DO NOTHING;
		CREATE TABLE IF NOT EXISTS workspace_api_keys (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			key_hash TEXT NOT NULL,
			prefix VARCHAR(12) NOT NULL,
			last_used_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			revoked_at TIMESTAMPTZ
		);
		CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON workspace_api_keys(prefix);
	`)
	t.Cleanup(func() { db.Exec("DROP TABLE IF EXISTS workspace_api_keys") })
	return db
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func TestAPIKeyRepository_CreateAndResolve(t *testing.T) {
	db := testDB(t)
	repo := repository.NewAPIKeyRepository(db)
	wsID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	key, plaintext, err := repo.Create(context.Background(), wsID, "test-key")
	require.NoError(t, err)
	assert.NotEmpty(t, plaintext)
	assert.Equal(t, "tm_live_", plaintext[:8])

	resolved, err := repo.ResolveKey(context.Background(), plaintext)
	require.NoError(t, err)
	assert.Equal(t, wsID, resolved)

	err = repo.Revoke(context.Background(), key.ID)
	require.NoError(t, err)

	_, err = repo.ResolveKey(context.Background(), plaintext)
	assert.Error(t, err)
}
