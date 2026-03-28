package scanner

import (
	"bufio"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// GitDiff parses git diff output to determine changed files.
type GitDiff struct {
	repoPath string
}

// NewGitDiff creates a new GitDiff for the given repository path.
func NewGitDiff(repoPath string) *GitDiff {
	return &GitDiff{repoPath: repoPath}
}

// ChangedFiles returns files changed between two git refs (e.g., commits, branches).
func (d *GitDiff) ChangedFiles(baseRef, headRef string) ([]string, error) {
	args := []string{"diff", "--name-only", baseRef}
	if headRef != "" {
		args = append(args, headRef)
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = d.repoPath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	return parseFileList(string(output)), nil
}

// ChangedFilesSinceCommit returns files changed since a specific commit.
func (d *GitDiff) ChangedFilesSinceCommit(commitSHA string) ([]string, error) {
	return d.ChangedFiles(commitSHA, "HEAD")
}

// StagedFiles returns currently staged files.
func (d *GitDiff) StagedFiles() ([]string, error) {
	cmd := exec.Command("git", "diff", "--cached", "--name-only")
	cmd.Dir = d.repoPath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff --cached failed: %w", err)
	}
	return parseFileList(string(output)), nil
}

// UncommittedFiles returns all uncommitted changes (staged + unstaged).
func (d *GitDiff) UncommittedFiles() ([]string, error) {
	cmd := exec.Command("git", "diff", "--name-only", "HEAD")
	cmd.Dir = d.repoPath
	output, err := cmd.Output()
	if err != nil {
		// HEAD might not exist in a fresh repo
		return d.StagedFiles()
	}
	return parseFileList(string(output)), nil
}

// LastCommitFiles returns files changed in the most recent commit.
func (d *GitDiff) LastCommitFiles() ([]string, error) {
	return d.ChangedFiles("HEAD~1", "HEAD")
}

// FilterByExtensions filters a file list to only include files with given extensions.
func FilterByExtensions(files []string, extensions []string) []string {
	if len(extensions) == 0 {
		return files
	}

	extSet := make(map[string]bool, len(extensions))
	for _, ext := range extensions {
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
		extSet[ext] = true
	}

	var filtered []string
	for _, f := range files {
		ext := filepath.Ext(f)
		if extSet[ext] {
			filtered = append(filtered, f)
		}
	}
	return filtered
}

// FilterByPatterns filters files matching any of the glob patterns.
func FilterByPatterns(files []string, patterns []string) []string {
	if len(patterns) == 0 {
		return files
	}

	var filtered []string
	for _, f := range files {
		for _, pattern := range patterns {
			if matchGlob(f, pattern) {
				filtered = append(filtered, f)
				break
			}
		}
	}
	return filtered
}

func parseFileList(output string) []string {
	var files []string
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			files = append(files, line)
		}
	}
	return files
}
