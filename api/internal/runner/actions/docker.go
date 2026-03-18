package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// DockerRunHandler starts an ephemeral container and waits for it to be ready.
// Intended for use in flow setup blocks to provision isolated infrastructure
// (databases, caches, message brokers) per test run.
//
// Config fields:
//   image           string            required  e.g. "postgres:16-alpine"
//   name            string            optional  container name; auto-generated if omitted
//   env             map[string]string optional  environment variables
//   ports           map[string]string optional  {"5432": "0"} — container:host (0 = random)
//   wait_for_port   string            optional  container port to wait for (e.g. "5432")
//   timeout         string            optional  max wait time, default "30s"
//   network         string            optional  docker network to attach to
//
// Output keys:
//   container_id    full container ID
//   container_name  resolved container name
//   host            host where ports are reachable ("localhost" on native Docker)
//   ports           map of containerPort → assigned host port
//   dsn             connection string for known images (postgres, redis, mysql, mongo)
type DockerRunHandler struct {
	logger *zap.Logger
}

// NewDockerRunHandler creates a new DockerRunHandler.
func NewDockerRunHandler(logger *zap.Logger) *DockerRunHandler {
	return &DockerRunHandler{logger: logger}
}

func (h *DockerRunHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	image, ok := config["image"].(string)
	if !ok || image == "" {
		return nil, fmt.Errorf("docker_run: image is required")
	}

	timeout := 30 * time.Second
	if ts, ok := config["timeout"].(string); ok && ts != "" {
		if d, err := time.ParseDuration(ts); err == nil {
			timeout = d
		}
	}

	// Build docker run args
	args := []string{"run", "-d"}

	if name, ok := config["name"].(string); ok && name != "" {
		args = append(args, "--name", name)
	}

	if network, ok := config["network"].(string); ok && network != "" {
		args = append(args, "--network", network)
	}

	if envMap, ok := config["env"].(map[string]interface{}); ok {
		for k, v := range envMap {
			args = append(args, "-e", fmt.Sprintf("%s=%v", k, v))
		}
	}

	if portsMap, ok := config["ports"].(map[string]interface{}); ok {
		for containerPort, hostPort := range portsMap {
			args = append(args, "-p", fmt.Sprintf("%v:%s", hostPort, containerPort))
		}
	}

	args = append(args, image)

	h.logger.Info("Starting Docker container",
		zap.String("image", image),
		zap.Strings("args", args),
	)

	out, err := exec.CommandContext(ctx, "docker", args...).Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("docker run failed: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("docker run failed: %w", err)
	}

	containerID := strings.TrimSpace(string(out))

	// Resolve container name and port bindings via docker inspect
	inspectOut, err := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{json .}}", containerID).Output()
	if err != nil {
		return nil, fmt.Errorf("docker inspect failed: %w", err)
	}

	var inspectData []map[string]interface{}
	if err := json.Unmarshal(inspectOut, &inspectData); err != nil || len(inspectData) == 0 {
		return nil, fmt.Errorf("failed to parse docker inspect output")
	}
	info := inspectData[0]

	// Extract container name (docker prepends a slash)
	containerName := ""
	if name, ok := info["Name"].(string); ok {
		containerName = strings.TrimPrefix(name, "/")
	}

	// Extract port bindings: NetworkSettings.Ports
	hostPorts := make(map[string]string)
	if ns, ok := info["NetworkSettings"].(map[string]interface{}); ok {
		if ports, ok := ns["Ports"].(map[string]interface{}); ok {
			for containerPort, bindings := range ports {
				portKey := strings.Split(containerPort, "/")[0] // strip "/tcp"
				if bindingList, ok := bindings.([]interface{}); ok && len(bindingList) > 0 {
					if binding, ok := bindingList[0].(map[string]interface{}); ok {
						if hostPort, ok := binding["HostPort"].(string); ok {
							hostPorts[portKey] = hostPort
						}
					}
				}
			}
		}
	}

	// Determine host and ports to expose depending on whether a Docker network is used.
	//
	// Networked mode (network specified):
	//   The API and the new container share a Docker network. Docker's internal DNS
	//   resolves the container name, so we return the container name as host and the
	//   raw container ports (not host-mapped). This is the correct mode when both the
	//   API server and the test target run inside Docker (e.g. docker-compose).
	//
	// Host mode (no network):
	//   The API runs natively on the host. The container's ports are bound to the host's
	//   loopback interface, so we return "localhost" and the mapped host ports. This
	//   requires the Docker CLI to be installed on the host where the API process runs.
	_, networked := config["network"].(string)

	host := "localhost"
	reachablePorts := hostPorts // host-mapped ports used in non-networked mode
	if networked {
		// In networked mode, use the container name (Docker DNS) and raw container ports.
		host = containerName
		rawPorts := make(map[string]string)
		for containerPort := range hostPorts {
			rawPorts[containerPort] = containerPort
		}
		reachablePorts = rawPorts
	}

	// Wait for a specific port to accept connections
	if waitPort, ok := config["wait_for_port"].(string); ok && waitPort != "" {
		reachPort, mapped := reachablePorts[waitPort]
		if !mapped {
			reachPort = waitPort
		}
		addr := net.JoinHostPort(host, reachPort)
		h.logger.Info("Waiting for container port", zap.String("addr", addr), zap.Duration("timeout", timeout))
		deadline := time.Now().Add(timeout)
		for {
			conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
			if err == nil {
				conn.Close()
				break
			}
			if time.Now().After(deadline) {
				// Container failed to become ready — stop and remove it
				exec.Command("docker", "rm", "-f", containerID).Run() //nolint:errcheck
				return nil, fmt.Errorf("container port %s not ready after %s", waitPort, timeout)
			}
			time.Sleep(500 * time.Millisecond)
		}
	}

	// Build a convenience DSN for known images
	dsn := buildDSN(image, host, reachablePorts, config)

	output := models.OutputData{
		"container_id":   containerID,
		"container_name": containerName,
		"host":           host,
		"ports":          reachablePorts,
		"networked":      networked,
	}
	if dsn != "" {
		output["dsn"] = dsn
	}

	h.logger.Info("Container started",
		zap.String("container_id", containerID[:12]),
		zap.String("name", containerName),
		zap.Any("ports", hostPorts),
	)

	return output, nil
}

// buildDSN constructs a connection string for well-known images.
func buildDSN(image, host string, hostPorts map[string]string, config map[string]interface{}) string {
	img := strings.ToLower(image)
	env := func(key string) string {
		if m, ok := config["env"].(map[string]interface{}); ok {
			if v, ok := m[key]; ok {
				return fmt.Sprintf("%v", v)
			}
		}
		return ""
	}

	switch {
	case strings.Contains(img, "postgres") || strings.Contains(img, "timescale"):
		port := hostPorts["5432"]
		user := env("POSTGRES_USER")
		if user == "" {
			user = "postgres"
		}
		pass := env("POSTGRES_PASSWORD")
		db := env("POSTGRES_DB")
		if db == "" {
			db = user
		}
		if port != "" {
			return fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, pass, host, port, db)
		}

	case strings.Contains(img, "redis"):
		port := hostPorts["6379"]
		pass := env("REDIS_PASSWORD")
		if port != "" {
			if pass != "" {
				return fmt.Sprintf("redis://:%s@%s:%s", pass, host, port)
			}
			return fmt.Sprintf("redis://%s:%s", host, port)
		}

	case strings.Contains(img, "mysql") || strings.Contains(img, "mariadb"):
		port := hostPorts["3306"]
		user := env("MYSQL_USER")
		if user == "" {
			user = "root"
		}
		pass := env("MYSQL_PASSWORD")
		if pass == "" {
			pass = env("MYSQL_ROOT_PASSWORD")
		}
		db := env("MYSQL_DATABASE")
		if port != "" {
			return fmt.Sprintf("mysql://%s:%s@%s:%s/%s", user, pass, host, port, db)
		}

	case strings.Contains(img, "mongo"):
		port := hostPorts["27017"]
		user := env("MONGO_INITDB_ROOT_USERNAME")
		pass := env("MONGO_INITDB_ROOT_PASSWORD")
		if port != "" {
			if user != "" {
				return fmt.Sprintf("mongodb://%s:%s@%s:%s", user, pass, host, port)
			}
			return fmt.Sprintf("mongodb://%s:%s", host, port)
		}
	}

	return ""
}

// DockerStopHandler stops and optionally removes a container.
// Intended for use in flow teardown blocks to clean up provisioned containers.
//
// Config fields:
//   container_id    string  required (use ${step_id.container_id} from docker_run output)
//   remove          bool    optional, default true — also remove the container
type DockerStopHandler struct {
	logger *zap.Logger
}

// NewDockerStopHandler creates a new DockerStopHandler.
func NewDockerStopHandler(logger *zap.Logger) *DockerStopHandler {
	return &DockerStopHandler{logger: logger}
}

func (h *DockerStopHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	containerID, ok := config["container_id"].(string)
	if !ok || containerID == "" {
		return nil, fmt.Errorf("docker_stop: container_id is required")
	}

	remove := true
	if r, ok := config["remove"].(bool); ok {
		remove = r
	}

	shortID := containerID
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}

	if remove {
		h.logger.Info("Removing Docker container", zap.String("container_id", shortID))
		out, err := exec.CommandContext(ctx, "docker", "rm", "-f", containerID).CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("docker rm failed: %s", string(out))
		}
	} else {
		h.logger.Info("Stopping Docker container", zap.String("container_id", shortID))
		out, err := exec.CommandContext(ctx, "docker", "stop", containerID).CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("docker stop failed: %s", string(out))
		}
	}

	return models.OutputData{
		"container_id": containerID,
		"removed":      remove,
	}, nil
}
