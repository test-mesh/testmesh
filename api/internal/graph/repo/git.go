package repo

import (
	"bufio"
	"context"
	"fmt"
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
	logger   *zap.Logger
}

// NewGitClient creates a git client for the given repository path.
func NewGitClient(repoPath string, logger *zap.Logger) *GitClient {
	return &GitClient{
		repoPath: repoPath,
		logger:   logger,
	}
}

// Clone clones a repository into the configured path.
func (g *GitClient) Clone(ctx context.Context, url, branch string) error {
	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(g.repoPath), 0755); err != nil {
		return fmt.Errorf("create parent dir: %w", err)
	}

	args := []string{"clone", "--depth", "1", "--single-branch"}
	if branch != "" {
		args = append(args, "--branch", branch)
	}
	args = append(args, url, g.repoPath)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
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

	// Fetch
	cmd := exec.CommandContext(ctx, "git", "fetch", "origin", branch)
	cmd.Dir = g.repoPath
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git fetch failed: %w\noutput: %s", err, string(output))
	}

	// Reset to fetched branch (handles diverged histories)
	cmd = exec.CommandContext(ctx, "git", "reset", "--hard", fmt.Sprintf("origin/%s", branch))
	cmd.Dir = g.repoPath
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git reset failed: %w\noutput: %s", err, string(output))
	}

	return nil
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
