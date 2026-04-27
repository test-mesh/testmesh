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
	"time"

	"github.com/spf13/cobra"
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
- UI actions (step/stop) sync to this console in real-time

Commands available during debug:
  n, next      - Execute next step
  c, continue  - Continue until next breakpoint
  v, vars      - Print all variables
  p, print     - Print variable value (p <var>)
  b, break     - Set breakpoint (b <step-id>)
  l, list      - List all breakpoints
  h, help      - Show this help
  q, quit      - Stop debugging`,
	Args: cobra.ExactArgs(1),
	RunE: debugFlow,
}

func init() {
	rootCmd.AddCommand(debugCmd)
	debugCmd.Flags().StringVarP(&debugBreakpoint, "break", "b", "", "Initial breakpoint (step ID)")
}

// debugSessionState holds the execution ID and last known state from the API.
type debugSessionState struct {
	ID          string                 `json:"id"`
	ExecutionID string                 `json:"execution_id"`
	State       string                 `json:"state"`
	CurrentStep string                 `json:"current_step"`
	Variables   map[string]interface{} `json:"variables"`
	StepOutputs map[string]interface{} `json:"step_outputs"`
	StepCount   int                    `json:"step_count"`
}

func debugFlow(cmd *cobra.Command, args []string) error {
	flowPath := args[0]

	data, err := os.ReadFile(flowPath)
	if err != nil {
		return fmt.Errorf("failed to read flow: %w", err)
	}

	fmt.Println("🔍 Starting debug session...")
	fmt.Printf("   Flow: %s\n", flowPath)
	fmt.Println()

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
		apiURL+"/api/v1/debug/run",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server at %s — is the API running?\n   %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error: %s", string(body))
	}

	var session debugSessionState
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	execID := session.ExecutionID
	fmt.Printf("Session:     %s\n", session.ID)
	fmt.Printf("Execution:   %s\n", execID)
	fmt.Printf("State:       %s\n", session.State)
	fmt.Println()
	printDebugHelp()
	fmt.Println()

	// --- Channels ---

	type inputLine struct {
		text string
		err  error
	}
	type stateUpdate struct {
		state *debugSessionState
	}

	inputCh := make(chan inputLine)
	updateCh := make(chan stateUpdate, 1)
	stopPollCh := make(chan struct{})

	// Goroutine: read stdin lines
	go func() {
		reader := bufio.NewReader(os.Stdin)
		for {
			line, err := reader.ReadString('\n')
			inputCh <- inputLine{strings.TrimSpace(line), err}
			if err != nil {
				return
			}
		}
	}()

	// Goroutine: poll session state, send only on change
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		var lastStep, lastState string
		for {
			select {
			case <-stopPollCh:
				return
			case <-ticker.C:
				s, err := fetchDebugState(execID)
				if err != nil {
					continue
				}
				if s.State != lastState || s.CurrentStep != lastStep {
					lastState = s.State
					lastStep = s.CurrentStep
					select {
					case updateCh <- stateUpdate{s}:
					default: // drop if consumer is busy
					}
				}
			}
		}
	}()
	defer close(stopPollCh)

	// clearLine overwrites the current terminal line (e.g. "(debug) " prompt) so
	// background updates print cleanly above it.
	clearLine := func() { fmt.Print("\r\033[2K") }
	prompt := func() { fmt.Print("(debug) ") }

	// Print initial state (already paused at first step)
	if init, err := fetchDebugState(execID); err == nil && init.State == "paused" {
		fmt.Printf("\n⏸  Paused at step: %s\n", init.CurrentStep)
	}
	prompt()

	for {
		select {

		// --- Background state update from UI or execution progress ---
		case upd := <-updateCh:
			clearLine()
			switch upd.state.State {
			case "paused":
				fmt.Printf("⏸  Paused at step: %s\n", upd.state.CurrentStep)
			case "terminated":
				fmt.Printf("✅ Execution finished\n")
				prompt()
				return nil
			case "idle":
				fmt.Printf("✅ Execution idle\n")
				prompt()
				return nil
			case "running", "stepping":
				fmt.Printf("▶  Running: %s\n", upd.state.CurrentStep)
			}
			prompt()

		// --- User input ---
		case in := <-inputCh:
			if in.err != nil {
				return nil
			}
			if in.text == "" {
				prompt()
				continue
			}

			parts := strings.Fields(in.text)
			command := strings.ToLower(parts[0])

			switch command {
			case "n", "next":
				if err := debugAction(execID, "step-over"); err != nil {
					fmt.Printf("Error: %v\n", err)
				}
				// Background poller will show the next pause within ~1s.
				// Brief wait so user doesn't immediately fire another n before state settles.
				waitForPaused(execID, 3*time.Second)

			case "c", "continue":
				if err := debugAction(execID, "resume"); err != nil {
					fmt.Printf("Error: %v\n", err)
				}
				fmt.Println("  continuing…")

			case "v", "vars":
				s, err := fetchDebugState(execID)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
				} else {
					fmt.Println("Variables:")
					if len(s.Variables) == 0 {
						fmt.Println("  (none)")
					}
					for name, val := range s.Variables {
						printVariable(name, val)
					}
				}

			case "p", "print":
				if len(parts) < 2 {
					fmt.Println("Usage: p <variable>")
					prompt()
					continue
				}
				s, err := fetchDebugState(execID)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
				} else {
					varName := parts[1]
					if val, ok := s.Variables[varName]; ok {
						printVariable(varName, val)
					} else {
						fmt.Printf("Variable '%s' not found\n", varName)
					}
				}

			case "b", "break":
				if len(parts) < 2 {
					fmt.Println("Usage: b <step-id>")
					prompt()
					continue
				}
				stepID := parts[1]
				if err := addBreakpoint(execID, stepID); err != nil {
					fmt.Printf("Error: %v\n", err)
				} else {
					fmt.Printf("Breakpoint set at '%s'\n", stepID)
				}

			case "l", "list":
				bps, err := listBreakpoints(execID)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
				} else {
					fmt.Println("Breakpoints:")
					if len(bps) == 0 {
						fmt.Println("  (none)")
					}
					for i, bp := range bps {
						enabled := "enabled"
						if e, ok := bp["enabled"].(bool); ok && !e {
							enabled = "disabled"
						}
						fmt.Printf("  %d: %v (%s)\n", i+1, bp["step_id"], enabled)
					}
				}

			case "h", "help":
				printDebugHelp()

			case "q", "quit", "exit":
				fmt.Println("Ending debug session…")
				debugAction(execID, "stop")
				return nil

			default:
				fmt.Printf("Unknown command: %s (type 'h' for help)\n", command)
			}

			prompt()
		}
	}
}

// waitForPaused polls until the session reaches a stable state or timeout.
// Used after n/step-over to let the executor settle before the next command.
func waitForPaused(executionID string, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(150 * time.Millisecond)
		state, err := fetchDebugState(executionID)
		if err != nil {
			return
		}
		switch state.State {
		case "paused", "terminated", "idle":
			return
		}
	}
}

func fetchDebugState(executionID string) (*debugSessionState, error) {
	resp, err := http.Get(apiURL + "/api/v1/debug/sessions/" + executionID + "/state")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server error (%d): %s", resp.StatusCode, string(body))
	}
	var state debugSessionState
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		return nil, err
	}
	return &state, nil
}

func debugAction(executionID, action string) error {
	resp, err := http.Post(
		apiURL+"/api/v1/debug/sessions/"+executionID+"/"+action,
		"application/json",
		bytes.NewBufferString("{}"),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

func addBreakpoint(executionID, stepID string) error {
	body, _ := json.Marshal(map[string]string{"step_id": stepID, "type": "step"})
	resp, err := http.Post(
		apiURL+"/api/v1/debug/sessions/"+executionID+"/breakpoints",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error (%d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func listBreakpoints(executionID string) ([]map[string]interface{}, error) {
	resp, err := http.Get(apiURL + "/api/v1/debug/sessions/" + executionID + "/breakpoints")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result struct {
		Breakpoints []map[string]interface{} `json:"breakpoints"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Breakpoints, nil
}

func printVariable(name string, value interface{}) {
	jsonVal, _ := json.MarshalIndent(value, "  ", "  ")
	fmt.Printf("  %s = %s\n", name, string(jsonVal))
}

func printDebugHelp() {
	fmt.Println("Commands:")
	fmt.Println("  n, next      Execute next step")
	fmt.Println("  c, continue  Continue to next breakpoint")
	fmt.Println("  v, vars      List all variables")
	fmt.Println("  p, print     Print variable (p <var>)")
	fmt.Println("  b, break     Set breakpoint (b <step-id>)")
	fmt.Println("  l, list      List breakpoints")
	fmt.Println("  h, help      Show this help")
	fmt.Println("  q, quit      End debug session")
}
