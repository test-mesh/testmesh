package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "testmesh-agent",
	Short: "TestMesh Agent — runs flows inside your network, reports results to the cloud",
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(versionCmd)
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print agent version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("testmesh-agent v0.1.0")
		os.Exit(0)
	},
}
