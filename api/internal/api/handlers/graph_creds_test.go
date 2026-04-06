package handlers

import (
	"encoding/base64"
	"testing"

	"github.com/test-mesh/testmesh/internal/graph/repo"
)

func TestEncryptRepoCredentialsRequest(t *testing.T) {
	rawKey := make([]byte, 32)
	for i := range rawKey {
		rawKey[i] = byte(i + 1)
	}
	encodedKey := base64.StdEncoding.EncodeToString(rawKey)
	t.Setenv("GRAPH_CREDENTIALS_KEY", encodedKey)

	pat := "ghp_supersecret"
	result, err := encryptCredentialsForStorage(pat, "")
	if err != nil {
		t.Fatalf("encryptCredentialsForStorage failed: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}

	encryptedPAT, ok := (*result)["pat"].(string)
	if !ok || encryptedPAT == "" {
		t.Fatal("expected encrypted pat in result")
	}
	if encryptedPAT == pat {
		t.Error("pat should be encrypted, not plaintext")
	}

	// Verify we can decrypt it back
	key, _ := repo.CredentialsKeyFromEnv()
	decrypted, err := repo.Decrypt(encryptedPAT, key)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if decrypted != pat {
		t.Errorf("round-trip failed: got %q, want %q", decrypted, pat)
	}
}

func TestEncryptRepoCredentialsRequest_NoKey(t *testing.T) {
	t.Setenv("GRAPH_CREDENTIALS_KEY", "")

	_, err := encryptCredentialsForStorage("ghp_token", "")
	if err == nil {
		t.Fatal("expected error when GRAPH_CREDENTIALS_KEY is not set")
	}
}

func TestEncryptRepoCredentialsRequest_NoCreds(t *testing.T) {
	result, err := encryptCredentialsForStorage("", "")
	if err != nil {
		t.Fatal(err)
	}
	if result != nil {
		t.Error("expected nil when no credentials provided")
	}
}
