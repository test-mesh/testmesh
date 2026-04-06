package repo

import (
	"encoding/base64"
	"testing"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := "ghp_mySecretToken"
	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	if encrypted == plaintext {
		t.Fatal("Encrypt returned plaintext unchanged")
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}
	if decrypted != plaintext {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestEncryptProducesUniqueNonce(t *testing.T) {
	key := make([]byte, 32)
	plaintext := "same-input"
	enc1, _ := Encrypt(plaintext, key)
	enc2, _ := Encrypt(plaintext, key)
	if enc1 == enc2 {
		t.Fatal("two encryptions of same plaintext produced identical ciphertext (nonce reuse)")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key := make([]byte, 32)
	wrongKey := make([]byte, 32)
	wrongKey[0] = 1

	enc, _ := Encrypt("secret", key)
	_, err := Decrypt(enc, wrongKey)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}

func TestKeyFromEnv(t *testing.T) {
	raw := make([]byte, 32)
	encoded := base64.StdEncoding.EncodeToString(raw)
	t.Setenv("GRAPH_CREDENTIALS_KEY", encoded)

	key, err := CredentialsKeyFromEnv()
	if err != nil {
		t.Fatalf("CredentialsKeyFromEnv failed: %v", err)
	}
	if len(key) != 32 {
		t.Fatalf("expected 32 bytes, got %d", len(key))
	}
}

func TestKeyFromEnvMissing(t *testing.T) {
	t.Setenv("GRAPH_CREDENTIALS_KEY", "")
	_, err := CredentialsKeyFromEnv()
	if err == nil {
		t.Fatal("expected error when env var is missing")
	}
}

func TestKeyFromEnvWrongLength(t *testing.T) {
	// 16 bytes base64-encoded — should fail (must be exactly 32 bytes)
	short := base64.StdEncoding.EncodeToString(make([]byte, 16))
	t.Setenv("GRAPH_CREDENTIALS_KEY", short)
	_, err := CredentialsKeyFromEnv()
	if err == nil {
		t.Fatal("expected error for non-32-byte key")
	}
}
