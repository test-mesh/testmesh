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
)

var (
	chatContext string
)

var chatCmd = &cobra.Command{
	Use:   "chat",
	Short: "Conversational test creation with AI",
	Long: `Start an interactive AI-powered conversation to create and run tests.

Examples:
  testmesh chat
  testmesh chat --context api-spec.yaml

The AI assistant can help you:
- Create test flows from natural language descriptions
- Debug failing tests
- Generate assertions
- Explain test results
- Suggest improvements`,
	RunE: startChat,
}

func init() {
	rootCmd.AddCommand(chatCmd)
	chatCmd.Flags().StringVarP(&chatContext, "context", "c", "", "Context file (OpenAPI spec, existing flow, etc.)")
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	Reply     string `json:"reply"`
	FlowYAML  string `json:"flow_yaml,omitempty"`
	Action    string `json:"action,omitempty"`
	Execution struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	} `json:"execution,omitempty"`
}

func startChat(cmd *cobra.Command, args []string) error {
	fmt.Println("🤖 TestMesh AI Assistant")
	fmt.Println("   Type your request in natural language.")
	fmt.Println("   Commands: /run, /save <file>, /clear, /help, /quit")
	fmt.Println()

	// Load context if provided
	var contextData string
	if chatContext != "" {
		data, err := os.ReadFile(chatContext)
		if err != nil {
			fmt.Printf("Warning: Could not load context file: %v\n", err)
		} else {
			contextData = string(data)
			fmt.Printf("📄 Loaded context: %s\n\n", chatContext)
		}
	}

	reader := bufio.NewReader(os.Stdin)
	history := []ChatMessage{}
	var lastFlowYAML string

	for {
		fmt.Print("You: ")
		input, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				fmt.Println("\nGoodbye!")
				return nil
			}
			return err
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}

		// Handle commands
		if strings.HasPrefix(input, "/") {
			parts := strings.Fields(input)
			command := strings.ToLower(parts[0])

			switch command {
			case "/quit", "/exit", "/q":
				fmt.Println("Goodbye!")
				return nil

			case "/clear":
				history = []ChatMessage{}
				fmt.Println("🗑️  Conversation cleared")
				continue

			case "/help":
				printChatHelp()
				continue

			case "/run":
				if lastFlowYAML == "" {
					fmt.Println("No flow to run. Ask me to create a test first.")
					continue
				}
				fmt.Println("\n▶️  Running flow...")
				if err := executeFlowYAML(lastFlowYAML); err != nil {
					fmt.Printf("❌ Error: %v\n", err)
				}
				continue

			case "/save":
				if lastFlowYAML == "" {
					fmt.Println("No flow to save. Ask me to create a test first.")
					continue
				}
				filename := "flow.yaml"
				if len(parts) > 1 {
					filename = parts[1]
				}
				if !strings.HasSuffix(filename, ".yaml") {
					filename += ".yaml"
				}
				if err := os.WriteFile(filename, []byte(lastFlowYAML), 0644); err != nil {
					fmt.Printf("❌ Error: %v\n", err)
				} else {
					fmt.Printf("💾 Saved to %s\n", filename)
				}
				continue

			case "/show":
				if lastFlowYAML == "" {
					fmt.Println("No flow generated yet.")
				} else {
					fmt.Println("\n```yaml")
					fmt.Println(lastFlowYAML)
					fmt.Println("```")
				}
				continue

			default:
				fmt.Printf("Unknown command: %s\n", command)
				printChatHelp()
				continue
			}
		}

		// Add message to history
		history = append(history, ChatMessage{
			Role:    "user",
			Content: input,
		})

		// Send to AI
		response, err := sendChatMessage(history, contextData)
		if err != nil {
			fmt.Printf("❌ Error: %v\n\n", err)
			continue
		}

		// Display response
		fmt.Printf("\n🤖 Assistant: %s\n", response.Reply)

		// Show generated flow if any
		if response.FlowYAML != "" {
			lastFlowYAML = response.FlowYAML
			fmt.Println("\n```yaml")
			// Show first 20 lines with truncation
			lines := strings.Split(response.FlowYAML, "\n")
			maxLines := 20
			if len(lines) > maxLines {
				for _, line := range lines[:maxLines] {
					fmt.Println(line)
				}
				fmt.Printf("... (%d more lines)\n", len(lines)-maxLines)
			} else {
				fmt.Print(response.FlowYAML)
			}
			fmt.Println("```")
			fmt.Println("\nUse /run to execute, /save <file> to save, or /show for full YAML")
		}

		// Handle auto-execution
		if response.Execution.ID != "" {
			icon := "✅"
			if response.Execution.Status != "passed" {
				icon = "❌"
			}
			fmt.Printf("\n%s Execution %s: %s\n", icon, response.Execution.ID[:8], response.Execution.Status)
		}

		// Add assistant response to history
		history = append(history, ChatMessage{
			Role:    "assistant",
			Content: response.Reply,
		})

		fmt.Println()
	}
}

func sendChatMessage(history []ChatMessage, context string) (*ChatResponse, error) {
	reqBody := map[string]interface{}{
		"messages": history,
	}
	if context != "" {
		reqBody["context"] = context
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	resp, err := http.Post(
		apiURL+"/api/v1/ai/chat",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server error: %s", string(body))
	}

	var response ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &response, nil
}

func executeFlowYAML(flowYAML string) error {
	reqBody := map[string]interface{}{
		"flow_yaml": flowYAML,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	resp, err := http.Post(
		apiURL+"/api/v1/flows/execute",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("execution failed: %s", string(body))
	}

	var result struct {
		Status   string `json:"status"`
		Duration int64  `json:"duration_ms"`
		Steps    []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"steps"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	// Print results
	icon := "✅"
	if result.Status != "passed" {
		icon = "❌"
	}
	fmt.Printf("\n%s %s (%dms)\n", icon, result.Status, result.Duration)

	for _, step := range result.Steps {
		stepIcon := "✓"
		if step.Status != "passed" {
			stepIcon = "✗"
		}
		fmt.Printf("  %s %s\n", stepIcon, step.Name)
	}

	return nil
}

func printChatHelp() {
	fmt.Println("\nCommands:")
	fmt.Println("  /run          Execute the last generated flow")
	fmt.Println("  /save <file>  Save flow to file (default: flow.yaml)")
	fmt.Println("  /show         Show full generated YAML")
	fmt.Println("  /clear        Clear conversation history")
	fmt.Println("  /help         Show this help")
	fmt.Println("  /quit         Exit chat")
	fmt.Println()
	fmt.Println("Example requests:")
	fmt.Println("  \"Create a test for GET /api/users that checks status 200\"")
	fmt.Println("  \"Add authentication to the last test\"")
	fmt.Println("  \"Why did my test fail?\"")
	fmt.Println("  \"Generate tests from my OpenAPI spec\"")
	fmt.Println()
}
