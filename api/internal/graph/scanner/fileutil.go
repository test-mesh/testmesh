package scanner

import (
	"os"
	"path/filepath"
	"strings"
)

// WalkFiles walks a directory tree collecting files matching patterns,
// skipping excluded patterns and respecting size limits.
func WalkFiles(root string, patterns []string, config ScannerConfig) ([]string, error) {
	excludePatterns := config.ExcludePatterns
	if len(excludePatterns) == 0 {
		excludePatterns = DefaultExcludePatterns
	}

	maxSizeBytes := int64(config.MaxFileSizeMB) * 1024 * 1024
	if maxSizeBytes <= 0 {
		maxSizeBytes = 10 * 1024 * 1024 // 10MB default
	}

	maxFiles := config.MaxFileCount
	if maxFiles <= 0 {
		maxFiles = 100000
	}

	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip inaccessible files
		}

		relPath, _ := filepath.Rel(root, path)

		// Skip excluded directories
		if info.IsDir() {
			for _, pattern := range excludePatterns {
				if matchGlob(relPath+"/", pattern) || matchGlob(info.Name()+"/", pattern) {
					return filepath.SkipDir
				}
			}
			return nil
		}

		// Skip excluded files
		for _, pattern := range excludePatterns {
			if matchGlob(relPath, pattern) {
				return nil
			}
		}

		// Check size limit
		if info.Size() > maxSizeBytes {
			return nil
		}

		// Check file count limit
		if len(files) >= maxFiles {
			return filepath.SkipAll
		}

		// Match against patterns
		if len(patterns) == 0 {
			files = append(files, path)
			return nil
		}

		for _, pattern := range patterns {
			if matchGlob(relPath, pattern) || matchGlob(info.Name(), pattern) {
				files = append(files, path)
				return nil
			}
		}

		return nil
	})

	return files, err
}

// ReadFileString reads a file as a string, returning empty string on error.
func ReadFileString(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

// RelPath returns the relative path from root, or the original path on error.
func RelPath(root, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return path
	}
	return rel
}

// IsYAMLFile checks if a file has a YAML extension.
func IsYAMLFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".yaml" || ext == ".yml"
}

// IsJSONFile checks if a file has a JSON extension.
func IsJSONFile(path string) bool {
	return strings.ToLower(filepath.Ext(path)) == ".json"
}
