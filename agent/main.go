package main

import (
	"log"
	"os"

	"github.com/test-mesh/testmesh/agent/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		log.Fatal(err)
		os.Exit(1)
	}
}
