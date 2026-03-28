package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"
)

var graphCmd = &cobra.Command{
	Use:   "graph",
	Short: "System graph commands",
	Long:  "Manage the system graph — scan repos, view services, check coverage, and search nodes.",
}

// --- graph scan ---

var graphScanURL string

var graphScanCmd = &cobra.Command{
	Use:   "scan [path]",
	Short: "Scan a repository to build the system graph",
	Long: `Scan a local directory or remote Git URL to discover services, APIs,
databases, message queues, and their relationships.

Without arguments, scans the current directory.`,
	Args: cobra.MaximumNArgs(1),
	RunE: graphScan,
}

func graphScan(cmd *cobra.Command, args []string) error {
	path := "."
	if len(args) > 0 {
		path = args[0]
	}

	body := map[string]string{"repo_path": path}
	if graphScanURL != "" {
		body = map[string]string{"url": graphScanURL}
	}

	resp, err := apiPost("/api/v1/workspaces/default/graph/scan", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	fmt.Println("Scan completed:")
	if scan, ok := result["scan"].(map[string]any); ok {
		fmt.Printf("  Status:        %v\n", scan["status"])
		fmt.Printf("  Nodes added:   %v\n", scan["nodes_added"])
		fmt.Printf("  Edges added:   %v\n", scan["edges_added"])
		fmt.Printf("  Duration:      %vms\n", scan["duration_ms"])
	}
	return nil
}

// --- graph status ---

var graphStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show graph statistics",
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, err := apiGet("/api/v1/workspaces/default/graph/stats")
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var stats map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
			return err
		}

		fmt.Println("System Graph Statistics:")
		fmt.Printf("  Total nodes:     %v\n", stats["total_nodes"])
		fmt.Printf("  Total edges:     %v\n", stats["total_edges"])
		fmt.Printf("  Services:        %v\n", stats["service_count"])
		fmt.Printf("  Coverage:        %.1f%%\n", toFloat(stats["coverage_percent"]))
		fmt.Printf("  Conflicts:       %v\n", stats["conflict_count"])

		if nodesByType, ok := stats["nodes_by_type"].(map[string]any); ok {
			fmt.Println("\n  Nodes by type:")
			for t, c := range nodesByType {
				fmt.Printf("    %-20s %v\n", t, c)
			}
		}
		return nil
	},
}

// --- graph services ---

var graphServicesCmd = &cobra.Command{
	Use:   "services",
	Short: "List discovered services",
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, err := apiGet("/api/v1/workspaces/default/graph/nodes?type=service")
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}

		nodes, _ := result["nodes"].([]any)
		if len(nodes) == 0 {
			fmt.Println("No services found. Run 'testmesh graph scan' first.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "NAME\tLAYER\tCONFIDENCE\tSOURCE")
		for _, n := range nodes {
			node, _ := n.(map[string]any)
			fmt.Fprintf(w, "%v\t%v\t%.0f%%\t%v\n",
				node["name"],
				node["source_layer"],
				toFloat(node["confidence"])*100,
				node["source_file"],
			)
		}
		w.Flush()
		return nil
	},
}

// --- graph show ---

var graphShowCmd = &cobra.Command{
	Use:   "show <node-id>",
	Short: "Show node details and dependencies",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		nodeID := args[0]

		resp, err := apiGet(fmt.Sprintf("/api/v1/workspaces/default/graph/nodes/%s", nodeID))
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var node map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&node); err != nil {
			return err
		}

		fmt.Printf("Node: %v\n", node["name"])
		fmt.Printf("  Type:        %v\n", node["type"])
		fmt.Printf("  Service:     %v\n", node["service"])
		fmt.Printf("  Layer:       %v\n", node["source_layer"])
		fmt.Printf("  Source:      %v\n", node["source_file"])
		fmt.Printf("  Confidence:  %.0f%%\n", toFloat(node["confidence"])*100)

		// Fetch dependencies
		depResp, err := apiGet(fmt.Sprintf("/api/v1/workspaces/default/graph/nodes/%s/dependencies?depth=1", nodeID))
		if err == nil {
			defer depResp.Body.Close()
			var subgraph map[string]any
			if json.NewDecoder(depResp.Body).Decode(&subgraph) == nil {
				if deps, ok := subgraph["nodes"].([]any); ok && len(deps) > 0 {
					fmt.Printf("\n  Dependencies (%d):\n", len(deps))
					for _, d := range deps {
						dep, _ := d.(map[string]any)
						fmt.Printf("    → %v (%v)\n", dep["name"], dep["type"])
					}
				}
			}
		}

		return nil
	},
}

// --- graph coverage ---

var graphCoverageCmd = &cobra.Command{
	Use:   "coverage",
	Short: "Show test coverage across the system graph",
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, err := apiGet("/api/v1/workspaces/default/graph/coverage")
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}

		fmt.Printf("Graph Coverage: %.1f%%\n", toFloat(result["coverage_percent"]))

		if uncovered, ok := result["uncovered_nodes"].([]any); ok && len(uncovered) > 0 {
			fmt.Printf("\nUncovered nodes (%d):\n", len(uncovered))
			for _, u := range uncovered {
				node, _ := u.(map[string]any)
				fmt.Printf("  ✗ %v (%v)\n", node["name"], node["type"])
			}
		}
		return nil
	},
}

// --- graph search ---

var graphSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search the system graph",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		query := args[0]
		resp, err := apiGet(fmt.Sprintf("/api/v1/workspaces/default/graph/search?q=%s", query))
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}

		nodes, _ := result["nodes"].([]any)
		if len(nodes) == 0 {
			fmt.Println("No results found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tTYPE\tNAME\tSERVICE")
		for _, n := range nodes {
			node, _ := n.(map[string]any)
			id := fmt.Sprintf("%v", node["id"])
			if len(id) > 8 {
				id = id[:8]
			}
			fmt.Fprintf(w, "%s\t%v\t%v\t%v\n", id, node["type"], node["name"], node["service"])
		}
		w.Flush()
		return nil
	},
}

// --- graph conflicts ---

var graphConflictsCmd = &cobra.Command{
	Use:   "conflicts",
	Short: "List merge conflicts in the graph",
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, err := apiGet("/api/v1/workspaces/default/graph/conflicts")
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}

		conflicts, _ := result["conflicts"].([]any)
		if len(conflicts) == 0 {
			fmt.Println("No conflicts found.")
			return nil
		}

		for i, c := range conflicts {
			conflict, _ := c.(map[string]any)
			fmt.Printf("%d. [%v] %v\n", i+1, conflict["type"], conflict["resolution"])
			if details, ok := conflict["details"].(map[string]any); ok {
				for k, v := range details {
					fmt.Printf("   %s: %v\n", k, v)
				}
			}
		}
		return nil
	},
}

// --- graph export ---

var graphExportFormat string

var graphExportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export graph as JSON, DOT, or Mermaid",
	RunE: func(cmd *cobra.Command, args []string) error {
		// Fetch all nodes and edges
		nodesResp, err := apiGet("/api/v1/workspaces/default/graph/nodes?limit=1000")
		if err != nil {
			return err
		}
		defer nodesResp.Body.Close()

		var nodesResult map[string]any
		if err := json.NewDecoder(nodesResp.Body).Decode(&nodesResult); err != nil {
			return err
		}

		nodes, _ := nodesResult["nodes"].([]any)

		switch strings.ToLower(graphExportFormat) {
		case "json":
			out, _ := json.MarshalIndent(nodesResult, "", "  ")
			fmt.Println(string(out))
		case "dot":
			fmt.Println("digraph SystemGraph {")
			fmt.Println("  rankdir=LR;")
			for _, n := range nodes {
				node, _ := n.(map[string]any)
				fmt.Printf("  \"%v\" [label=\"%v\\n(%v)\"];\n", node["id"], node["name"], node["type"])
			}
			fmt.Println("}")
		case "mermaid":
			fmt.Println("graph LR")
			for _, n := range nodes {
				node, _ := n.(map[string]any)
				id := fmt.Sprintf("%v", node["id"])
				if len(id) > 8 {
					id = id[:8]
				}
				fmt.Printf("  %s[\"%v\"]\n", id, node["name"])
			}
		default:
			return fmt.Errorf("unsupported format: %s (use json, dot, or mermaid)", graphExportFormat)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(graphCmd)

	graphScanCmd.Flags().StringVar(&graphScanURL, "url", "", "Remote Git URL to clone and scan")
	graphExportCmd.Flags().StringVar(&graphExportFormat, "format", "json", "Export format: json, dot, mermaid")

	graphCmd.AddCommand(graphScanCmd)
	graphCmd.AddCommand(graphStatusCmd)
	graphCmd.AddCommand(graphServicesCmd)
	graphCmd.AddCommand(graphShowCmd)
	graphCmd.AddCommand(graphCoverageCmd)
	graphCmd.AddCommand(graphSearchCmd)
	graphCmd.AddCommand(graphConflictsCmd)
	graphCmd.AddCommand(graphExportCmd)
}

// --- API helpers ---

func apiGet(path string) (*http.Response, error) {
	url := apiURL + path
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}
	return resp, nil
}

func apiPost(path string, body any) (*http.Response, error) {
	url := apiURL + path
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	resp, err := http.Post(url, "application/json", strings.NewReader(string(data)))
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(respBody))
	}
	return resp, nil
}

func toFloat(v any) float64 {
	switch f := v.(type) {
	case float64:
		return f
	case float32:
		return float64(f)
	case int:
		return float64(f)
	case json.Number:
		val, _ := f.Float64()
		return val
	default:
		return 0
	}
}
