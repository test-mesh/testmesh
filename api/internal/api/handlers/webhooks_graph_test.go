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
