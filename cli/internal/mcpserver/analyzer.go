package mcpserver

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ServiceAnalysis holds the extracted information from a service directory.
type ServiceAnalysis struct {
	ServiceName      string            `json:"service_name"`
	Language         string            `json:"language"`
	Port             int               `json:"port"`
	BaseURL          string            `json:"base_url"`
	Endpoints        []Endpoint        `json:"endpoints"`
	Models           []Model           `json:"models"`
	KafkaTopics      []KafkaTopic      `json:"kafka_topics"`
	GRPCMethods      []GRPCMethod      `json:"grpc_methods"`
	EnvVars          []string          `json:"env_vars"`
	DBSchemas        []string          `json:"db_schemas"`
	RedisKeyPatterns []RedisKeyPattern `json:"redis_key_patterns,omitempty"`
	Dependencies     []string          `json:"dependencies"`
	Files            []string          `json:"files_analyzed"`
}

// RedisKeyPattern describes a Redis key written by a service (e.g. "user:%s").
type RedisKeyPattern struct {
	Prefix    string `json:"prefix"`     // resource prefix, e.g. "user", "product"
	KeyFormat string `json:"key_format"` // full format string, e.g. "user:%s"
	Operation string `json:"operation"`  // "string" | "list" | "hash"
}

// Endpoint represents an HTTP endpoint.
type Endpoint struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	Handler     string `json:"handler"`
	Description string `json:"description,omitempty"`
	HasBody     bool   `json:"has_body"`
	PathParams  []string `json:"path_params,omitempty"`
}

// Model represents a data model / database table.
type Model struct {
	Name       string            `json:"name"`
	Table      string            `json:"table,omitempty"`
	Fields     []string          `json:"fields"`
	FieldTypes map[string]string `json:"field_types,omitempty"` // snake_case field name → Go type
}

// KafkaTopic represents a Kafka topic used by the service.
type KafkaTopic struct {
	Name      string `json:"name"`
	Direction string `json:"direction"` // "produce" | "consume"
}

// GRPCMethod represents a gRPC service method.
type GRPCMethod struct {
	Service string `json:"service"`
	Method  string `json:"method"`
	Path    string `json:"path"` // /ServiceName/MethodName
}

// AnalyzeService scans a directory and returns a ServiceAnalysis.
func AnalyzeService(path string) (*ServiceAnalysis, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("path not found: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", abs)
	}

	a := &ServiceAnalysis{
		ServiceName: filepath.Base(abs),
		Port:        8080,
	}

	// Collect all source files.
	var goFiles, jsFiles, pyFiles []string
	_ = filepath.Walk(abs, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return nil
		}
		// Skip vendor, node_modules, .git, dist, build.
		rel, _ := filepath.Rel(abs, p)
		for _, skip := range []string{"vendor", "node_modules", ".git", "dist", "build", "__pycache__"} {
			if strings.HasPrefix(rel, skip+string(filepath.Separator)) || rel == skip {
				return filepath.SkipDir
			}
		}
		switch strings.ToLower(filepath.Ext(p)) {
		case ".go":
			goFiles = append(goFiles, p)
		case ".js", ".ts", ".jsx", ".tsx":
			jsFiles = append(jsFiles, p)
		case ".py":
			pyFiles = append(pyFiles, p)
		}
		return nil
	})

	// Determine primary language.
	switch {
	case len(goFiles) > 0:
		a.Language = "go"
		analyzeGoFiles(a, goFiles)
	case len(jsFiles) > 0:
		a.Language = "javascript"
		analyzeJSFiles(a, jsFiles)
	case len(pyFiles) > 0:
		a.Language = "python"
		analyzePyFiles(a, pyFiles)
	default:
		a.Language = "unknown"
	}

	// Deduplicate and clean up.
	a.EnvVars = unique(a.EnvVars)
	sort.Strings(a.EnvVars)
	a.DBSchemas = unique(a.DBSchemas)
	a.Dependencies = unique(a.Dependencies)

	// Set base URL from detected port.
	if a.BaseURL == "" {
		a.BaseURL = fmt.Sprintf("http://localhost:%d", a.Port)
	}

	// Record analyzed file paths (relative).
	for _, f := range append(append(goFiles, jsFiles...), pyFiles...) {
		rel, _ := filepath.Rel(abs, f)
		a.Files = append(a.Files, rel)
	}

	return a, nil
}

// ---------------------------------------------------------------------------
// Go analysis
// ---------------------------------------------------------------------------

var (
	reGinRoute      = regexp.MustCompile(`(?m)(\w+)\.(?i)(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*"([^"]+)"`)
	reGinHandler    = regexp.MustCompile(`(?m)(\w+)\.(?i)(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*"([^"]+)"\s*,\s*(\w+)`)
	reGinGroup      = regexp.MustCompile(`(?m)(\w+)\s*:?=\s*\w+\.Group\s*\(\s*"([^"]+)"`)
	rePort          = regexp.MustCompile(`(?m)[:\s""](\d{4,5})["\s]`)
	reEnvGo         = regexp.MustCompile(`os\.Getenv\s*\(\s*"([^"]+)"`)
	reViperGet      = regexp.MustCompile(`viper\.GetString\s*\(\s*"([^"]+)"`)
	reStructType    = regexp.MustCompile(`(?m)^type\s+(\w+)\s+struct\s*\{`)
	reStructField   = regexp.MustCompile(`(?m)^\s+(\w+)\s+(\S+)(?:\s+` + "`" + `[^` + "`" + `]+` + "`" + `)?`)
	// TableName: handles both `(u User)` and `(User)` receivers.
	reTableName     = regexp.MustCompile(`func\s+\(\*?(\w+)\)\s+TableName\s*\(\)\s+string`)
	reTableReturn   = regexp.MustCompile(`return\s+"([^"]+)"`)
	reKafkaTopicArg = regexp.MustCompile(`"([a-z][a-z0-9]*\.[a-z][a-z0-9.]*)"`)
	reGRPCRegister  = regexp.MustCompile(`Register(\w+)Server`)
	reGRPCMethod    = regexp.MustCompile(`func\s+\(s\s+\*\w+\)\s+(\w+)\s*\(`)
	reListenAddr    = regexp.MustCompile(`(?i)(?:listen|serve|addr|port)[^"]*"[^"]*:(\d{4,5})"`)
	rePortConst     = regexp.MustCompile(`(?i)(?:port|Port)\s*[=:]+\s*"?(\d{4,5})"?`)
	reRedisKeyFmt   = regexp.MustCompile(`key\s*:?=\s*fmt\.Sprintf\s*\(\s*"([^"]+)"`)
	reRedisSetCall  = regexp.MustCompile(`\.(?:Set|RPush|LPush|HSet|SetNX)\s*\(`)
)

func analyzeGoFiles(a *ServiceAnalysis, files []string) {
	// Track group prefixes: varName → path prefix
	groupPrefixes := map[string]string{}
	modelFields := map[string][]string{}
	modelFieldTypes := map[string]map[string]string{} // structName → fieldName → goType
	tableNames := map[string]string{}

	// First pass: collect struct fields and table names.
	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := string(content)

		// TableName method overrides — find method, then look ahead for the return value.
		tnIndexes := reTableName.FindAllStringSubmatchIndex(src, -1)
		for _, idx := range tnIndexes {
			typeName := src[idx[2]:idx[3]]
			// Look for `return "..."` within the next 200 chars after the match.
			tail := src[idx[1]:]
			if len(tail) > 200 {
				tail = tail[:200]
			}
			if rm := reTableReturn.FindStringSubmatch(tail); rm != nil {
				tableNames[typeName] = rm[1]
			}
		}

		// Struct definitions — collect fields.
		structMatches := reStructType.FindAllStringSubmatchIndex(src, -1)
		for i, sm := range structMatches {
			structName := src[sm[2]:sm[3]]
			// Find the block between { and matching }.
			start := sm[1]
			end := len(src)
			if i+1 < len(structMatches) {
				end = structMatches[i+1][0]
			}
			block := src[start:end]
			// Find closing brace.
			if idx := strings.Index(block, "}"); idx >= 0 {
				block = block[:idx]
			}
			var fields []string
			fieldTypes := map[string]string{}
			for _, fm := range reStructField.FindAllStringSubmatch(block, -1) {
				name := fm[1]
				goType := fm[2]
				if name == "" || name == "gorm" || strings.ToLower(name) == "model" {
					continue
				}
				// Skip unexported and embedded types.
				if strings.ToUpper(name[:1]) != name[:1] {
					continue
				}
				snakeName := camelToSnake(name)
				fields = append(fields, snakeName)
				fieldTypes[snakeName] = goType
			}
			if len(fields) > 0 {
				modelFields[structName] = fields
				modelFieldTypes[structName] = fieldTypes
			}
		}
	}

	// Detect DB schemas from table names.
	for _, tbl := range tableNames {
		if idx := strings.Index(tbl, "."); idx > 0 {
			a.DBSchemas = append(a.DBSchemas, tbl[:idx])
		}
	}

	// Second pass: routes, env vars, kafka, port.
	kafkaTopicsSeen := map[string]string{}

	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := string(content)
		base := filepath.Base(f)

		// Port detection (prioritize main.go).
		if base == "main.go" || strings.Contains(base, "server") {
			for _, m := range reListenAddr.FindAllStringSubmatch(src, -1) {
				if p, err := strconv.Atoi(m[1]); err == nil && p > 1024 {
					a.Port = p
				}
			}
			for _, m := range rePortConst.FindAllStringSubmatch(src, -1) {
				if p, err := strconv.Atoi(m[1]); err == nil && p > 1024 && a.Port == 8080 {
					a.Port = p
				}
			}
		}

		// Gin group prefixes.
		for _, m := range reGinGroup.FindAllStringSubmatch(src, -1) {
			groupPrefixes[m[1]] = m[2]
		}

		// Routes.
		for _, m := range reGinHandler.FindAllStringSubmatch(src, -1) {
			receiver := m[1]
			method := strings.ToUpper(m[2])
			path := resolveGroupPath(receiver, m[3], groupPrefixes)
			handler := m[4]
			ep := Endpoint{
				Method:     method,
				Path:       path,
				Handler:    handler,
				HasBody:    method == "POST" || method == "PUT" || method == "PATCH",
				PathParams: extractPathParams(path),
			}
			a.Endpoints = append(a.Endpoints, ep)
		}

		// Env vars.
		for _, m := range reEnvGo.FindAllStringSubmatch(src, -1) {
			a.EnvVars = append(a.EnvVars, m[1])
		}
		for _, m := range reViperGet.FindAllStringSubmatch(src, -1) {
			a.EnvVars = append(a.EnvVars, strings.ToUpper(strings.ReplaceAll(m[1], ".", "_")))
		}

		// Kafka topics.
		isKafkaFile := strings.Contains(strings.ToLower(f), "kafka") ||
			strings.Contains(src, "sarama") ||
			strings.Contains(src, "kafka")
		if isKafkaFile {
			// Extract all dot/dash-separated lowercase string literals — those are Kafka topic names.
			for _, m := range reKafkaTopicArg.FindAllStringSubmatch(src, -1) {
				topic := m[1]
				if isLikelyTopic(topic) {
					dir := "produce"
					if strings.Contains(strings.ToLower(src), "consumer") || strings.Contains(strings.ToLower(src), "subscribe") {
						dir = "consume"
					}
					if _, seen := kafkaTopicsSeen[topic]; !seen {
						kafkaTopicsSeen[topic] = dir
					}
				}
			}
		}

		// gRPC.
		for _, m := range reGRPCRegister.FindAllStringSubmatch(src, -1) {
			svcName := m[1]
			// Look for method implementations in the same file.
			for _, mm := range reGRPCMethod.FindAllStringSubmatch(src, -1) {
				methodName := mm[1]
				if methodName == "mustEmbedUnimplemented"+svcName+"Server" {
					continue
				}
				a.GRPCMethods = append(a.GRPCMethods, GRPCMethod{
					Service: svcName,
					Method:  methodName,
					Path:    "/" + svcName + "/" + methodName,
				})
			}
		}
	}

	for topic, dir := range kafkaTopicsSeen {
		a.KafkaTopics = append(a.KafkaTopics, KafkaTopic{Name: topic, Direction: dir})
	}

	// Build models list from structs that have table names or GORM-looking fields.
	for name, fields := range modelFields {
		if len(fields) == 0 {
			continue
		}
		// Only include if it has a table name override OR looks like a domain model.
		table := tableNames[name]
		if table == "" && !looksLikeDomainModel(fields) {
			continue
		}
		a.Models = append(a.Models, Model{
			Name:       name,
			Table:      table,
			Fields:     fields,
			FieldTypes: modelFieldTypes[name],
		})
	}
	sort.Slice(a.Models, func(i, j int) bool { return a.Models[i].Name < a.Models[j].Name })

	// Extract Redis key patterns from redis/ client files.
	a.RedisKeyPatterns = extractRedisKeys(files)
}

// extractRedisKeys scans redis client Go files and returns detected key patterns.
// It looks for `fmt.Sprintf("prefix:%s", ...)` adjacent to Redis SET/PUSH calls.
func extractRedisKeys(files []string) []RedisKeyPattern {
	seen := map[string]bool{}
	var patterns []RedisKeyPattern

	for _, f := range files {
		// Only look in files that appear to be Redis clients.
		rel := strings.ToLower(filepath.Base(f))
		dir := strings.ToLower(filepath.Base(filepath.Dir(f)))
		if dir != "redis" && !strings.Contains(rel, "redis") && !strings.Contains(rel, "cache") {
			continue
		}

		content, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := string(content)

		// Find all key format strings (e.g. "user:%s").
		for _, km := range reRedisKeyFmt.FindAllStringSubmatchIndex(src, -1) {
			fmtStr := src[km[2]:km[3]]
			// Only handle simple single-%s patterns (string keys).
			if strings.Count(fmtStr, "%") != 1 || !strings.Contains(fmtStr, "%s") {
				continue
			}
			if seen[fmtStr] {
				continue
			}

			// Determine operation type by looking at the surrounding context (±300 chars).
			start := km[0]
			ctxStart := start - 300
			if ctxStart < 0 {
				ctxStart = 0
			}
			ctxEnd := km[1] + 300
			if ctxEnd > len(src) {
				ctxEnd = len(src)
			}
			ctx := src[ctxStart:ctxEnd]

			op := "string"
			if reRedisSetCall.FindString(ctx) != "" {
				if strings.Contains(ctx, "RPush") || strings.Contains(ctx, "LPush") {
					op = "list"
				} else if strings.Contains(ctx, "HSet") {
					op = "hash"
				}
			}

			// Skip list/hash types — redis_get only works for strings.
			if op != "string" {
				continue
			}

			// Extract prefix: everything before ":%s".
			prefix := strings.TrimSuffix(fmtStr, ":%s")
			if strings.Contains(prefix, ":") || strings.Contains(prefix, "%") {
				// Complex key pattern with multiple segments — skip.
				continue
			}

			seen[fmtStr] = true
			patterns = append(patterns, RedisKeyPattern{
				Prefix:    prefix,
				KeyFormat: fmtStr,
				Operation: op,
			})
		}
	}
	return patterns
}

// ---------------------------------------------------------------------------
// JS/TS analysis
// ---------------------------------------------------------------------------

var (
	reExpressRoute = regexp.MustCompile(`(?m)(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]`)
	reEnvJS        = regexp.MustCompile(`process\.env\.([A-Z_][A-Z0-9_]*)`)
	rePortJS       = regexp.MustCompile(`(?i)(?:port|PORT)\s*[=:]+\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?(\d{4,5})`)
)

func analyzeJSFiles(a *ServiceAnalysis, files []string) {
	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := string(content)

		for _, m := range reExpressRoute.FindAllStringSubmatch(src, -1) {
			method := strings.ToUpper(m[1])
			path := m[2]
			a.Endpoints = append(a.Endpoints, Endpoint{
				Method:     method,
				Path:       path,
				HasBody:    method == "POST" || method == "PUT" || method == "PATCH",
				PathParams: extractPathParams(path),
			})
		}

		for _, m := range reEnvJS.FindAllStringSubmatch(src, -1) {
			a.EnvVars = append(a.EnvVars, m[1])
		}

		for _, m := range rePortJS.FindAllStringSubmatch(src, -1) {
			if p, err := strconv.Atoi(m[1]); err == nil && p > 1024 {
				a.Port = p
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Python analysis
// ---------------------------------------------------------------------------

var (
	reFlaskRoute  = regexp.MustCompile(`@(?:app|bp)\.route\s*\(\s*['"]([^'"]+)['"](?:[^)]*methods\s*=\s*\[([^\]]+)\])?`)
	reFastAPI     = regexp.MustCompile(`@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]`)
	reEnvPy       = regexp.MustCompile(`os\.(?:environ\.get|getenv)\s*\(\s*['"]([^'"]+)['"]`)
	rePortPy      = regexp.MustCompile(`(?i)port\s*=\s*(\d{4,5})`)
)

func analyzePyFiles(a *ServiceAnalysis, files []string) {
	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := string(content)

		// Flask routes.
		for _, m := range reFlaskRoute.FindAllStringSubmatch(src, -1) {
			path := m[1]
			methods := []string{"GET"}
			if m[2] != "" {
				methods = nil
				for _, mth := range strings.Split(m[2], ",") {
					mth = strings.Trim(strings.TrimSpace(mth), `'"`)
					if mth != "" {
						methods = append(methods, strings.ToUpper(mth))
					}
				}
			}
			for _, method := range methods {
				a.Endpoints = append(a.Endpoints, Endpoint{
					Method:     method,
					Path:       path,
					HasBody:    method == "POST" || method == "PUT" || method == "PATCH",
					PathParams: extractPathParams(path),
				})
			}
		}

		// FastAPI routes.
		for _, m := range reFastAPI.FindAllStringSubmatch(src, -1) {
			method := strings.ToUpper(m[1])
			path := m[2]
			a.Endpoints = append(a.Endpoints, Endpoint{
				Method:     method,
				Path:       path,
				HasBody:    method == "POST" || method == "PUT" || method == "PATCH",
				PathParams: extractPathParams(path),
			})
		}

		for _, m := range reEnvPy.FindAllStringSubmatch(src, -1) {
			a.EnvVars = append(a.EnvVars, m[1])
		}
		for _, m := range rePortPy.FindAllStringSubmatch(src, -1) {
			if p, err := strconv.Atoi(m[1]); err == nil && p > 1024 {
				a.Port = p
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Workspace analysis
// ---------------------------------------------------------------------------

// ServiceDependency describes a detected dependency between two services.
type ServiceDependency struct {
	From   string `json:"from"`   // source service name
	To     string `json:"to"`     // target service name
	Via    string `json:"via"`    // "http" | "kafka"
	Detail string `json:"detail"` // env var name (http) or topic name (kafka)
}

// WorkspaceAnalysis holds analysis results for a multi-service directory.
type WorkspaceAnalysis struct {
	RootDir      string              `json:"root_dir"`
	Services     []*ServiceAnalysis  `json:"services"`
	Dependencies []ServiceDependency `json:"dependencies"`
}

// AnalyzeWorkspace scans a directory for services and detects cross-service dependencies.
func AnalyzeWorkspace(dir string) (*WorkspaceAnalysis, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("path not found: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", abs)
	}

	wa := &WorkspaceAnalysis{RootDir: abs}

	// Walk only top-level subdirectories.
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	skipDirs := map[string]bool{
		"vendor": true, "node_modules": true, "dist": true, "build": true,
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") || skipDirs[name] {
			continue
		}
		subPath := filepath.Join(abs, name)
		if !looksLikeService(subPath) {
			continue
		}
		svc, err := AnalyzeService(subPath)
		if err != nil {
			continue
		}
		wa.Services = append(wa.Services, svc)
	}

	wa.Dependencies = append(wa.Dependencies, detectHTTPDeps(wa.Services)...)
	wa.Dependencies = append(wa.Dependencies, detectKafkaDeps(wa.Services)...)

	return wa, nil
}

// looksLikeService returns true if the directory looks like a runnable service.
func looksLikeService(dir string) bool {
	candidates := []string{"main.go", "package.json", "requirements.txt", "app.py", "main.py"}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(dir, c)); err == nil {
			return true
		}
	}
	return false
}

var reServiceURLEnv = regexp.MustCompile(`([A-Z][A-Z0-9]*)_SERVICE_URL`)

// detectHTTPDeps detects HTTP service-to-service dependencies via env vars.
func detectHTTPDeps(services []*ServiceAnalysis) []ServiceDependency {
	var deps []ServiceDependency
	seen := map[string]bool{}

	for _, svc := range services {
		for _, envVar := range svc.EnvVars {
			m := reServiceURLEnv.FindStringSubmatch(envVar)
			if m == nil {
				continue
			}
			prefix := strings.ToLower(strings.ReplaceAll(m[1], "_", "-"))
			// Try to match against known services.
			var matched *ServiceAnalysis
			for _, other := range services {
				if other.ServiceName == svc.ServiceName {
					continue
				}
				otherNorm := strings.ToLower(strings.ReplaceAll(other.ServiceName, "_", "-"))
				if otherNorm == prefix+"-service" || otherNorm == prefix || otherNorm == strings.ReplaceAll(prefix, "-", "_") {
					matched = other
					break
				}
			}
			if matched == nil {
				continue
			}
			key := svc.ServiceName + "->" + matched.ServiceName
			if seen[key] {
				continue
			}
			seen[key] = true
			deps = append(deps, ServiceDependency{
				From:   svc.ServiceName,
				To:     matched.ServiceName,
				Via:    "http",
				Detail: envVar,
			})
		}
	}
	return deps
}

// detectKafkaDeps detects producer→consumer relationships via shared topic names.
func detectKafkaDeps(services []*ServiceAnalysis) []ServiceDependency {
	var deps []ServiceDependency

	// Build map: topic → producing services.
	producers := map[string][]*ServiceAnalysis{}
	for _, svc := range services {
		for _, kt := range svc.KafkaTopics {
			if kt.Direction == "produce" {
				producers[kt.Name] = append(producers[kt.Name], svc)
			}
		}
	}

	for _, svc := range services {
		for _, kt := range svc.KafkaTopics {
			if kt.Direction != "consume" {
				continue
			}
			for _, prod := range producers[kt.Name] {
				if prod.ServiceName == svc.ServiceName {
					continue
				}
				deps = append(deps, ServiceDependency{
					From:   prod.ServiceName,
					To:     svc.ServiceName,
					Via:    "kafka",
					Detail: kt.Name,
				})
			}
		}
	}
	return deps
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func resolveGroupPath(receiver, routePath string, groups map[string]string) string {
	if prefix, ok := groups[receiver]; ok {
		return strings.TrimRight(prefix, "/") + "/" + strings.TrimLeft(routePath, "/")
	}
	if strings.HasPrefix(routePath, "/") {
		return routePath
	}
	return "/" + routePath
}

func extractPathParams(path string) []string {
	var params []string
	parts := strings.Split(path, "/")
	for _, p := range parts {
		if strings.HasPrefix(p, ":") {
			params = append(params, p[1:])
		} else if strings.HasPrefix(p, "{") && strings.HasSuffix(p, "}") {
			params = append(params, p[1:len(p)-1])
		}
	}
	return params
}

func isLikelyTopic(s string) bool {
	if len(s) < 3 || len(s) > 100 {
		return false
	}
	// Topics usually contain dots, underscores, or hyphens.
	return strings.ContainsAny(s, "._-") || strings.ToLower(s) == s
}

func looksLikeDomainModel(fields []string) bool {
	for _, f := range fields {
		if f == "id" || f == "created_at" || f == "updated_at" {
			return true
		}
	}
	return false
}

func camelToSnake(s string) string {
	runes := []rune(s)
	var result []rune
	for i, r := range runes {
		if i > 0 && r >= 'A' && r <= 'Z' {
			prev := runes[i-1]
			// Insert underscore when:
			// - previous char was lowercase (camelCase boundary): userID → user_id
			// - previous char was uppercase AND next char is lowercase (acronym end): HTMLParser → html_parser
			insertUnderscore := prev >= 'a' && prev <= 'z'
			if !insertUnderscore && i+1 < len(runes) {
				next := runes[i+1]
				insertUnderscore = prev >= 'A' && prev <= 'Z' && next >= 'a' && next <= 'z'
			}
			if insertUnderscore {
				result = append(result, '_')
			}
		}
		result = append(result, []rune(strings.ToLower(string(r)))...)
	}
	return string(result)
}

func unique(ss []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range ss {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
