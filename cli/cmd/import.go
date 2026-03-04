package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var importOutput string

var importCmd = &cobra.Command{
	Use:   "import <file>",
	Short: "Import flows from external formats",
	Long: `Import test flows from external formats like OpenAPI, Postman, or HAR.

Supported formats:
- OpenAPI/Swagger (*.yaml, *.json)
- Postman Collection (*.postman_collection.json)
- HAR files (*.har)

The imported flows will be converted to TestMesh format.`,
	Args: cobra.ExactArgs(1),
	RunE: importFile,
}

func init() {
	rootCmd.AddCommand(importCmd)
	importCmd.Flags().StringVarP(&importOutput, "output", "o", "", "Output directory for imported flows")
}

func importFile(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	// Detect format
	format := detectImportFormat(filePath, data)
	fmt.Printf("📥 Importing from %s format...\n", format)
	fmt.Printf("   File: %s\n", filePath)
	fmt.Println()

	// Build request
	endpoint := ""
	reqBody := map[string]interface{}{}

	switch format {
	case "openapi":
		endpoint = "/api/v1/ai/import/openapi"
		reqBody["spec"] = string(data)
	case "postman":
		endpoint = "/api/v1/ai/import/postman"
		reqBody["collection"] = string(data)
	case "har":
		// HAR import would need to be implemented
		return fmt.Errorf("HAR import not yet implemented")
	default:
		return fmt.Errorf("unsupported file format")
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	// Make API request
	resp, err := http.Post(
		apiURL+endpoint,
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	// Parse response
	var result struct {
		Flows []struct {
			Name string `json:"name"`
			YAML string `json:"yaml"`
		} `json:"flows"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	// Output flows
	outputDir := importOutput
	if outputDir == "" {
		outputDir = "."
	}

	fmt.Printf("✅ Imported %d flow(s)\n\n", len(result.Flows))

	for _, flow := range result.Flows {
		filename := sanitizeFilename(flow.Name) + ".yaml"
		outputPath := filepath.Join(outputDir, filename)

		if err := os.WriteFile(outputPath, []byte(flow.YAML), 0644); err != nil {
			fmt.Printf("   ❌ Failed to save %s: %v\n", filename, err)
		} else {
			fmt.Printf("   📄 %s\n", outputPath)
		}
	}

	return nil
}

func detectImportFormat(path string, data []byte) string {
	ext := strings.ToLower(filepath.Ext(path))

	// Check by extension
	if ext == ".har" {
		return "har"
	}

	if strings.Contains(path, ".postman_collection") {
		return "postman"
	}

	// Try to detect by content
	var jsonObj map[string]interface{}
	if err := json.Unmarshal(data, &jsonObj); err == nil {
		// Check for Postman collection
		if _, ok := jsonObj["info"]; ok {
			if info, ok := jsonObj["info"].(map[string]interface{}); ok {
				if _, ok := info["_postman_id"]; ok {
					return "postman"
				}
			}
		}

		// Check for OpenAPI
		if _, ok := jsonObj["openapi"]; ok {
			return "openapi"
		}
		if _, ok := jsonObj["swagger"]; ok {
			return "openapi"
		}

		// Check for HAR
		if _, ok := jsonObj["log"]; ok {
			return "har"
		}
	}

	// Assume OpenAPI for YAML files
	if ext == ".yaml" || ext == ".yml" {
		return "openapi"
	}

	return "unknown"
}

func sanitizeFilename(name string) string {
	// Replace invalid characters
	invalid := []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|"}
	result := name
	for _, char := range invalid {
		result = strings.ReplaceAll(result, char, "_")
	}
	return strings.ToLower(strings.ReplaceAll(result, " ", "_"))
}
