# Git Integration: Credentials, Webhooks, CLI URL Scanning

**Date:** 2026-04-06  
**Status:** Approved

## Problem

Three gaps prevent external users from using the graph dependency analysis with remote repos:

1. `GraphRepo.Credentials` is stored plaintext and never passed to `git clone` — private repos are inaccessible
2. Existing webhook handlers (GitHub/GitLab/Gitea) trigger AI diff analysis but not graph scans — pushes don't re-scan the graph
3. `testmesh graph scan --url <github-url>` sends `{"url":"..."}` to `/graph/scan` but the handler requires `repo_id` — remote URL scanning is broken end-to-end

## Design

### Feature 1: Credential Encryption + Injection

**Encryption layer** — new file `api/internal/graph/repo/credentials.go`:
- `Encrypt(plaintext string, key []byte) (string, error)` — AES-GCM, output is base64(nonce + ciphertext)
- `Decrypt(ciphertext string, key []byte) (string, error)` — reverses it
- Key read from `GRAPH_CREDENTIALS_KEY` env var at startup (must be 32 bytes, base64-encoded)
- Server refuses to start with an invalid key (logged as fatal)

**Storage** — existing `GraphRepo.Credentials` JSONB column, no migration:
- PAT: `{"pat": "<encrypted-base64>"}`
- SSH key: `{"ssh_key": "<encrypted-base64>"}`

**Injection** — `GitClient` gets a `creds *RepoCredentials` field:
- PAT: URL is rewritten before clone/pull — `https://github.com/org/repo.git` → `https://oauth2:{pat}@github.com/org/repo.git`
- SSH key: written to `os.CreateTemp("", "tm-ssh-*")`, `GIT_SSH_COMMAND=ssh -i {path} -o StrictHostKeyChecking=no` set on the exec.Cmd, file deferred-deleted

**API surface** — `CreateRepo` and `UpdateRepo` handlers accept `pat` and `ssh_key` request fields (write-only, never returned). Both are encrypted before `engine.UpsertRepo`.

**Key rotation** — out of scope for this implementation. Re-encryption on key change requires a separate migration job.

### Feature 2: Webhook → Async Graph Scan

**Approach** — extend existing webhook handlers; no new routes.

**`WebhookHandler`** gains two new fields: `repoManager *repo.Manager` and `orchestrator *scanner.Orchestrator`. Both are available in `routes.go` and added to the constructor.

**`triggerGraphScan` helper** (new private method on `WebhookHandler`):
```
func (h *WebhookHandler) triggerGraphScan(repoURL, branch string)
```
1. Calls `h.engine.GetRepoByURL(ctx, repoURL)` — new engine method, queries `graph.graph_repos` by URL
2. If no match: logs and returns (repo not registered for graph scanning — skip silently)
3. If `repo.Branch != branch`: skip (only re-scan the tracked branch, ignore feature branches)
4. Spawns goroutine: `h.repoManager.PrepareRepo(ctx, repo)` → `h.orchestrator.RunFullScan(ctx, input)`
5. Logs success/error from goroutine; never affects the webhook HTTP response

**Call sites** — called at the end of push handling in each provider:
- `HandleGitHub` — after existing logic, on `X-GitHub-Event: push`
- `HandleGitLab` — on `X-Gitlab-Event: Push Hook`
- `HandleGitea` — on `X-Gitea-Event: push`

**Concurrency** — if two pushes arrive before the first scan finishes, both scans run. The merge engine is idempotent (upsert semantics), so duplicate scans are safe but wasteful. A simple in-memory per-repo mutex can be added later; not in scope here.

**Engine method** — `GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error)` added to the `Engine` interface and implemented in `engine.go` as a GORM `Where("url = ? AND workspace_id = ?", url, workspaceID).First`.

### Feature 3: CLI `--url` Auto-Register + Scan

**API change** — `TriggerScan` handler accepts `url` string without requiring `repo_id`:

```
POST /api/v1/workspaces/{ws}/graph/scan
{
  "url": "https://github.com/org/repo.git",   // either url or repo_id required
  "repo_id": "uuid",                           // existing behaviour
  "repo_path": "/local/path",                  // CLI local scan (unchanged)
  "pat": "ghp_xxx",                            // optional, used on first registration
  "branch": "main"                             // optional, defaults to "main"
}
```

Handler flow when `url` present:
1. `engine.GetRepoByURL(ctx, url, workspaceID)` — reuse or create
2. If not found: `engine.CreateRepo` with name derived from URL last path segment (strip `.git`)
3. If `pat` provided and repo is newly created: encrypt and store in `Credentials`
4. Continue with existing scan flow using resolved repo ID

**CLI change** — `graphScan` sends `url` when `--url` is set (already works). Add two new flags:
- `--token string` — PAT, forwarded as `pat` in scan payload
- `--ssh-key string` — path to SSH private key file; contents read and forwarded as `ssh_key`

**Idempotency** — scanning the same URL twice creates one `GraphRepo`, updates it on re-scan. PAT is only stored on first creation; subsequent scans with `--token` are ignored if the repo already has credentials.

## Files Changed

| File | Change |
|------|--------|
| `api/internal/graph/repo/credentials.go` | New — AES-GCM encrypt/decrypt |
| `api/internal/graph/repo/git.go` | Add `creds` field, inject PAT/SSH into clone/pull |
| `api/internal/graph/repo/manager.go` | Decrypt credentials before passing to GitClient |
| `api/internal/graph/engine.go` | Add `GetRepoByURL` to interface + implementation |
| `api/internal/graph/neo4j_queries.go` | Implement `GetRepoByURL` SQL query |
| `api/internal/api/handlers/graph.go` | `TriggerScan`: accept `url` field, auto-register; `CreateRepo`: encrypt credentials |
| `api/internal/api/handlers/webhooks.go` | Add `repoManager`/`orchestrator` fields, `triggerGraphScan` helper, call from push handlers |
| `api/internal/api/routes.go` | Pass `repoManager` and `orchestrator` to `NewWebhookHandler` |
| `testmesh/cli/cmd/graph.go` | Add `--token` and `--ssh-key` flags to `graph scan` |

## Non-Goals

- Webhook secret registration UI (user sets `GRAPH_WEBHOOK_SECRET` or uses per-provider secret from existing integration config)
- Credential rotation / key re-encryption
- Per-branch graph tracking
- Concurrent scan deduplication (per-repo mutex)
