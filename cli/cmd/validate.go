package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var validateCmd = &cobra.Command{
	Use:   "validate <flow.yaml>",
	Short: "Validate a flow YAML file",
	Long: `Validate a test flow definition without executing it.

Checks for:
- Valid YAML syntax and flow: root key
- Required fields (name, steps)
- Valid action types
- Required config fields per action type
- Template variable references resolve to prior output: definitions`,
	Args: cobra.ExactArgs(1),
	RunE: validateFlow,
}

func init() {
	rootCmd.AddCommand(validateCmd)
}

// validActions maps action name → required config keys
var validActions = map[string][]string{
	"http_request":          {"url"},
	"database_query":        {"connection", "query"},
	"kafka_producer":        {"brokers", "topic"},
	"kafka_consumer":        {"brokers", "topic"},
	"delay":                 {"duration"},
	"log":                   {},
	"assert":                {},
	"transform":             {},
	"condition":             {},
	"for_each":              {},
	"mock_server_start":     {},
	"mock_server_stop":      {},
	"mock_server_configure": {},
	"contract_generate":     {},
	"contract_verify":       {},
	"websocket":             {"url"},
	"grpc":                  {"host", "method"},
	"wait_for":              {},
	"db_poll":               {"connection", "query"},
	// Native plugin actions
	"redis.get":    {"key"},
	"redis.set":    {"key", "value"},
	"redis.del":    {"key"},
	"redis.exists": {"key"},
}

func validateFlow(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var flowWrapper struct {
		Flow struct {
			Name        string                   `yaml:"name"`
			Description string                   `yaml:"description"`
			Suite       string                   `yaml:"suite"`
			EnvFile     string                   `yaml:"env_file"`
			Env         map[string]string        `yaml:"env"`
			Setup       []map[string]interface{} `yaml:"setup"`
			Steps       []map[string]interface{} `yaml:"steps"`
			Teardown    []map[string]interface{} `yaml:"teardown"`
		} `yaml:"flow"`
	}

	if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}

	// Ensure flow: wrapper exists
	var raw map[string]interface{}
	_ = yaml.Unmarshal(data, &raw)
	if _, hasFlow := raw["flow"]; !hasFlow {
		return fmt.Errorf("missing 'flow:' root key — wrap your definition under 'flow:'")
	}

	flow := flowWrapper.Flow
	var errs []string

	if flow.Name == "" {
		errs = append(errs, "flow.name is required")
	}
	if len(flow.Steps) == 0 {
		errs = append(errs, "flow.steps must have at least one step")
	}

	// Track output variables defined so far for reference checking.
	// Pre-seed with variables from env: and env_file: so they don't
	// produce false-positive "not defined in any prior output" errors.
	definedVars := map[string]bool{}

	// Seed from inline env: block
	for k := range flow.Env {
		definedVars[k] = true
	}

	// Seed from env_file: — parse KEY=VALUE lines, ignore comments/blanks
	if flow.EnvFile != "" {
		envPath := flow.EnvFile
		if !filepath.IsAbs(envPath) {
			envPath = filepath.Join(filepath.Dir(filePath), envPath)
		}
		if envData, err := os.ReadFile(envPath); err == nil {
			for _, line := range strings.Split(string(envData), "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				if idx := strings.IndexByte(line, '='); idx > 0 {
					definedVars[strings.TrimSpace(line[:idx])] = true
				}
			}
		}
		// If the file can't be read, skip silently — the flow may run fine
		// in an environment where the file exists even if it's absent locally.
	}

	validateSteps := func(steps []map[string]interface{}, phase string) {
		for i, step := range steps {
			prefix := fmt.Sprintf("%s step %d", phase, i+1)

			action, ok := step["action"].(string)
			if !ok || action == "" {
				errs = append(errs, prefix+": action is required")
				continue
			}

			// Normalize action aliases
			action = strings.TrimSpace(action)

			// Check action is known
			requiredKeys, known := validActions[action]
			if !known {
				errs = append(errs, fmt.Sprintf("%s: unknown action '%s'", prefix, action))
			}

			// Add step id to prefix for clearer messages
			if id, ok := step["id"].(string); ok && id != "" {
				prefix = fmt.Sprintf("%s '%s' (%s)", phase, id, action)
			} else if name, ok := step["name"].(string); ok && name != "" {
				prefix = fmt.Sprintf("%s '%s' (%s)", phase, name, action)
			} else {
				errs = append(errs, fmt.Sprintf("%s (%s): missing 'id' field", prefix, action))
			}

			// Check required config fields
			config, _ := step["config"].(map[string]interface{})
			for _, key := range requiredKeys {
				if config == nil {
					errs = append(errs, fmt.Sprintf("%s: config is required (missing '%s')", prefix, key))
					break
				}
				v, exists := config[key]
				if !exists || v == nil || v == "" {
					errs = append(errs, fmt.Sprintf("%s: config.%s is required", prefix, key))
				}
			}

			// Check {{variable}} references in config against known defined vars
			checkTemplateRefs(config, definedVars, prefix, &errs)

			// Register output variables defined by this step
			if output, ok := step["output"].(map[string]interface{}); ok {
				for varName := range output {
					definedVars[varName] = true
				}
			}
		}
	}

	validateSteps(flow.Setup, "setup")
	validateSteps(flow.Steps, "steps")
	validateSteps(flow.Teardown, "teardown")

	// Lint for hardcoded infrastructure values (warnings, not errors)
	var warnings []string
	lintSteps(flow.Setup, "setup", &warnings)
	lintSteps(flow.Steps, "steps", &warnings)
	lintSteps(flow.Teardown, "teardown", &warnings)

	fmt.Println()
	if len(errs) > 0 {
		fmt.Printf("❌ Validation failed with %d error(s):\n\n", len(errs))
		for _, e := range errs {
			fmt.Printf("   • %s\n", e)
		}
		fmt.Println()
		return fmt.Errorf("validation failed")
	}

	fmt.Println("✅ Flow is valid")

	if len(warnings) > 0 {
		fmt.Printf("\n⚠️  %d portability warning(s):\n\n", len(warnings))
		for _, w := range warnings {
			fmt.Printf("   • %s\n", w)
		}
		fmt.Printf(`
   Fix: create a shared .env.test at your flows root and reference it with env_file:

     # flows/.env.test
     # --- Service URLs ---
     CATALOG_URL=http://localhost:5580

     # --- Database connections ---
     DB_CATALOG=postgres://root:admin@localhost:5432/catalog?sslmode=disable

     # --- Infrastructure ---
     KAFKA_BROKERS=localhost:9092
     REDIS_HOST=localhost
     REDIS_PORT=6379

     # --- Kafka topics ---
     TOPIC_UPLOAD=myapp.file.uploaded

   Then in each flow:
     flow:
       name: "..."
       env_file: ../../.env.test   # relative to this file

   Or set routing.overrides in a TestMesh Environment to inject infra config
   automatically at run time — no infra fields needed in flow YAML at all.

`)
	}
	fmt.Println()
	fmt.Printf("   Name: %s\n", flow.Name)
	if flow.Description != "" {
		fmt.Printf("   Description: %s\n", flow.Description)
	}
	if flow.Suite != "" {
		fmt.Printf("   Suite: %s\n", flow.Suite)
	}
	fmt.Printf("   Setup steps:    %d\n", len(flow.Setup))
	fmt.Printf("   Main steps:     %d\n", len(flow.Steps))
	fmt.Printf("   Teardown steps: %d\n", len(flow.Teardown))
	fmt.Println()

	if verbose {
		printStepList("Setup", flow.Setup)
		printStepList("Steps", flow.Steps)
		printStepList("Teardown", flow.Teardown)
	}

	return nil
}

// checkTemplateRefs scans config values for {{var}} references not yet defined.
func checkTemplateRefs(config map[string]interface{}, definedVars map[string]bool, prefix string, errs *[]string) {
	if config == nil {
		return
	}
	for _, v := range config {
		checkValueRefs(v, definedVars, prefix, errs)
	}
}

func checkValueRefs(v interface{}, definedVars map[string]bool, prefix string, errs *[]string) {
	switch val := v.(type) {
	case string:
		refs := extractTemplateVars(val)
		for _, ref := range refs {
			// Skip built-in variables
			if isBuiltinVar(ref) {
				continue
			}
			if !definedVars[ref] {
				*errs = append(*errs, fmt.Sprintf("%s: references '{{%s}}' but it is not defined in any prior output:", prefix, ref))
			}
		}
	case map[string]interface{}:
		for _, child := range val {
			checkValueRefs(child, definedVars, prefix, errs)
		}
	case []interface{}:
		for _, item := range val {
			checkValueRefs(item, definedVars, prefix, errs)
		}
	}
}

// extractTemplateVars extracts variable names from {{var}} patterns.
func extractTemplateVars(s string) []string {
	var vars []string
	for {
		start := strings.Index(s, "{{")
		if start == -1 {
			break
		}
		end := strings.Index(s[start:], "}}")
		if end == -1 {
			break
		}
		inner := strings.TrimSpace(s[start+2 : start+end])
		// Only simple variable names (no dots = not step.output references)
		if !strings.Contains(inner, ".") && inner != "" {
			vars = append(vars, inner)
		}
		s = s[start+end+2:]
	}
	return vars
}

var builtinVars = map[string]bool{
	"RANDOM_ID": true, "UUID": true, "TIMESTAMP": true, "ISO_TIMESTAMP": true,
	"DATE": true, "TIME": true, "DATETIME": true,
	"YEAR": true, "MONTH": true, "DAY": true, "HOUR": true, "MINUTE": true, "SECOND": true,
}

func isBuiltinVar(name string) bool {
	return builtinVars[strings.ToUpper(name)]
}

// lintSteps checks for hardcoded infrastructure values that should be env vars.
// It emits warnings (not errors) so flows still pass validation.
func lintSteps(steps []map[string]interface{}, phase string, warnings *[]string) {
	for _, step := range steps {
		id, _ := step["id"].(string)
		action, _ := step["action"].(string)
		config, _ := step["config"].(map[string]interface{})
		if config == nil {
			continue
		}
		prefix := phase
		if id != "" {
			prefix = fmt.Sprintf("%s '%s'", phase, id)
		}
		lintConfigValues(config, action, prefix, warnings)
	}
}

// lintConfigValues walks a config map and warns about hardcoded infrastructure strings.
func lintConfigValues(config map[string]interface{}, action, prefix string, warnings *[]string) {
	for key, val := range config {
		str, ok := val.(string)
		if !ok {
			continue
		}
		// Skip values that are already env var references
		if strings.HasPrefix(str, "${") || strings.HasPrefix(str, "{{") {
			continue
		}
		switch key {
		case "connection":
			// Raw DSN: starts with postgres://, mysql://, etc.
			if looksLikeDSN(str) {
				*warnings = append(*warnings, fmt.Sprintf(
					"%s: config.connection has a hardcoded DSN — use ${DB_URL} (or set via routing.overrides.%s.connection in your Environment)",
					prefix, action))
			}
		case "url":
			if strings.Contains(str, "localhost") || strings.Contains(str, "127.0.0.1") {
				*warnings = append(*warnings, fmt.Sprintf(
					"%s: config.url contains a hardcoded host — use ${BASE_URL} or a named env var",
					prefix))
			}
		case "brokers":
			if strings.Contains(str, "localhost") || strings.Contains(str, "127.0.0.1") {
				*warnings = append(*warnings, fmt.Sprintf(
					"%s: config.brokers contains a hardcoded host — use ${KAFKA_BROKERS}",
					prefix))
			}
		case "host":
			if str == "localhost" || str == "127.0.0.1" {
				*warnings = append(*warnings, fmt.Sprintf(
					"%s: config.host is hardcoded to '%s' — use ${REDIS_HOST} or similar",
					prefix, str))
			}
		}
	}
}

func looksLikeDSN(s string) bool {
	schemes := []string{"postgres://", "postgresql://", "mysql://", "mongodb://", "redis://"}
	for _, scheme := range schemes {
		if strings.HasPrefix(s, scheme) {
			return true
		}
	}
	return false
}

func printStepList(title string, steps []map[string]interface{}) {
	if len(steps) == 0 {
		return
	}
	fmt.Printf("   %s:\n", title)
	for i, step := range steps {
		action, _ := step["action"].(string)
		id, _ := step["id"].(string)
		name, _ := step["name"].(string)
		label := id
		if label == "" {
			label = name
		}
		if label == "" {
			label = fmt.Sprintf("step_%d", i+1)
		}
		fmt.Printf("   %d. %s (%s)\n", i+1, label, action)
	}
	fmt.Println()
}
