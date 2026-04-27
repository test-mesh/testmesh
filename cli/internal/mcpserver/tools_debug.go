package mcpserver

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ---------------------------------------------------------------------------
// start_debug_session
// ---------------------------------------------------------------------------

func toolStartDebugSession(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	flowYAML, _ := args["flow_yaml"].(string)
	filePath, _ := args["file_path"].(string)
	initialBreakpoint, _ := args["initial_breakpoint"].(string)

	if flowYAML == "" && filePath == "" {
		return toolError("one of flow_yaml or file_path is required"), nil
	}

	if filePath != "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return toolError(fmt.Sprintf("failed to read file %s: %v", filePath, err)), nil
		}
		flowYAML = string(data)
	}

	body := map[string]any{
		"flow_yaml": flowYAML,
	}
	if initialBreakpoint != "" {
		body["initial_breakpoint"] = initialBreakpoint
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("POST", "/api/v1/debug/run", body)
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 && status != 201 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return toolError(fmt.Sprintf("failed to parse response: %v", err)), nil
	}

	executionID, _ := result["execution_id"].(string)
	sessionID, _ := result["id"].(string)
	state, _ := result["state"].(string)
	stepCount, _ := result["step_count"].(float64)

	var sb strings.Builder
	sb.WriteString("Debug session started.\n\n")
	if sessionID != "" {
		sb.WriteString(fmt.Sprintf("Session ID:   %s\n", sessionID))
	}
	sb.WriteString(fmt.Sprintf("Execution ID: %s\n", executionID))
	sb.WriteString(fmt.Sprintf("State:        %s\n", state))
	sb.WriteString(fmt.Sprintf("Step count:   %d\n", int(stepCount)))
	if initialBreakpoint != "" {
		sb.WriteString(fmt.Sprintf("Breakpoint:   %s\n", initialBreakpoint))
	}
	sb.WriteString("\nUse execution_id for all subsequent debug calls (get_debug_state, debug_step_over, debug_resume, debug_stop).")

	return toolContent(sb.String()), nil
}

// ---------------------------------------------------------------------------
// get_debug_state
// ---------------------------------------------------------------------------

func toolGetDebugState(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	executionID, _ := args["execution_id"].(string)
	if executionID == "" {
		return toolError("execution_id is required"), nil
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("GET", fmt.Sprintf("/api/v1/debug/sessions/%s/state", executionID), nil)
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return toolError(fmt.Sprintf("failed to parse response: %v", err)), nil
	}

	state, _ := result["state"].(string)
	currentStep, _ := result["current_step"].(string)
	variables, _ := result["variables"].(map[string]any)
	stepOutputs, _ := result["step_outputs"].(map[string]any)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("State:        %s\n", state))
	if currentStep != "" {
		sb.WriteString(fmt.Sprintf("Current step: %s\n", currentStep))
	}

	sb.WriteString("\n── Variables ──\n")
	if len(variables) == 0 {
		sb.WriteString("  (none)\n")
	} else {
		for k, v := range variables {
			sb.WriteString(fmt.Sprintf("  %s = %v\n", k, v))
		}
	}

	sb.WriteString("\n── Step Outputs ──\n")
	if len(stepOutputs) == 0 {
		sb.WriteString("  (none)\n")
	} else {
		for stepID, output := range stepOutputs {
			sb.WriteString(fmt.Sprintf("  [%s]:\n", stepID))
			if outBytes, err := json.MarshalIndent(output, "    ", "  "); err == nil {
				sb.WriteString("    ")
				sb.WriteString(string(outBytes))
				sb.WriteString("\n")
			} else {
				sb.WriteString(fmt.Sprintf("    %v\n", output))
			}
		}
	}

	return toolContent(sb.String()), nil
}

// ---------------------------------------------------------------------------
// debug_step_over
// ---------------------------------------------------------------------------

func toolDebugStepOver(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	executionID, _ := args["execution_id"].(string)
	if executionID == "" {
		return toolError("execution_id is required"), nil
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("POST", fmt.Sprintf("/api/v1/debug/sessions/%s/step-over", executionID), map[string]any{})
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 && status != 201 && status != 204 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	return toolContent(fmt.Sprintf("Step-over sent for session %s.\nCall get_debug_state to see the updated state and current step.", executionID)), nil
}

// ---------------------------------------------------------------------------
// debug_resume
// ---------------------------------------------------------------------------

func toolDebugResume(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	executionID, _ := args["execution_id"].(string)
	if executionID == "" {
		return toolError("execution_id is required"), nil
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("POST", fmt.Sprintf("/api/v1/debug/sessions/%s/resume", executionID), map[string]any{})
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 && status != 201 && status != 204 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	return toolContent(fmt.Sprintf("Resume sent for session %s.\nExecution will continue until the next breakpoint or completion.\nCall get_debug_state or list_debug_sessions to check current state.", executionID)), nil
}

// ---------------------------------------------------------------------------
// debug_stop
// ---------------------------------------------------------------------------

func toolDebugStop(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	executionID, _ := args["execution_id"].(string)
	if executionID == "" {
		return toolError("execution_id is required"), nil
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("DELETE", fmt.Sprintf("/api/v1/debug/sessions/%s", executionID), nil)
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 && status != 204 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	return toolContent(fmt.Sprintf("Debug session %s has been terminated.", executionID)), nil
}

// ---------------------------------------------------------------------------
// list_debug_sessions
// ---------------------------------------------------------------------------

func toolListDebugSessions(cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	client := newAPIClient(cfg.APIURL)
	data, status, err := client.do("GET", "/api/v1/debug/sessions", nil)
	if err != nil {
		return toolError(fmt.Sprintf("request failed: %v", err)), nil
	}
	if status != 200 {
		return toolError(fmt.Sprintf("API returned %d: %s", status, string(data))), nil
	}

	var result struct {
		Sessions []map[string]any `json:"sessions"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return toolError(fmt.Sprintf("failed to parse response: %v", err)), nil
	}

	if len(result.Sessions) == 0 {
		return toolContent("No active debug sessions."), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Active debug sessions (%d):\n\n", len(result.Sessions)))
	for i, s := range result.Sessions {
		executionID, _ := s["execution_id"].(string)
		sessionID, _ := s["id"].(string)
		state, _ := s["state"].(string)
		currentStep, _ := s["current_step"].(string)
		stepCount, _ := s["step_count"].(float64)

		sb.WriteString(fmt.Sprintf("%d. Execution ID: %s\n", i+1, executionID))
		if sessionID != "" && sessionID != executionID {
			sb.WriteString(fmt.Sprintf("   Session ID:   %s\n", sessionID))
		}
		sb.WriteString(fmt.Sprintf("   State:        %s\n", state))
		if currentStep != "" {
			sb.WriteString(fmt.Sprintf("   Current step: %s\n", currentStep))
		}
		if stepCount > 0 {
			sb.WriteString(fmt.Sprintf("   Step count:   %d\n", int(stepCount)))
		}
		sb.WriteString("\n")
	}

	return toolContent(sb.String()), nil
}
