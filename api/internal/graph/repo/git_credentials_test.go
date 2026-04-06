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
