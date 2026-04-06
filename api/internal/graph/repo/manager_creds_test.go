package repo

import (
	"encoding/base64"
	"testing"

	"github.com/test-mesh/testmesh/internal/graph"
)

func TestDecryptRepoCredentials_PAT(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	pat := "ghp_secret"
	encrypted, err := Encrypt(pat, key)
	if err != nil {
		t.Fatal(err)
	}

	repo := &graph.GraphRepo{
		Credentials: graph.JSONMap{"pat": encrypted},
	}

	creds, err := decryptRepoCredentials(repo, key)
	if err != nil {
		t.Fatalf("decryptRepoCredentials failed: %v", err)
	}
	if creds.PAT != pat {
		t.Errorf("got PAT %q, want %q", creds.PAT, pat)
	}
	if creds.SSHKey != "" {
		t.Error("expected empty SSHKey")
	}
}

func TestDecryptRepoCredentials_SSH(t *testing.T) {
	key := make([]byte, 32)

	sshKey := "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
	encrypted, _ := Encrypt(sshKey, key)

	repo := &graph.GraphRepo{
		Credentials: graph.JSONMap{"ssh_key": encrypted},
	}

	creds, err := decryptRepoCredentials(repo, key)
	if err != nil {
		t.Fatal(err)
	}
	if creds.SSHKey != sshKey {
		t.Errorf("got SSH key %q, want %q", creds.SSHKey, sshKey)
	}
}

func TestDecryptRepoCredentials_Empty(t *testing.T) {
	key := make([]byte, 32)
	repo := &graph.GraphRepo{Credentials: graph.JSONMap{}}

	creds, err := decryptRepoCredentials(repo, key)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if creds != nil {
		t.Error("expected nil creds for empty credentials map")
	}
}

func TestDecryptRepoCredentials_NilCredentials(t *testing.T) {
	key := make([]byte, 32)
	repo := &graph.GraphRepo{}

	creds, err := decryptRepoCredentials(repo, key)
	if err != nil {
		t.Fatal(err)
	}
	if creds != nil {
		t.Error("expected nil creds for nil credentials map")
	}
}

// helper to create a valid key for env-var tests
func base64Key(t *testing.T) string {
	t.Helper()
	key := make([]byte, 32)
	return base64.StdEncoding.EncodeToString(key)
}
