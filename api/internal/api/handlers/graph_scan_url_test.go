package handlers

import (
	"testing"
)

func TestDeriveRepoNameFromURL(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"https://github.com/org/my-repo.git", "my-repo"},
		{"https://github.com/org/my-repo", "my-repo"},
		{"https://gitlab.com/group/subgroup/project.git", "project"},
	}
	for _, tt := range tests {
		got := deriveRepoNameFromURL(tt.url)
		if got != tt.want {
			t.Errorf("deriveRepoNameFromURL(%q) = %q, want %q", tt.url, got, tt.want)
		}
	}
}
