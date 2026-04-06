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
