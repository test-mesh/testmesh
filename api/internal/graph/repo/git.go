package repo

import (
	"bufio"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"
)

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

// Clone clones a repository into the configured path.
func (g *GitClient) Clone(ctx context.Context, url, branch string) error {
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

// ChangedFilesSince returns files changed since the given commit.
func (g *GitClient) ChangedFilesSince(ctx context.Context, commitSHA string) ([]string, error) {
	cmd := exec.CommandContext(ctx, "git", "diff", "--name-only", commitSHA, "HEAD")
	cmd.Dir = g.repoPath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	return parseLines(string(output)), nil
}

// CurrentCommit returns the current HEAD commit SHA.
func (g *GitClient) CurrentCommit(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	cmd.Dir = g.repoPath
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse failed: %w", err)
	}

	return strings.TrimSpace(string(output)), nil
}

// IsGitRepo checks if the path is inside a git repository.
func (g *GitClient) IsGitRepo() bool {
	_, err := os.Stat(filepath.Join(g.repoPath, ".git"))
	return err == nil
}

func parseLines(s string) []string {
	var lines []string
	sc := bufio.NewScanner(strings.NewReader(s))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

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
