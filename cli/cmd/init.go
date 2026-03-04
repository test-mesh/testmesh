package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [directory]",
	Short: "Initialize a new TestMesh project",
	Long: `Initialize a new TestMesh project with default configuration.

Creates:
- .testmesh.yaml configuration file
- flows/ directory for test flows
- environments/ directory for environment configs
- Example flow files`,
	Args: cobra.MaximumNArgs(1),
	RunE: initProject,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

const configTemplate = `# TestMesh Configuration
version: "1.0"

# Default environment
environment: development

# API server URL
api_url: http://localhost:5016

# Default timeout for steps
timeout: 30s

# Environments
environments:
  development:
    BASE_URL: http://localhost:3000
    DB_HOST: localhost
    
  staging:
    BASE_URL: https://staging.example.com
    DB_HOST: staging-db.example.com
    
  production:
    BASE_URL: https://api.example.com
    DB_HOST: prod-db.example.com

# Plugin configuration
plugins:
  kafka:
    enabled: true
  postgresql:
    enabled: true
`

const exampleFlowTemplate = `flow:
  name: Example API Test
  description: An example flow demonstrating TestMesh capabilities
  suite: examples
  
  # Environment variables used in this flow
  env:
    API_VERSION: v1
  
  steps:
    - id: health_check
      name: Check API Health
      action: http_request
      config:
        method: GET
        url: ${BASE_URL}/health
      assert:
        - status == 200
        - body.status == "healthy"
      output:
        health_status: $.status

    - id: create_user
      name: Create Test User
      action: http_request
      config:
        method: POST
        url: ${BASE_URL}/api/${API_VERSION}/users
        headers:
          Content-Type: application/json
        body:
          name: Test User
          email: test-${RANDOM_ID}@example.com
      assert:
        - status == 201
        - body.id != null
      output:
        user_id: $.id
        user_email: $.email

    - id: verify_user
      name: Verify User Created
      action: http_request
      config:
        method: GET
        url: ${BASE_URL}/api/${API_VERSION}/users/${create_user.user_id}
      assert:
        - status == 200
        - body.email == "${create_user.user_email}"
`

func initProject(cmd *cobra.Command, args []string) error {
	dir := "."
	if len(args) > 0 {
		dir = args[0]
	}

	// Create directories
	dirs := []string{
		filepath.Join(dir, "flows"),
		filepath.Join(dir, "environments"),
	}

	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", d, err)
		}
	}

	// Create config file
	configPath := filepath.Join(dir, ".testmesh.yaml")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		if err := os.WriteFile(configPath, []byte(configTemplate), 0644); err != nil {
			return fmt.Errorf("failed to create config file: %w", err)
		}
		fmt.Printf("✅ Created %s\n", configPath)
	} else {
		fmt.Printf("⏭️  Skipped %s (already exists)\n", configPath)
	}

	// Create example flow
	examplePath := filepath.Join(dir, "flows", "example.yaml")
	if _, err := os.Stat(examplePath); os.IsNotExist(err) {
		if err := os.WriteFile(examplePath, []byte(exampleFlowTemplate), 0644); err != nil {
			return fmt.Errorf("failed to create example flow: %w", err)
		}
		fmt.Printf("✅ Created %s\n", examplePath)
	} else {
		fmt.Printf("⏭️  Skipped %s (already exists)\n", examplePath)
	}

	fmt.Println()
	fmt.Println("🎉 TestMesh project initialized!")
	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Printf("  1. Edit %s to configure your environments\n", configPath)
	fmt.Printf("  2. Create flows in the flows/ directory\n")
	fmt.Printf("  3. Run 'testmesh run flows/example.yaml' to test\n")
	fmt.Println()

	return nil
}
