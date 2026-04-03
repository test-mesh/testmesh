package runner

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// LoadEnvFile reads a .env file and returns key-value pairs.
// It supports:
//   - KEY=VALUE (simple)
//   - KEY="VALUE" or KEY='VALUE' (quoted, strips outer quotes)
//   - # comments and blank lines (skipped)
//   - Inline comments: KEY=VALUE # comment
//
// The flowDir is used to resolve relative env_file paths.
func LoadEnvFile(envFilePath string, flowDir string) (map[string]interface{}, error) {
	if envFilePath == "" {
		return nil, nil
	}

	// Resolve relative paths against the flow file's directory.
	if !filepath.IsAbs(envFilePath) {
		envFilePath = filepath.Join(flowDir, envFilePath)
	}

	f, err := os.Open(envFilePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vars := make(map[string]interface{})
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])

		// Strip inline comments (only if not inside quotes).
		if len(val) > 0 && val[0] != '"' && val[0] != '\'' {
			if ci := strings.Index(val, " #"); ci >= 0 {
				val = strings.TrimSpace(val[:ci])
			}
		}

		// Strip surrounding quotes.
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') ||
				(val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}

		vars[key] = val
	}
	return vars, scanner.Err()
}

// MergeEnvFileIntoDefinition loads the env_file (if set) and merges its values
// into definition.Env. Inline env values take precedence over env_file values.
// flowDir is the directory containing the flow YAML (for resolving relative paths).
func MergeEnvFileIntoDefinition(env map[string]interface{}, envFile string, flowDir string) (map[string]interface{}, error) {
	if envFile == "" {
		return env, nil
	}

	fileVars, err := LoadEnvFile(envFile, flowDir)
	if err != nil {
		return env, err
	}
	if len(fileVars) == 0 {
		return env, nil
	}

	// Start with env_file values as the base.
	merged := make(map[string]interface{}, len(fileVars)+len(env))
	for k, v := range fileVars {
		merged[k] = v
	}
	// Inline env: values override env_file values.
	for k, v := range env {
		merged[k] = v
	}
	return merged, nil
}
