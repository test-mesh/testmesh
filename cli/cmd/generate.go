package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/spf13/cobra"
)

var (
	generateOutput  string
	generateFromAPI string
)

var generateCmd = &cobra.Command{
	Use:   "generate <description>",
	Short: "Generate a flow using AI",
	Long: `Generate a test flow from a natural language description using AI.

Connects to the TestMesh server to use AI-powered flow generation.
Requires an active API key configured in the server.`,
	Args: cobra.MinimumNArgs(1),
	RunE: generateFlow,
}

func init() {
	rootCmd.AddCommand(generateCmd)
	generateCmd.Flags().StringVarP(&generateOutput, "output", "o", "", "Output file path (default: stdout)")
	generateCmd.Flags().StringVar(&generateFromAPI, "from-api", "", "Generate from OpenAPI spec file")
}

func generateFlow(cmd *cobra.Command, args []string) error {
	description := args[0]

	fmt.Println("🤖 Generating flow using AI...")
	fmt.Printf("   Description: %s\n", description)
	fmt.Println()

	// Build request
	reqBody := map[string]interface{}{
		"description": description,
	}

	// If generating from OpenAPI
	if generateFromAPI != "" {
		spec, err := os.ReadFile(generateFromAPI)
		if err != nil {
			return fmt.Errorf("failed to read OpenAPI spec: %w", err)
		}
		reqBody["openapi_spec"] = string(spec)
		fmt.Printf("   Using OpenAPI spec: %s\n", generateFromAPI)
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	// Make API request
	resp, err := http.Post(
		apiURL+"/api/v1/ai/generate",
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
		Flow string `json:"flow_yaml"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	// Output result
	if generateOutput != "" {
		if err := os.WriteFile(generateOutput, []byte(result.Flow), 0644); err != nil {
			return fmt.Errorf("failed to write output file: %w", err)
		}
		fmt.Printf("✅ Generated flow saved to %s\n", generateOutput)
	} else {
		fmt.Println("Generated Flow:")
		fmt.Println("─────────────────────────────────────")
		fmt.Println(result.Flow)
		fmt.Println("─────────────────────────────────────")
	}

	return nil
}
