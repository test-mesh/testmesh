package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/test-mesh/testmesh/cli/internal/mcpserver"
)

var (
	mcpAPIURL      string
	mcpWorkspaceID string
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start the TestMesh MCP server (stdio)",
	Long: `Start the TestMesh Model Context Protocol (MCP) server.

The server runs over stdio and exposes TestMesh capabilities as MCP tools
that AI clients (Claude Code, Cursor, etc.) can call to analyze services and
generate, validate, and run E2E test flows.

Configure in Claude Code (~/.claude/settings.json):

  {
    "mcpServers": {
      "testmesh": {
        "command": "testmesh",
        "args": ["mcp"]
      }
    }
  }

Or with the full binary path:

  {
    "mcpServers": {
      "testmesh": {
        "command": "/path/to/testmesh",
        "args": ["mcp"]
      }
    }
  }

Available tools:
  analyze_service    Analyze a service directory — extracts endpoints, models, Kafka topics
  write_flow         Write a TestMesh flow YAML to disk
  run_flow           Execute a flow (YAML string or file path)
  validate_flow      Validate flow YAML without executing it
  list_flows         List flow files in a directory
  get_action_types   Return all supported action types with their config schemas
  list_workspaces    List workspaces in the TestMesh API
  upload_flow        Upload a flow YAML to the TestMesh API
  list_flows_api     List flows stored in the TestMesh API
  trigger_execution  Trigger execution of a flow via the TestMesh API
  get_execution      Get execution results including per-step detail
  get_coverage_gaps  Get uncovered graph nodes for a workspace`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(cmd.ErrOrStderr(), "TestMesh MCP server started (stdio)")
		return mcpserver.Run(mcpserver.Config{
			APIURL:      mcpAPIURL,
			WorkspaceID: mcpWorkspaceID,
		})
	},
}

func init() {
	rootCmd.AddCommand(mcpCmd)
	mcpCmd.Flags().StringVar(&mcpAPIURL, "api-url", "http://localhost:5016", "TestMesh API base URL")
	mcpCmd.Flags().StringVar(&mcpWorkspaceID, "workspace-id", "", "Default workspace ID (auto-discovered if empty)")
}
