package cmd

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/test-mesh/testmesh/agent/internal/connection"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
)

var (
	flagToken    string
	flagCloudURL string
	flagWorkers  int
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the agent and connect to the cloud control plane",
	Long: `Starts the TestMesh Agent. It connects outbound to the cloud control plane,
polls for flow execution jobs, runs them locally against your internal services,
and streams results back.

No inbound ports are opened. All traffic is outbound only.

Example:
  testmesh-agent start --token <your-agent-token>
  testmesh-agent start --token <token> --cloud-url https://app.testmesh.io`,
	RunE: runStart,
}

func init() {
	startCmd.Flags().StringVar(&flagToken, "token", "", "Agent token from the TestMesh dashboard (required)")
	startCmd.Flags().StringVar(&flagCloudURL, "cloud-url", "https://app.testmesh.io", "TestMesh cloud control plane URL")
	startCmd.Flags().IntVar(&flagWorkers, "workers", 4, "Number of concurrent flow executions")
	startCmd.MarkFlagRequired("token")
}

func runStart(cmd *cobra.Command, args []string) error {
	logger, err := zap.NewProduction()
	if err != nil {
		return err
	}
	defer logger.Sync()

	// Allow token from env as well
	token := flagToken
	if t := os.Getenv("AGENT_TOKEN"); t != "" {
		token = t
	}
	cloudURL := flagCloudURL
	if u := os.Getenv("CLOUD_URL"); u != "" {
		cloudURL = u
	}

	logger.Info("starting testmesh agent",
		zap.String("cloud_url", cloudURL),
		zap.Int("workers", flagWorkers),
	)

	agent := connection.NewAgent(connection.Config{
		CloudURL: cloudURL,
		Token:    token,
		Workers:  flagWorkers,
		Logger:   logger,
	})

	// Graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		logger.Info("shutting down agent")
		agent.Stop()
	}()

	if err := agent.Run(); err != nil {
		log.Fatal(err)
	}

	return nil
}
