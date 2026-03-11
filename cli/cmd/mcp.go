package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/test-mesh/testmesh/cli/internal/mcpserver"
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
  generate_flow      Generate a full E2E flow YAML from a service directory
  run_flow           Execute a flow (YAML string or file path)
  validate_flow      Validate flow YAML without executing it
  list_flows         List flow files in a directory
  get_action_types   Return all supported action types with their config schemas`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(cmd.ErrOrStderr(), "TestMesh MCP server started (stdio)")
		return mcpserver.Run()
	},
}

func init() {
	rootCmd.AddCommand(mcpCmd)
}
