# Git Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three gaps that prevent external users from using graph dependency analysis with remote repos: (1) credentials never injected into git clone, (2) push webhooks don't trigger graph rescans, (3) CLI `--url` flag broken because handler requires repo_id.

**Architecture:** AES-GCM encryption layer wrapping credential storage → GitClient reads and injects credentials at clone/pull time. Webhook handlers get two new fields (repoManager, orchestrator) wired in after graph initialization, plus a shared `triggerGraphScan` helper. TriggerScan handler accepts `url` without `repo_id` and auto-registers the repo.

**Tech Stack:** Go, AES-GCM (crypto/aes, crypto/cipher), GORM, Gin, cobra CLI flags.

---

## File Map

| File | Change |
|------|--------|
| `api/internal/graph/repo/credentials.go` | **New** — AES-GCM encrypt/decrypt; `RepoCredentials` struct |
| `api/internal/graph/repo/git.go` | **Modify** — add `creds *RepoCredentials`; inject PAT into clone URL; write SSH key temp file |
| `api/internal/graph/repo/manager.go` | **Modify** — decrypt `repo.Credentials` JSONB and pass `RepoCredentials` to `NewGitClient` |
| `api/internal/graph/engine.go` | **Modify** — add `GetRepoByURL` and `FindReposByURLFragment` to interface and implement |
| `api/internal/graph/noop_engine.go` | **Modify** — add noop stubs for both new methods |
| `api/internal/api/handlers/graph.go` | **Modify** — `CreateRepo`/`UpdateRepo` encrypt; `TriggerScan` accept `url` field, auto-register |
| `api/internal/api/handlers/webhooks.go` | **Modify** — add `repoManager`/`orchestrator` fields + setter; `triggerGraphScan` helper; call from push handlers |
| `api/internal/api/routes.go` | **Modify** — call `webhookHandler.SetGraphScanDeps(repoMgr, orchestrator)` after graph init |
| `testmesh/cli/cmd/graph.go` | **Modify** — add `--token` and `--ssh-key` flags; include in scan payload |

---

### Task 1: Credential encryption/decryption layer

**Files:**
- Create: `api/internal/graph/repo/credentials.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/graph/repo/credentials_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -run TestEncrypt -v 2>&1 | head -20
```

Expected: `FAIL` — `Encrypt` undefined.

- [ ] **Step 3: Implement credentials.go**

Create `api/internal/graph/repo/credentials.go`:

```go
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -run "TestEncrypt|TestDecrypt|TestKey" -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/graph/repo/credentials.go api/internal/graph/repo/credentials_test.go
git commit -m "feat(graph): add AES-GCM credential encrypt/decrypt for repo credentials"
```

---

### Task 2: GitClient credential injection

**Files:**
- Modify: `api/internal/graph/repo/git.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/graph/repo/git_credentials_test.go`:

```go
package repo

import (
	"net/url"
	"strings"
	"testing"
)

func TestInjectPATIntoURL(t *testing.T) {
	tests := []struct {
		name     string
		repoURL  string
		pat      string
		wantHost string
	}{
		{
			name:     "https github",
			repoURL:  "https://github.com/org/repo.git",
			pat:      "ghp_token123",
			wantHost: "oauth2:ghp_token123@github.com",
		},
		{
			name:     "https gitlab",
			repoURL:  "https://gitlab.com/org/repo.git",
			pat:      "glpat-xxx",
			wantHost: "oauth2:glpat-xxx@gitlab.com",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := injectPATIntoURL(tt.repoURL, tt.pat)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			parsed, err := url.Parse(result)
			if err != nil {
				t.Fatalf("result is not valid URL: %v", err)
			}
			gotHost := parsed.User.String() + "@" + parsed.Host
			if gotHost != tt.wantHost {
				t.Errorf("got %q, want %q", gotHost, tt.wantHost)
			}
			if !strings.Contains(result, "/org/repo.git") {
				t.Errorf("path lost: %s", result)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -run TestInjectPAT -v 2>&1 | head -15
```

Expected: FAIL — `injectPATIntoURL` undefined.

- [ ] **Step 3: Modify git.go**

Replace the existing `GitClient` struct and `NewGitClient` with this, and add the helper functions. Keep all existing methods unchanged — only add the `creds` field and credential injection:

```go
// GitClient wraps git CLI operations for repository management.
type GitClient struct {
	repoPath string
	creds    *RepoCredentials
	logger   *zap.Logger
}

// NewGitClient creates a git client for the given repository path.
func NewGitClient(repoPath string, creds *RepoCredentials, logger *zap.Logger) *GitClient {
	return &GitClient{
		repoPath: repoPath,
		creds:    creds,
		logger:   logger,
	}
}
```

Replace the `Clone` method to inject credentials:

```go
// Clone clones a repository into the configured path.
func (g *GitClient) Clone(ctx context.Context, url, branch string) error {
	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(g.repoPath), 0755); err != nil {
		return fmt.Errorf("create parent dir: %w", err)
	}

	cloneURL := url
	var sshKeyPath string

	if g.creds != nil {
		if g.creds.PAT != "" {
			injected, err := injectPATIntoURL(url, g.creds.PAT)
			if err != nil {
				return fmt.Errorf("inject PAT: %w", err)
			}
			cloneURL = injected
		} else if g.creds.SSHKey != "" {
			path, cleanup, err := writeSSHKeyFile(g.creds.SSHKey)
			if err != nil {
				return fmt.Errorf("write SSH key: %w", err)
			}
			defer cleanup()
			sshKeyPath = path
		}
	}

	args := []string{"clone", "--depth", "1", "--single-branch"}
	if branch != "" {
		args = append(args, "--branch", branch)
	}
	args = append(args, cloneURL, g.repoPath)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	if sshKeyPath != "" {
		cmd.Env = append(os.Environ(),
			fmt.Sprintf("GIT_SSH_COMMAND=ssh -i %s -o StrictHostKeyChecking=no", sshKeyPath),
		)
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git clone failed: %w\noutput: %s", err, string(output))
	}

	return nil
}
```

Replace the `Pull` method:

```go
// Pull fetches and merges the latest changes.
func (g *GitClient) Pull(ctx context.Context, branch string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	var sshKeyPath string
	var sshCleanup func()
	if g.creds != nil && g.creds.SSHKey != "" {
		path, cleanup, err := writeSSHKeyFile(g.creds.SSHKey)
		if err != nil {
			return fmt.Errorf("write SSH key: %w", err)
		}
		sshCleanup = cleanup
		sshKeyPath = path
	}
	if sshCleanup != nil {
		defer sshCleanup()
	}

	sshEnv := ""
	if sshKeyPath != "" {
		sshEnv = fmt.Sprintf("GIT_SSH_COMMAND=ssh -i %s -o StrictHostKeyChecking=no", sshKeyPath)
	}

	runGit := func(args ...string) error {
		cmd := exec.CommandContext(ctx, "git", args...)
		cmd.Dir = g.repoPath
		if sshEnv != "" {
			cmd.Env = append(os.Environ(), sshEnv)
		}
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git %s failed: %w\noutput: %s", args[0], err, string(output))
		}
		return nil
	}

	if err := runGit("fetch", "origin", branch); err != nil {
		return err
	}
	return runGit("reset", "--hard", fmt.Sprintf("origin/%s", branch))
}
```

Add helper functions at the bottom of git.go (after `parseLines`):

```go
// injectPATIntoURL rewrites an HTTPS URL to embed oauth2 credentials.
// https://github.com/org/repo.git → https://oauth2:{pat}@github.com/org/repo.git
func injectPATIntoURL(rawURL, pat string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	parsed.User = url.UserPassword("oauth2", pat)
	return parsed.String(), nil
}

// writeSSHKeyFile writes an SSH private key to a temp file and returns the path
// plus a cleanup function that deletes the file.
func writeSSHKeyFile(sshKey string) (string, func(), error) {
	f, err := os.CreateTemp("", "tm-ssh-*")
	if err != nil {
		return "", nil, fmt.Errorf("create temp file: %w", err)
	}
	if _, err := f.WriteString(sshKey); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", nil, fmt.Errorf("write SSH key: %w", err)
	}
	if err := f.Chmod(0600); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", nil, fmt.Errorf("chmod SSH key: %w", err)
	}
	f.Close()
	path := f.Name()
	return path, func() { os.Remove(path) }, nil
}
```

Add `"net/url"` to the imports at the top of git.go.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -run "TestInjectPAT" -v
```

Expected: PASS.

Also verify the package still builds:

```bash
go build ./internal/graph/repo/...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/graph/repo/git.go api/internal/graph/repo/git_credentials_test.go
git commit -m "feat(graph): inject PAT/SSH credentials into git clone and pull commands"
```

---

### Task 3: Manager credential decryption

**Files:**
- Modify: `api/internal/graph/repo/manager.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/graph/repo/manager_creds_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -run "TestDecryptRepo" -v 2>&1 | head -15
```

Expected: FAIL — `decryptRepoCredentials` undefined.

- [ ] **Step 3: Modify manager.go**

Add `decryptRepoCredentials` helper function to `manager.go` and update `PrepareRepo` to decrypt and pass credentials to `NewGitClient`:

At the top of manager.go, add `"os"` to imports (it's already there) and ensure `"go.uber.org/zap"` is imported.

Add this helper function:

```go
// decryptRepoCredentials decrypts the repo's stored credentials JSONB.
// Returns nil (no error) if the credentials map is empty or nil.
func decryptRepoCredentials(repo *graph.GraphRepo, key []byte) (*RepoCredentials, error) {
	if len(repo.Credentials) == 0 {
		return nil, nil
	}
	creds := &RepoCredentials{}
	if pat, ok := repo.Credentials["pat"].(string); ok && pat != "" {
		decrypted, err := Decrypt(pat, key)
		if err != nil {
			return nil, fmt.Errorf("decrypt PAT: %w", err)
		}
		creds.PAT = decrypted
	}
	if sshKey, ok := repo.Credentials["ssh_key"].(string); ok && sshKey != "" {
		decrypted, err := Decrypt(sshKey, key)
		if err != nil {
			return nil, fmt.Errorf("decrypt SSH key: %w", err)
		}
		creds.SSHKey = decrypted
	}
	if creds.PAT == "" && creds.SSHKey == "" {
		return nil, nil
	}
	return creds, nil
}
```

Update `PrepareRepo` to decrypt credentials before creating `GitClient`. Replace the `git := NewGitClient(localPath, m.logger)` call and the two `git.Clone`/`git.Pull` call sites:

```go
// PrepareRepo ensures a repository is available locally for scanning.
// For CLI scans, localPath is provided directly. For Git URL repos, it clones.
func (m *Manager) PrepareRepo(ctx context.Context, repo *graph.GraphRepo) (*RepoInfo, error) {
	if repo.URL == "" {
		return nil, fmt.Errorf("repo URL is empty — use PrepareLocalPath for CLI scans")
	}

	localPath := filepath.Join(m.clonePath, repo.WorkspaceID.String(), repo.ID.String())

	// Decrypt credentials — best-effort; nil creds means public repo
	var creds *RepoCredentials
	if key, err := CredentialsKeyFromEnv(); err == nil {
		creds, err = decryptRepoCredentials(repo, key)
		if err != nil {
			m.logger.Warn("Failed to decrypt repo credentials, attempting clone without auth",
				zap.String("repo", repo.Name), zap.Error(err))
			creds = nil
		}
	}

	git := NewGitClient(localPath, creds, m.logger)

	if _, err := os.Stat(filepath.Join(localPath, ".git")); os.IsNotExist(err) {
		m.logger.Info("Cloning repository",
			zap.String("url", repo.URL),
			zap.String("branch", repo.Branch),
		)
		if err := git.Clone(ctx, repo.URL, repo.Branch); err != nil {
			return nil, fmt.Errorf("clone failed: %w", err)
		}
	} else {
		m.logger.Info("Pulling latest changes",
			zap.String("repo", repo.Name),
			zap.String("branch", repo.Branch),
		)
		if err := git.Pull(ctx, repo.Branch); err != nil {
			m.logger.Warn("Pull failed, will re-clone", zap.Error(err))
			os.RemoveAll(localPath)
			if err := git.Clone(ctx, repo.URL, repo.Branch); err != nil {
				return nil, fmt.Errorf("re-clone failed: %w", err)
			}
		}
	}

	// Update repo's last scan timestamp
	now := time.Now().UTC()
	repo.LastScanAt = &now
	repo.LastScanStatus = "scanning"
	m.engine.UpdateRepo(ctx, repo)

	return &RepoInfo{
		ID:          repo.ID,
		WorkspaceID: repo.WorkspaceID,
		LocalPath:   localPath,
		Branch:      repo.Branch,
		IsTemp:      false,
	}, nil
}
```

Also update `GetChangedFiles` and `GetCurrentCommit` which call `NewGitClient` — they don't need credentials (they operate on already-cloned repos), so pass `nil`:

```go
func (m *Manager) GetChangedFiles(ctx context.Context, info *RepoInfo, sinceCommit string) ([]string, error) {
	git := NewGitClient(info.LocalPath, nil, m.logger)
	return git.ChangedFilesSince(ctx, sinceCommit)
}

func (m *Manager) GetCurrentCommit(ctx context.Context, info *RepoInfo) (string, error) {
	git := NewGitClient(info.LocalPath, nil, m.logger)
	return git.CurrentCommit(ctx)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/repo/... -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/graph/repo/manager.go api/internal/graph/repo/manager_creds_test.go
git commit -m "feat(graph): decrypt repo credentials in PrepareRepo before git operations"
```

---

### Task 4: Engine — GetRepoByURL and FindReposByURLFragment

**Files:**
- Modify: `api/internal/graph/engine.go`
- Modify: `api/internal/graph/noop_engine.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/graph/engine_repo_url_test.go`:

```go
package graph_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	db.AutoMigrate(&graph.GraphRepo{})
	return db
}

func TestGetRepoByURL(t *testing.T) {
	db := setupTestDB(t)
	wsID := uuid.New()

	repo := &graph.GraphRepo{
		ID:          uuid.New(),
		WorkspaceID: wsID,
		Name:        "my-repo",
		URL:         "https://github.com/org/my-repo.git",
		Branch:      "main",
	}
	if err := db.Create(repo).Error; err != nil {
		t.Fatal(err)
	}

	engine := graph.NewEngine(db, nil, nil)

	found, err := engine.GetRepoByURL(context.Background(), "https://github.com/org/my-repo.git", wsID)
	if err != nil {
		t.Fatalf("GetRepoByURL failed: %v", err)
	}
	if found.ID != repo.ID {
		t.Errorf("got repo %v, want %v", found.ID, repo.ID)
	}

	_, err = engine.GetRepoByURL(context.Background(), "https://github.com/other/repo.git", wsID)
	if err == nil {
		t.Error("expected error for non-existent URL")
	}
}

func TestFindReposByURLFragment(t *testing.T) {
	db := setupTestDB(t)
	ws1 := uuid.New()
	ws2 := uuid.New()

	r1 := &graph.GraphRepo{ID: uuid.New(), WorkspaceID: ws1, Name: "r1", URL: "https://github.com/org/repo.git", Branch: "main"}
	r2 := &graph.GraphRepo{ID: uuid.New(), WorkspaceID: ws2, Name: "r2", URL: "https://github.com/org/repo", Branch: "main"}
	r3 := &graph.GraphRepo{ID: uuid.New(), WorkspaceID: ws1, Name: "r3", URL: "https://github.com/other/repo.git", Branch: "main"}
	for _, r := range []*graph.GraphRepo{r1, r2, r3} {
		db.Create(r)
	}

	engine := graph.NewEngine(db, nil, nil)

	results, err := engine.FindReposByURLFragment(context.Background(), "org/repo")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 repos matching 'org/repo', got %d", len(results))
	}
}
```

Note: this test requires `gorm.io/driver/sqlite`. Check if it's in go.mod:

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
grep sqlite go.mod
```

If not present, add it:

```bash
go get gorm.io/driver/sqlite
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/... -run "TestGetRepoByURL|TestFindReposByURL" -v 2>&1 | head -20
```

Expected: FAIL — methods undefined on Engine interface.

- [ ] **Step 3: Add methods to the Engine interface in engine.go**

In the `Engine` interface (around line 55, in the "Repo management" section), add two new methods after `DeleteRepo`:

```go
// GetRepoByURL finds a repo by exact URL within a workspace.
GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error)
// FindReposByURLFragment finds repos whose URL contains the given fragment (cross-workspace).
FindReposByURLFragment(ctx context.Context, fragment string) ([]GraphRepo, error)
```

- [ ] **Step 4: Implement on DefaultEngine in engine.go**

Add after the existing `DeleteRepo` implementation (around line 316):

```go
func (e *DefaultEngine) GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error) {
	var repo GraphRepo
	if err := e.db.WithContext(ctx).
		First(&repo, "url = ? AND workspace_id = ?", url, workspaceID).Error; err != nil {
		return nil, err
	}
	return &repo, nil
}

func (e *DefaultEngine) FindReposByURLFragment(ctx context.Context, fragment string) ([]GraphRepo, error) {
	var repos []GraphRepo
	if err := e.db.WithContext(ctx).
		Where("url LIKE ?", "%"+fragment+"%").
		Find(&repos).Error; err != nil {
		return nil, err
	}
	return repos, nil
}
```

- [ ] **Step 5: Add noop stubs to noop_engine.go**

Add after the existing `DeleteRepo` noop:

```go
func (n *NoopEngine) GetRepoByURL(_ context.Context, _ string, _ uuid.UUID) (*GraphRepo, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) FindReposByURLFragment(_ context.Context, _ string) ([]GraphRepo, error) {
	return nil, ErrGraphDisabled
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/graph/... -run "TestGetRepoByURL|TestFindReposByURL" -v
```

Expected: PASS.

Also ensure everything builds:

```bash
go build ./...
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/graph/engine.go api/internal/graph/noop_engine.go api/internal/graph/engine_repo_url_test.go
git commit -m "feat(graph): add GetRepoByURL and FindReposByURLFragment to Engine interface"
```

---

### Task 5: Graph handler — credential encryption on CreateRepo/UpdateRepo

**Files:**
- Modify: `api/internal/api/handlers/graph.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/api/handlers/graph_creds_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestEncryptRepoCredentials" -v 2>&1 | head -15
```

Expected: FAIL — `encryptCredentialsForStorage` undefined.

- [ ] **Step 3: Modify graph.go**

Add the `encryptCredentialsForStorage` helper function and update `CreateRepo` and `UpdateRepo` to call it. Add `"github.com/test-mesh/testmesh/internal/graph/repo"` to imports (it's already there as `"github.com/test-mesh/testmesh/internal/graph/repo"`).

Add this helper after the `NewGraphHandler` constructor:

```go
// encryptCredentialsForStorage encrypts pat and/or sshKey into a JSONMap
// suitable for storing in GraphRepo.Credentials.
// Returns nil if both are empty (no credentials to store).
// Returns an error if credentials are provided but the encryption key is unavailable.
func encryptCredentialsForStorage(pat, sshKey string) (*graph.JSONMap, error) {
	if pat == "" && sshKey == "" {
		return nil, nil
	}
	key, err := repo.CredentialsKeyFromEnv()
	if err != nil {
		return nil, fmt.Errorf("credentials encryption key not available: %w", err)
	}
	creds := graph.JSONMap{}
	if pat != "" {
		encrypted, err := repo.Encrypt(pat, key)
		if err != nil {
			return nil, fmt.Errorf("encrypt PAT: %w", err)
		}
		creds["pat"] = encrypted
	}
	if sshKey != "" {
		encrypted, err := repo.Encrypt(sshKey, key)
		if err != nil {
			return nil, fmt.Errorf("encrypt SSH key: %w", err)
		}
		creds["ssh_key"] = encrypted
	}
	return &creds, nil
}
```

Add `"fmt"` to imports if not already present.

Replace the `CreateRepo` handler:

```go
// CreateRepo handles POST /graph/repos
func (h *GraphHandler) CreateRepo(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		graph.GraphRepo
		PAT    string `json:"pat"`
		SSHKey string `json:"ssh_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.GraphRepo.WorkspaceID = workspaceID

	if req.PAT != "" || req.SSHKey != "" {
		creds, err := encryptCredentialsForStorage(req.PAT, req.SSHKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials: " + err.Error()})
			return
		}
		if creds != nil {
			req.GraphRepo.Credentials = *creds
		}
	}

	if err := h.engine.CreateRepo(c.Request.Context(), &req.GraphRepo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, req.GraphRepo)
}
```

Replace the `UpdateRepo` handler:

```go
// UpdateRepo handles PUT /graph/repos/:repo_id
func (h *GraphHandler) UpdateRepo(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	repoID, err := uuid.Parse(c.Param("repo_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
		return
	}

	existing, err := h.engine.GetRepo(c.Request.Context(), repoID, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repo not found"})
		return
	}

	var req struct {
		graph.GraphRepo
		PAT    string `json:"pat"`
		SSHKey string `json:"ssh_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existing.Name = req.GraphRepo.Name
	existing.URL = req.GraphRepo.URL
	existing.Branch = req.GraphRepo.Branch
	existing.ScanConfig = req.GraphRepo.ScanConfig
	existing.WorkspaceID = workspaceID
	existing.ID = repoID

	if req.PAT != "" || req.SSHKey != "" {
		creds, err := encryptCredentialsForStorage(req.PAT, req.SSHKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials: " + err.Error()})
			return
		}
		if creds != nil {
			existing.Credentials = *creds
		}
	}

	if err := h.engine.UpdateRepo(c.Request.Context(), existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestEncryptRepoCredentials" -v
go build ./...
```

Expected: PASS and no build errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/api/handlers/graph.go api/internal/api/handlers/graph_creds_test.go
git commit -m "feat(graph): encrypt PAT/SSH credentials in CreateRepo and UpdateRepo handlers"
```

---

### Task 6: TriggerScan — accept URL without repo_id, auto-register repo

**Files:**
- Modify: `api/internal/api/handlers/graph.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/api/handlers/graph_scan_url_test.go`:

```go
package handlers

import (
	"testing"
	"path/filepath"
	"strings"
)

func TestDeriveRepoNameFromURL(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"https://github.com/org/my-repo.git", "my-repo"},
		{"https://github.com/org/my-repo", "my-repo"},
		{"https://gitlab.com/group/subgroup/project.git", "project"},
		{"git@github.com:org/repo.git", "repo.git"}, // SSH URLs: best-effort
	}
	for _, tt := range tests {
		got := deriveRepoNameFromURL(tt.url)
		if got != tt.want {
			t.Errorf("deriveRepoNameFromURL(%q) = %q, want %q", tt.url, got, tt.want)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestDeriveRepoName" -v 2>&1 | head -15
```

Expected: FAIL — `deriveRepoNameFromURL` undefined.

- [ ] **Step 3: Modify TriggerScan in graph.go**

Add `"strings"` to imports.

Add the helper function:

```go
// deriveRepoNameFromURL returns the last path segment of a Git URL, stripping .git suffix.
func deriveRepoNameFromURL(rawURL string) string {
	// Strip .git suffix first
	u := strings.TrimSuffix(rawURL, ".git")
	// Get last path segment
	parts := strings.Split(u, "/")
	if len(parts) > 0 {
		name := parts[len(parts)-1]
		if name != "" {
			return name
		}
	}
	return rawURL
}
```

Replace the entire `TriggerScan` handler:

```go
// TriggerScan handles POST /graph/scan
func (h *GraphHandler) TriggerScan(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		RepoID   string `json:"repo_id"`
		RepoPath string `json:"repo_path"` // CLI local scan
		URL      string `json:"url"`       // Remote URL — auto-register if needed
		PAT      string `json:"pat"`       // Optional PAT for first registration
		Branch   string `json:"branch"`    // Optional, defaults to "main"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.RepoID == "" && req.URL == "" && req.RepoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "one of repo_id, url, or repo_path is required"})
		return
	}

	var repoID uuid.UUID
	var repoPath string

	switch {
	case req.URL != "":
		// URL mode: find existing repo or auto-register
		branch := req.Branch
		if branch == "" {
			branch = "main"
		}
		existing, err := h.engine.GetRepoByURL(c.Request.Context(), req.URL, workspaceID)
		if err != nil {
			// Not found — create it
			newRepo := &graph.GraphRepo{
				WorkspaceID: workspaceID,
				Name:        deriveRepoNameFromURL(req.URL),
				URL:         req.URL,
				Branch:      branch,
			}
			if req.PAT != "" {
				creds, err := encryptCredentialsForStorage(req.PAT, "")
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials: " + err.Error()})
					return
				}
				if creds != nil {
					newRepo.Credentials = *creds
				}
			}
			if err := h.engine.CreateRepo(c.Request.Context(), newRepo); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register repo: " + err.Error()})
				return
			}
			existing = newRepo
		}
		repoID = existing.ID
		info, err := h.repoManager.PrepareRepo(c.Request.Context(), existing)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare repo: " + err.Error()})
			return
		}
		defer h.repoManager.Cleanup(info)
		repoPath = info.LocalPath

	case req.RepoPath != "":
		// CLI local scan mode
		repoPath = req.RepoPath
		if req.RepoID != "" {
			id, err := uuid.Parse(req.RepoID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
				return
			}
			repoID = id
		} else {
			repoID = uuid.New()
		}

	default:
		// repo_id mode (existing behaviour)
		id, err := uuid.Parse(req.RepoID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo_id"})
			return
		}
		repoID = id
		graphRepo, err := h.engine.GetRepo(c.Request.Context(), repoID, workspaceID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "repo not found"})
			return
		}
		info, err := h.repoManager.PrepareRepo(c.Request.Context(), graphRepo)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare repo: " + err.Error()})
			return
		}
		defer h.repoManager.Cleanup(info)
		repoPath = info.LocalPath
	}

	input := scanner.ScanInput{
		RepoPath:    repoPath,
		RepoID:      repoID,
		WorkspaceID: workspaceID,
		Config:      scanner.ScannerConfig{},
	}

	scan, err := h.orchestrator.RunFullScan(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, scan)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestDeriveRepoName" -v
go build ./...
```

Expected: PASS and no build errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/api/handlers/graph.go api/internal/api/handlers/graph_scan_url_test.go
git commit -m "feat(graph): TriggerScan accepts url field and auto-registers repo on first scan"
```

---

### Task 7: Webhook handler — triggerGraphScan helper

**Files:**
- Modify: `api/internal/api/handlers/webhooks.go`

- [ ] **Step 1: Write the failing test**

Create `api/internal/api/handlers/webhooks_graph_test.go`:

```go
package handlers

import (
	"testing"
)

func TestBuildRepoURLVariants(t *testing.T) {
	tests := []struct {
		fullName string
		want     []string
	}{
		{
			fullName: "org/repo",
			want: []string{
				"https://github.com/org/repo",
				"https://github.com/org/repo.git",
				"org/repo",
			},
		},
	}
	for _, tt := range tests {
		got := buildRepoURLVariants(tt.fullName)
		if len(got) != len(tt.want) {
			t.Errorf("got %v, want %v", got, tt.want)
			continue
		}
		for i, u := range got {
			if u != tt.want[i] {
				t.Errorf("[%d] got %q, want %q", i, u, tt.want[i])
			}
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestBuildRepoURL" -v 2>&1 | head -15
```

Expected: FAIL — `buildRepoURLVariants` undefined.

- [ ] **Step 3: Modify webhooks.go**

Add imports at the top:

```go
import (
    // existing imports...
    "github.com/test-mesh/testmesh/internal/graph"
    graphrepo "github.com/test-mesh/testmesh/internal/graph/repo"
    graphscanner "github.com/test-mesh/testmesh/internal/graph/scanner"
)
```

Add two new fields to `WebhookHandler` struct (after `embeddingPipeline`):

```go
// Graph scan fields (optional — set via SetGraphScanDeps when graph is enabled)
graphEngine  graph.Engine
repoManager  *graphrepo.Manager
orchestrator *graphscanner.Orchestrator
```

Add a setter method after `NewWebhookHandler`:

```go
// SetGraphScanDeps wires in the graph scan dependencies.
// Called from routes.go after graph initialization, only when graph is enabled.
func (h *WebhookHandler) SetGraphScanDeps(engine graph.Engine, repoManager *graphrepo.Manager, orchestrator *graphscanner.Orchestrator) {
	h.graphEngine = engine
	h.repoManager = repoManager
	h.orchestrator = orchestrator
}
```

Add the `buildRepoURLVariants` helper and `triggerGraphScan` method:

```go
// buildRepoURLVariants generates candidate URLs from a Git provider FullName (e.g. "org/repo").
func buildRepoURLVariants(fullName string) []string {
	return []string{
		"https://github.com/" + fullName,
		"https://github.com/" + fullName + ".git",
		fullName,
	}
}

// triggerGraphScan finds any GraphRepo records whose URL matches repoFullName
// and launches an async graph rescan for each one on the matching branch.
func (h *WebhookHandler) triggerGraphScan(repoFullName, branch string) {
	if h.graphEngine == nil || h.repoManager == nil || h.orchestrator == nil {
		return
	}

	ctx := context.Background()

	repos, err := h.graphEngine.FindReposByURLFragment(ctx, repoFullName)
	if err != nil {
		h.logger.Warn("triggerGraphScan: failed to find repos by URL fragment",
			zap.String("repo", repoFullName), zap.Error(err))
		return
	}
	if len(repos) == 0 {
		h.logger.Debug("triggerGraphScan: no registered graph repos for this push",
			zap.String("repo", repoFullName))
		return
	}

	for _, r := range repos {
		repo := r // capture for goroutine
		if repo.Branch != branch {
			h.logger.Debug("triggerGraphScan: skipping non-tracked branch",
				zap.String("repo", repo.Name),
				zap.String("push_branch", branch),
				zap.String("tracked_branch", repo.Branch),
			)
			continue
		}
		go func() {
			info, err := h.repoManager.PrepareRepo(ctx, &repo)
			if err != nil {
				h.logger.Error("triggerGraphScan: PrepareRepo failed",
					zap.String("repo", repo.Name), zap.Error(err))
				return
			}
			defer h.repoManager.Cleanup(info)

			input := graphscanner.ScanInput{
				RepoPath:    info.LocalPath,
				RepoID:      info.ID,
				WorkspaceID: info.WorkspaceID,
				Config:      graphscanner.ScannerConfig{},
			}
			if _, err := h.orchestrator.RunFullScan(ctx, input); err != nil {
				h.logger.Error("triggerGraphScan: scan failed",
					zap.String("repo", repo.Name), zap.Error(err))
			} else {
				h.logger.Info("triggerGraphScan: rescan complete", zap.String("repo", repo.Name))
			}
		}()
	}
}
```

Add `h.triggerGraphScan(repository, branch)` call at the end of each push handler:

In `HandleGitHub`, immediately before the final `c.JSON(http.StatusOK, ...)` response, inside the `case "push":` block (the async diff analysis section at the end), add after the existing `go h.runDiffAnalysis(...)` call:

```go
// Trigger async graph rescan for push events
if eventType == "push" {
    h.triggerGraphScan(repository, branch)
}
```

In `HandleGitea`, add before the final `c.JSON(http.StatusOK, ...)`:

```go
if eventType == "push" {
    h.triggerGraphScan(repo, branch)
}
```

In `HandleGitLab`, add before the final `c.JSON(http.StatusOK, ...)`:

```go
if eventType == "Push Hook" {
    h.triggerGraphScan(repo, branch)
}
```

Note: in GitLab handler, `eventType` is overwritten to `"pull_request"` for merge requests, so check the original event type. The variable `eventType` before the switch is `"Push Hook"`. Capture it before the switch or check the eventType at the point of the call.

Actually in the GitLab handler, after the switch block, `eventType` may have been overwritten to `"pull_request"` for merge requests. Use `commitSHA != ""` as a proxy or check before the switch modifies it. Best: add `isPush := eventType == "Push Hook"` before the switch, then:

```go
if isPush {
    h.triggerGraphScan(repo, branch)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/api/handlers/... -run "TestBuildRepoURL" -v
go build ./...
```

Expected: PASS and no build errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/api/handlers/webhooks.go api/internal/api/handlers/webhooks_graph_test.go
git commit -m "feat(graph): add triggerGraphScan to webhook handlers for push events"
```

---

### Task 8: Wire graph deps into WebhookHandler in routes.go

**Files:**
- Modify: `api/internal/api/routes.go`

- [ ] **Step 1: Verify current state**

Find where `webhookHandler` is constructed and where `repoMgr` and `orchestrator` are created:

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
grep -n "webhookHandler\|repoMgr\|orchestrator" internal/api/routes.go | head -20
```

Expected output will show `webhookHandler` around line 325 and `repoMgr`/`orchestrator` around line 534–544.

- [ ] **Step 2: Add SetGraphScanDeps call after orchestrator creation**

Find the block in `routes.go` that creates `repoMgr` and `orchestrator` and `graphHandler`. It looks like:

```go
repoMgr := graphrepo.NewManager(ge, clonePath, logger)
graphHandler := handlers.NewGraphHandler(ge, orchestrator, repoMgr, logger)
```

After that block (specifically after `graphHandler` is created), add:

```go
// Wire graph scan deps into the webhook handler so pushes trigger rescans
webhookHandler.SetGraphScanDeps(ge, repoMgr, orchestrator)
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go build ./...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add api/internal/api/routes.go
git commit -m "feat(graph): wire repoManager and orchestrator into WebhookHandler for graph rescans"
```

---

### Task 9: CLI — add --token and --ssh-key flags

**Files:**
- Modify: `testmesh/cli/cmd/graph.go`

- [ ] **Step 1: Write the failing test**

Create `testmesh/cli/cmd/graph_flags_test.go`:

```go
package cmd

import (
	"os"
	"testing"
)

func TestGraphScanPayloadWithToken(t *testing.T) {
	payload := buildGraphScanPayload(".", "https://github.com/org/repo.git", "ghp_xxx", "")
	if url, ok := payload["url"].(string); !ok || url != "https://github.com/org/repo.git" {
		t.Errorf("expected url in payload, got %v", payload)
	}
	if pat, ok := payload["pat"].(string); !ok || pat != "ghp_xxx" {
		t.Errorf("expected pat in payload, got %v", payload)
	}
	if _, ok := payload["repo_path"]; ok {
		t.Error("repo_path should not be set when url is provided")
	}
}

func TestGraphScanPayloadWithSSHKeyFile(t *testing.T) {
	f, err := os.CreateTemp("", "test-ssh-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	f.WriteString("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----")
	f.Close()

	payload := buildGraphScanPayload(".", "https://github.com/org/repo.git", "", f.Name())
	if _, ok := payload["ssh_key"].(string); !ok {
		t.Error("expected ssh_key in payload")
	}
	if key, _ := payload["ssh_key"].(string); key == f.Name() {
		t.Error("ssh_key should be file contents, not the path")
	}
}

func TestGraphScanPayloadLocalPath(t *testing.T) {
	payload := buildGraphScanPayload("/tmp/myrepo", "", "", "")
	if path, ok := payload["repo_path"].(string); !ok || path != "/tmp/myrepo" {
		t.Errorf("expected repo_path, got %v", payload)
	}
	if _, ok := payload["url"]; ok {
		t.Error("url should not be set for local path scan")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go test ./cmd/... -run "TestGraphScanPayload" -v 2>&1 | head -15
```

Expected: FAIL — `buildGraphScanPayload` undefined.

- [ ] **Step 3: Modify graph.go in CLI**

Add two new flag variables after the existing `var graphScanURL string`:

```go
var graphScanToken string
var graphScanSSHKey string
```

Add the `buildGraphScanPayload` helper function:

```go
// buildGraphScanPayload constructs the JSON body for POST /graph/scan.
// sshKeyPath is a file path; its contents are read and sent as ssh_key.
func buildGraphScanPayload(path, url, token, sshKeyPath string) map[string]any {
	payload := map[string]any{}

	if url != "" {
		payload["url"] = url
		if token != "" {
			payload["pat"] = token
		}
		if sshKeyPath != "" {
			keyBytes, err := os.ReadFile(sshKeyPath)
			if err == nil {
				payload["ssh_key"] = string(keyBytes)
			}
		}
	} else {
		payload["repo_path"] = path
	}
	return payload
}
```

Add `"os"` to imports.

Replace `graphScan` to use `buildGraphScanPayload`:

```go
func graphScan(cmd *cobra.Command, args []string) error {
	path := "."
	if len(args) > 0 {
		path = args[0]
	}

	body := buildGraphScanPayload(path, graphScanURL, graphScanToken, graphScanSSHKey)

	resp, err := apiPost("/api/v1/workspaces/default/graph/scan", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	fmt.Println("Scan completed:")
	if scan, ok := result["scan"].(map[string]any); ok {
		fmt.Printf("  Status:        %v\n", scan["status"])
		fmt.Printf("  Nodes added:   %v\n", scan["nodes_added"])
		fmt.Printf("  Edges added:   %v\n", scan["edges_added"])
		fmt.Printf("  Duration:      %vms\n", scan["duration_ms"])
	}
	return nil
}
```

In `init()`, register the two new flags:

```go
graphScanCmd.Flags().StringVar(&graphScanURL, "url", "", "Remote Git URL to clone and scan")
graphScanCmd.Flags().StringVar(&graphScanToken, "token", "", "Personal access token for private repos")
graphScanCmd.Flags().StringVar(&graphScanSSHKey, "ssh-key", "", "Path to SSH private key file for private repos")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go test ./cmd/... -run "TestGraphScanPayload" -v
go build ./...
```

Expected: all PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add testmesh/cli/cmd/graph.go testmesh/cli/cmd/graph_flags_test.go
git commit -m "feat(cli): add --token and --ssh-key flags to graph scan command"
```

---

## Self-Review

Spec requirements vs plan coverage:

| Spec Requirement | Covered By |
|---|---|
| AES-GCM encrypt/decrypt with GRAPH_CREDENTIALS_KEY | Task 1 |
| PAT URL rewrite (oauth2:{pat}@host) | Task 2 |
| SSH key → temp file → GIT_SSH_COMMAND | Task 2 |
| Manager decrypts before GitClient | Task 3 |
| GetRepoByURL (workspace-scoped, exact) | Task 4 |
| FindReposByURLFragment (cross-workspace, LIKE) | Task 4 |
| CreateRepo/UpdateRepo encrypt PAT/SSH on write | Task 5 |
| TriggerScan accept url without repo_id | Task 6 |
| TriggerScan auto-register if not found | Task 6 |
| PAT only stored on first registration | Task 6 (GetRepoByURL finds existing → no overwrite) |
| Webhook: triggerGraphScan helper on push events | Task 7 |
| Webhook: branch filter (only scan tracked branch) | Task 7 |
| Webhook: async goroutine (never blocks response) | Task 7 |
| routes.go: SetGraphScanDeps call | Task 8 |
| CLI: --token flag | Task 9 |
| CLI: --ssh-key flag (reads file contents) | Task 9 |
| NoopEngine stubs | Task 4 |
