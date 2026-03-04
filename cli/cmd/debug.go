package cmd

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	debugBreakpoint string
)

var debugCmd = &cobra.Command{
	Use:   "debug <flow.yaml>",
	Short: "Run a flow in interactive debug mode",
	Long: `Start an interactive debugging session for a flow.

Debug mode allows you to:
- Set breakpoints on specific steps
- Step through execution one step at a time
- Inspect variables and state at each step
- Modify variables during execution

Commands available during debug:
  n, next     - Execute next step
  c, continue - Continue until next breakpoint
  s, step     - Step into current step
  p, print    - Print variable value
  b, break    - Set breakpoint
  l, list     - List all breakpoints
  w, watch    - Watch a variable
  q, quit     - Stop debugging`,
	Args: cobra.ExactArgs(1),
	RunE: debugFlow,
}

func init() {
	rootCmd.AddCommand(debugCmd)
	debugCmd.Flags().StringVarP(&debugBreakpoint, "break", "b", "", "Initial breakpoint (step name or index)")
}

type DebugSession struct {
	SessionID   string                 `json:"session_id"`
	ExecutionID string                 `json:"execution_id"`
	State       string                 `json:"state"`
	CurrentStep int                    `json:"current_step"`
	TotalSteps  int                    `json:"total_steps"`
	StepName    string                 `json:"step_name"`
	Variables   map[string]interface{} `json:"variables"`
	Breakpoints []string               `json:"breakpoints"`
}

func debugFlow(cmd *cobra.Command, args []string) error {
	flowPath := args[0]

	// Read flow file
	data, err := os.ReadFile(flowPath)
	if err != nil {
		return fmt.Errorf("failed to read flow: %w", err)
	}

	var flow map[string]interface{}
	if err := yaml.Unmarshal(data, &flow); err != nil {
		return fmt.Errorf("failed to parse flow: %w", err)
	}

	fmt.Println("🔍 Starting debug session...")
	fmt.Printf("   Flow: %s\n", flowPath)
	fmt.Println()

	// Start debug session on server
	reqBody := map[string]interface{}{
		"flow_yaml": string(data),
	}
	if debugBreakpoint != "" {
		reqBody["initial_breakpoint"] = debugBreakpoint
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := http.Post(
		apiURL+"/api/v1/debug/sessions",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var session DebugSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Printf("Session: %s\n", session.SessionID[:8])
	fmt.Printf("Steps: %d total\n", session.TotalSteps)
	fmt.Println()
	printDebugHelp()
	fmt.Println()

	// Interactive debug loop
	reader := bufio.NewReader(os.Stdin)
	for {
		// Show current state
		if session.State == "paused" {
			fmt.Printf("\n[%d/%d] %s\n", session.CurrentStep+1, session.TotalSteps, session.StepName)
		}

		fmt.Print("(debug) ")
		input, err := reader.ReadString('\n')
		if err != nil {
			break
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}

		parts := strings.Fields(input)
		command := strings.ToLower(parts[0])

		switch command {
		case "n", "next":
			session, err = debugCommand(session.SessionID, "step-over", nil)
			if err != nil {
				fmt.Printf("Error: %v\n", err)
			}

		case "c", "continue":
			session, err = debugCommand(session.SessionID, "resume", nil)
			if err != nil {
				fmt.Printf("Error: %v\n", err)
			}

		case "p", "print":
			if len(parts) < 2 {
				fmt.Println("Usage: print <variable>")
				continue
			}
			varName := parts[1]
			if val, ok := session.Variables[varName]; ok {
				printVariable(varName, val)
			} else {
				fmt.Printf("Variable '%s' not found\n", varName)
			}

		case "v", "vars":
			fmt.Println("Variables:")
			for name, val := range session.Variables {
				printVariable(name, val)
			}

		case "b", "break":
			if len(parts) < 2 {
				fmt.Println("Usage: break <step-name>")
				continue
			}
			stepName := parts[1]
			session, err = debugCommand(session.SessionID, "add-breakpoint", map[string]interface{}{
				"step_id": stepName,
			})
			if err != nil {
				fmt.Printf("Error: %v\n", err)
			} else {
				fmt.Printf("Breakpoint set at '%s'\n", stepName)
			}

		case "l", "list":
			fmt.Println("Breakpoints:")
			if len(session.Breakpoints) == 0 {
				fmt.Println("  (none)")
			}
			for i, bp := range session.Breakpoints {
				fmt.Printf("  %d: %s\n", i+1, bp)
			}

		case "w", "watch":
			if len(parts) < 2 {
				fmt.Println("Usage: watch <variable>")
				continue
			}
			varName := parts[1]
			session, err = debugCommand(session.SessionID, "add-watch", map[string]interface{}{
				"variable": varName,
			})
			if err != nil {
				fmt.Printf("Error: %v\n", err)
			} else {
				fmt.Printf("Watching '%s'\n", varName)
			}

		case "r", "restart":
			session, err = debugCommand(session.SessionID, "restart", nil)
			if err != nil {
				fmt.Printf("Error: %v\n", err)
			} else {
				fmt.Println("Session restarted")
			}

		case "h", "help":
			printDebugHelp()

		case "q", "quit", "exit":
			fmt.Println("Ending debug session...")
			debugCommand(session.SessionID, "end", nil)
			return nil

		default:
			fmt.Printf("Unknown command: %s (type 'help' for commands)\n", command)
		}

		// Check if execution completed
		if session.State == "completed" {
			fmt.Println("\n✅ Execution completed")
			break
		} else if session.State == "failed" {
			fmt.Println("\n❌ Execution failed")
			break
		}
	}

	return nil
}

func debugCommand(sessionID, action string, params map[string]interface{}) (DebugSession, error) {
	reqBody := map[string]interface{}{
		"action": action,
	}
	if params != nil {
		for k, v := range params {
			reqBody[k] = v
		}
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return DebugSession{}, err
	}

	resp, err := http.Post(
		apiURL+"/api/v1/debug/sessions/"+sessionID+"/command",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return DebugSession{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return DebugSession{}, fmt.Errorf("server error: %s", string(body))
	}

	var session DebugSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return DebugSession{}, err
	}

	return session, nil
}

func printVariable(name string, value interface{}) {
	jsonVal, _ := json.MarshalIndent(value, "  ", "  ")
	fmt.Printf("  %s = %s\n", name, string(jsonVal))
}

func printDebugHelp() {
	fmt.Println("Commands:")
	fmt.Println("  n, next      Execute next step")
	fmt.Println("  c, continue  Continue to next breakpoint")
	fmt.Println("  p, print     Print variable (p <var>)")
	fmt.Println("  v, vars      List all variables")
	fmt.Println("  b, break     Set breakpoint (b <step>)")
	fmt.Println("  l, list      List breakpoints")
	fmt.Println("  w, watch     Watch variable (w <var>)")
	fmt.Println("  r, restart   Restart session")
	fmt.Println("  h, help      Show this help")
	fmt.Println("  q, quit      End debug session")
}
