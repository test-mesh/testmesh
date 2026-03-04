package cmd

import (
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var mockPort int

var mockCmd = &cobra.Command{
	Use:   "mock <endpoints.yaml>",
	Short: "Start a mock server",
	Long: `Start a mock HTTP server from an endpoints configuration file.

The endpoints file should define mock responses:

endpoints:
  - path: /api/users
    method: GET
    response:
      status: 200
      body:
        users: []
        
  - path: /api/users/:id
    method: GET
    response:
      status: 200
      body:
        id: ${path.id}
        name: Test User

Press Ctrl+C to stop the server.`,
	Args: cobra.ExactArgs(1),
	RunE: startMockServer,
}

func init() {
	rootCmd.AddCommand(mockCmd)
	mockCmd.Flags().IntVarP(&mockPort, "port", "p", 8080, "Port to run the mock server on")
}

type MockEndpoint struct {
	Path     string                 `yaml:"path"`
	Method   string                 `yaml:"method"`
	Response MockResponse           `yaml:"response"`
	Delay    string                 `yaml:"delay,omitempty"`
}

type MockResponse struct {
	Status  int                    `yaml:"status"`
	Headers map[string]string      `yaml:"headers,omitempty"`
	Body    interface{}            `yaml:"body,omitempty"`
}

type MockConfig struct {
	Endpoints []MockEndpoint `yaml:"endpoints"`
}

func startMockServer(cmd *cobra.Command, args []string) error {
	configPath := args[0]

	// Read config
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config: %w", err)
	}

	var config MockConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	fmt.Printf("🚀 Starting mock server on port %d\n", mockPort)
	fmt.Printf("   Config: %s\n", configPath)
	fmt.Printf("   Endpoints: %d\n", len(config.Endpoints))
	fmt.Println()

	// Print endpoints
	for _, ep := range config.Endpoints {
		fmt.Printf("   %s %s\n", ep.Method, ep.Path)
	}
	fmt.Println()
	fmt.Println("Press Ctrl+C to stop")

	// Create router
	mux := http.NewServeMux()

	// Register endpoints
	for _, endpoint := range config.Endpoints {
		ep := endpoint // Capture for closure
		mux.HandleFunc(ep.Path, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != ep.Method && ep.Method != "" {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}

			// Set headers
			for key, value := range ep.Response.Headers {
				w.Header().Set(key, value)
			}

			// Set default content type
			if w.Header().Get("Content-Type") == "" {
				w.Header().Set("Content-Type", "application/json")
			}

			// Set status
			w.WriteHeader(ep.Response.Status)

			// Write body
			if ep.Response.Body != nil {
				body, _ := yaml.Marshal(ep.Response.Body)
				w.Write(body)
			}

			fmt.Printf("← %s %s → %d\n", r.Method, r.URL.Path, ep.Response.Status)
		})
	}

	// Start server
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", mockPort),
		Handler: mux,
	}

	// Handle shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("\n👋 Stopping mock server...")
		server.Close()
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}
