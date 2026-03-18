module github.com/test-mesh/testmesh/agent

go 1.24

require (
	github.com/gorilla/websocket v1.5.3
	github.com/spf13/cobra v1.8.1
	github.com/test-mesh/testmesh v0.0.0
	go.uber.org/zap v1.27.0
)

// Use the local OSS API module so the agent shares the runner, models, and
// action handlers without duplicating code. In CI, replace with the published version.
replace github.com/test-mesh/testmesh => ../api
