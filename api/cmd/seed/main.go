package main

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/georgi-georgiev/testmesh/internal/shared/config"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
)

// Fixed UUIDs
var (
	seedWorkspaceID           = uuid.MustParse("aa000000-0000-0000-0000-000000000001")
	userServiceMockID         = uuid.MustParse("bb000000-0000-0000-0000-000000000001")
	orderServiceMockID        = uuid.MustParse("bb000000-0000-0000-0000-000000000002")
	paymentServiceMockID      = uuid.MustParse("bb000000-0000-0000-0000-000000000003")
	notificationServiceMockID = uuid.MustParse("bb000000-0000-0000-0000-000000000004")
)

func mockURL(id uuid.UUID) string {
	return fmt.Sprintf("http://localhost:5016/mocks/%s", id)
}

// Seed data holders for relationships
var (
	environments []models.Environment
	collections  []models.Collection
	flows        []models.Flow
	executions   []models.Execution
	mockServers  []models.MockServer
	contracts    []models.Contract
	schedules    []models.Schedule
)

func main() {
	rand.Seed(time.Now().UnixNano())

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
		cfg.Database.Host,
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.DBName,
		cfg.Database.Port,
		cfg.Database.SSLMode,
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	log.Println("🌱 Starting database seeding...")

	// Clear existing data (in reverse dependency order)
	clearData(db)

	// Phase 0: Workspace — must exist before anything that has workspace_id FK
	seedWorkspace(db)

	// Phase 1: Foundation — mock servers first so their URLs go into environments
	seedMockServers(db)
	seedEnvironments(db)
	seedCollections(db)

	// Phase 2: Core Entities
	seedFlows(db)

	// Phase 3: Execution Data
	seedExecutions(db)

	// Phase 5: Contract Testing
	seedContracts(db)

	// Phase 6: Reporting
	seedReporting(db)

	// Phase 7: AI Features
	seedAIFeatures(db)

	// Phase 8: Scheduling
	seedSchedules(db)

	// Phase 9: History
	seedRequestHistory(db)

	// Phase 10: Collaboration/Activity
	seedActivityEvents(db)

	log.Println("✅ Database seeding completed successfully!")
	printSummary()
}

func clearData(db *gorm.DB) {
	log.Println("🗑️  Clearing existing data...")

	// Delete in reverse dependency order
	tables := []string{
		"activity_events",
		"flow_comments",
		"flow_versions",
		"user_presences",
		"flows.request_history",
		"schedule_runs",
		"schedules",
		"ai.usage_stats",
		"ai.coverage_analysis",
		"ai.import_history",
		"ai.suggestions",
		"ai.generation_history",
		"reporting.step_performance",
		"reporting.reports",
		"reporting.flakiness_metrics",
		"reporting.daily_metrics",
		"contracts.breaking_changes",
		"contracts.verifications",
		"contracts.interactions",
		"contracts.contracts",
		"mocks.mock_state",
		"mocks.mock_requests",
		"mocks.mock_endpoints",
		"mocks.mock_servers",
		"executions.execution_steps",
		"executions.executions",
		"flows.flows",
		"flows.collection_items",
		"flows.collections",
		"flows.environments",
	}

	for _, table := range tables {
		db.Exec(fmt.Sprintf("DELETE FROM %s", table))
	}
}

// ============================================================================
// PHASE 1: Foundation
// ============================================================================

func seedWorkspace(db *gorm.DB) {
	log.Println("🏢 Seeding workspace...")
	ws := models.Workspace{
		ID:          seedWorkspaceID,
		Name:        "TestMesh Demo",
		Slug:        "testmesh-demo",
		Description: "Demo workspace with realistic flow data",
		Type:        models.WorkspaceTypeTeam,
		OwnerID:     uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	}
	result := db.Where("id = ?", seedWorkspaceID).FirstOrCreate(&ws)
	if result.Error != nil {
		log.Printf("  Failed to upsert workspace: %v", result.Error)
	} else {
		log.Printf("  Workspace ready: %s (%s)", ws.Name, ws.ID)
	}
}

func seedEnvironments(db *gorm.DB) {
	log.Println("📦 Seeding environments...")

	// Service mock URLs — aligned with fixed mock server IDs seeded above
	devUserURL    := mockURL(userServiceMockID)
	devOrderURL   := mockURL(orderServiceMockID)
	devPayURL     := mockURL(paymentServiceMockID)
	devNotifyURL  := mockURL(notificationServiceMockID)

	envData := []struct {
		name      string
		color     string
		isDefault bool
		variables []models.EnvironmentVariable
	}{
		{
			name:      "Development",
			color:     "#10B981",
			isDefault: true,
			variables: []models.EnvironmentVariable{
				// Service URLs pointing at local mock servers
				{Key: "USER_SERVICE_URL", Value: devUserURL, Description: "User service (mock)", Enabled: true},
				{Key: "ORDER_SERVICE_URL", Value: devOrderURL, Description: "Order service (mock)", Enabled: true},
				{Key: "PAYMENT_SERVICE_URL", Value: devPayURL, Description: "Payment service (mock)", Enabled: true},
				{Key: "NOTIFICATION_SERVICE_URL", Value: devNotifyURL, Description: "Notification service (mock)", Enabled: true},
				{Key: "TESTMESH_API_URL", Value: "http://localhost:5016", Description: "TestMesh API", Enabled: true},
				// Database
				{Key: "DB_HOST", Value: "localhost", Description: "Postgres host", Enabled: true},
				{Key: "DB_PORT", Value: "5432", Description: "Postgres port", Enabled: true},
				{Key: "DB_NAME", Value: "testmesh", Description: "Postgres database", Enabled: true},
				{Key: "DB_USER", Value: "root", Description: "Postgres user", Enabled: true},
				{Key: "DB_PASSWORD", Value: "admin", Description: "Postgres password", IsSecret: true, Enabled: true},
				{Key: "DB_DSN", Value: "postgresql://root:admin@localhost:5432/testmesh?sslmode=disable", Description: "Full Postgres DSN", IsSecret: true, Enabled: true},
				// Kafka
				{Key: "KAFKA_BROKERS", Value: "localhost:9092", Description: "Kafka broker list", Enabled: true},
				{Key: "KAFKA_GROUP_ID", Value: "testmesh-dev", Description: "Default consumer group", Enabled: true},
				// Redis
				{Key: "REDIS_URL", Value: "redis://localhost:6379", Description: "Redis connection URL", Enabled: true},
				// Auth
				{Key: "API_KEY", Value: "dev-api-key-abc123", Description: "Service API key", IsSecret: true, Enabled: true},
				{Key: "JWT_SECRET", Value: "dev-jwt-secret-xyz", Description: "JWT signing secret", IsSecret: true, Enabled: true},
				// Misc
				{Key: "TIMEOUT", Value: "30s", Description: "Default request timeout", Enabled: true},
				{Key: "DEBUG", Value: "true", Description: "Debug mode", Enabled: true},
			},
		},
		{
			name:  "Staging",
			color: "#F59E0B",
			variables: []models.EnvironmentVariable{
				{Key: "USER_SERVICE_URL", Value: "https://users.staging.example.com", Description: "User service", Enabled: true},
				{Key: "ORDER_SERVICE_URL", Value: "https://orders.staging.example.com", Description: "Order service", Enabled: true},
				{Key: "PAYMENT_SERVICE_URL", Value: "https://payments.staging.example.com", Description: "Payment service", Enabled: true},
				{Key: "NOTIFICATION_SERVICE_URL", Value: "https://notify.staging.example.com", Description: "Notification service", Enabled: true},
				{Key: "TESTMESH_API_URL", Value: "https://api.staging.testmesh.io", Enabled: true},
				{Key: "DB_HOST", Value: "staging-db.example.com", Enabled: true},
				{Key: "DB_PORT", Value: "5432", Enabled: true},
				{Key: "DB_NAME", Value: "testmesh_staging", Enabled: true},
				{Key: "DB_USER", Value: "testmesh", Enabled: true},
				{Key: "DB_PASSWORD", Value: "stg-password", IsSecret: true, Enabled: true},
				{Key: "DB_DSN", Value: "postgresql://testmesh:stg-password@staging-db.example.com:5432/testmesh_staging", IsSecret: true, Enabled: true},
				{Key: "KAFKA_BROKERS", Value: "kafka.staging.example.com:9092", Enabled: true},
				{Key: "KAFKA_GROUP_ID", Value: "testmesh-staging", Enabled: true},
				{Key: "REDIS_URL", Value: "redis://redis.staging.example.com:6379", Enabled: true},
				{Key: "API_KEY", Value: "stg-api-key-xyz", IsSecret: true, Enabled: true},
				{Key: "JWT_SECRET", Value: "stg-jwt-secret", IsSecret: true, Enabled: true},
				{Key: "TIMEOUT", Value: "15s", Enabled: true},
				{Key: "DEBUG", Value: "false", Enabled: true},
			},
		},
		{
			name:  "Production",
			color: "#EF4444",
			variables: []models.EnvironmentVariable{
				{Key: "USER_SERVICE_URL", Value: "https://users.example.com", Enabled: true},
				{Key: "ORDER_SERVICE_URL", Value: "https://orders.example.com", Enabled: true},
				{Key: "PAYMENT_SERVICE_URL", Value: "https://payments.example.com", Enabled: true},
				{Key: "NOTIFICATION_SERVICE_URL", Value: "https://notify.example.com", Enabled: true},
				{Key: "TESTMESH_API_URL", Value: "https://api.testmesh.io", Enabled: true},
				{Key: "DB_HOST", Value: "prod-db.example.com", Enabled: true},
				{Key: "DB_PORT", Value: "5432", Enabled: true},
				{Key: "DB_NAME", Value: "testmesh_prod", Enabled: true},
				{Key: "DB_USER", Value: "testmesh", Enabled: true},
				{Key: "DB_PASSWORD", Value: "prod-password", IsSecret: true, Enabled: true},
				{Key: "DB_DSN", Value: "postgresql://testmesh:prod-password@prod-db.example.com:5432/testmesh_prod?sslmode=require", IsSecret: true, Enabled: true},
				{Key: "KAFKA_BROKERS", Value: "kafka1.example.com:9092,kafka2.example.com:9092", Enabled: true},
				{Key: "KAFKA_GROUP_ID", Value: "testmesh-prod", Enabled: true},
				{Key: "REDIS_URL", Value: "redis://redis.example.com:6379", Enabled: true},
				{Key: "API_KEY", Value: "prod-api-key-secret", IsSecret: true, Enabled: true},
				{Key: "JWT_SECRET", Value: "prod-jwt-secret", IsSecret: true, Enabled: true},
				{Key: "TIMEOUT", Value: "10s", Enabled: true},
				{Key: "DEBUG", Value: "false", Enabled: true},
				{Key: "RATE_LIMIT", Value: "1000", Description: "Requests per minute", Enabled: true},
			},
		},
		{
			name:  "CI/CD",
			color: "#8B5CF6",
			variables: []models.EnvironmentVariable{
				// CI points at the same local mocks as Dev
				{Key: "USER_SERVICE_URL", Value: devUserURL, Enabled: true},
				{Key: "ORDER_SERVICE_URL", Value: devOrderURL, Enabled: true},
				{Key: "PAYMENT_SERVICE_URL", Value: devPayURL, Enabled: true},
				{Key: "NOTIFICATION_SERVICE_URL", Value: devNotifyURL, Enabled: true},
				{Key: "TESTMESH_API_URL", Value: "http://localhost:5016", Enabled: true},
				{Key: "DB_DSN", Value: "postgresql://root:admin@localhost:5432/testmesh?sslmode=disable", IsSecret: true, Enabled: true},
				{Key: "KAFKA_BROKERS", Value: "localhost:9092", Enabled: true},
				{Key: "KAFKA_GROUP_ID", Value: "testmesh-ci", Enabled: true},
				{Key: "REDIS_URL", Value: "redis://localhost:6379", Enabled: true},
				{Key: "API_KEY", Value: "ci-api-key-test", IsSecret: true, Enabled: true},
				{Key: "TIMEOUT", Value: "60s", Enabled: true},
				{Key: "PARALLEL_WORKERS", Value: "4", Enabled: true},
				{Key: "RETRY_COUNT", Value: "2", Enabled: true},
			},
		},
	}

	for _, e := range envData {
		env := models.Environment{
			ID:          uuid.New(),
			WorkspaceID: seedWorkspaceID,
			Name:        e.name,
			Description: fmt.Sprintf("%s environment configuration", e.name),
			Color:       e.color,
			IsDefault:   e.isDefault,
			Variables:   e.variables,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if err := db.Create(&env).Error; err != nil {
			log.Printf("Failed to create environment %s: %v", e.name, err)
		} else {
			environments = append(environments, env)
		}
	}
	log.Printf("  Created %d environments", len(environments))
}

func seedCollections(db *gorm.DB) {
	log.Println("📁 Seeding collections...")

	// Root collections
	rootCollections := []struct {
		name  string
		icon  string
		color string
		desc  string
	}{
		{"User API Tests", "users", "#3B82F6", "User management and authentication API tests"},
		{"Payment Gateway", "credit-card", "#10B981", "Payment processing and transaction tests"},
		{"Authentication", "lock", "#F59E0B", "OAuth, JWT, and session management tests"},
		{"E-commerce Flows", "shopping-cart", "#EC4899", "Shopping cart and checkout flow tests"},
		{"Regression Suite", "refresh-cw", "#8B5CF6", "Full regression test suite"},
	}

	for i, c := range rootCollections {
		collection := models.Collection{
			ID:          uuid.New(),
			WorkspaceID: seedWorkspaceID,
			Name:        c.name,
			Description: c.desc,
			Icon:        c.icon,
			Color:       c.color,
			SortOrder:   i,
			Variables: models.CollectionVariables{
				Global: map[string]interface{}{
					"collection_id": c.name,
				},
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := db.Create(&collection).Error; err != nil {
			log.Printf("Failed to create collection %s: %v", c.name, err)
		} else {
			collections = append(collections, collection)
		}
	}

	// Nested collections under "User API Tests"
	if len(collections) > 0 {
		parentID := collections[0].ID
		nestedCollections := []struct {
			name  string
			icon  string
			color string
		}{
			{"User CRUD", "user-plus", "#60A5FA"},
			{"Profile Management", "user-check", "#34D399"},
			{"Permissions", "shield", "#FBBF24"},
		}

		for i, c := range nestedCollections {
			collection := models.Collection{
				ID:          uuid.New(),
				WorkspaceID: seedWorkspaceID,
				Name:        c.name,
				Description: fmt.Sprintf("Nested collection for %s", c.name),
				Icon:        c.icon,
				Color:       c.color,
				ParentID:    &parentID,
				SortOrder:   i,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			if err := db.Create(&collection).Error; err != nil {
				log.Printf("Failed to create nested collection %s: %v", c.name, err)
			} else {
				collections = append(collections, collection)
			}
		}
	}

	log.Printf("  Created %d collections (5 root + 3 nested)", len(collections))
}

// ============================================================================
// PHASE 2: Core Entities
// ============================================================================

// flowFile is the YAML schema for a flow definition file.
type flowFile struct {
	Name        string         `yaml:"name"`
	Description string         `yaml:"description"`
	Suite       string         `yaml:"suite"`
	Tags        []string       `yaml:"tags"`
	Collection  string         `yaml:"collection"` // collection name, "" = no collection
	Steps       []models.Step  `yaml:"steps"`
}

// collectionIndex maps a collection name to its index in the collections slice.
func collectionIndex(name string) int {
	names := []string{
		"User API Tests", "Payment Gateway", "Authentication",
		"E-commerce Flows", "Regression Suite",
	}
	for i, n := range names {
		if n == name {
			return i
		}
	}
	return -1
}

func seedFlows(db *gorm.DB) {
	log.Println("🔄 Seeding flows...")

	// Discover flow YAML files relative to this binary's working directory.
	// The seed is run from api/ so flows/ lives at cmd/seed/flows/*.yaml.
	pattern := "cmd/seed/flows/*.yaml"
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		log.Printf("  No flow YAML files found at %s, skipping", pattern)
		return
	}
	sort.Strings(matches) // deterministic order

	for i, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("  Failed to read flow file %s: %v", path, err)
			continue
		}
		var ff flowFile
		if err := yaml.Unmarshal(data, &ff); err != nil {
			log.Printf("  Failed to parse flow file %s: %v", path, err)
			continue
		}

		def := models.FlowDefinition{
			Name:        ff.Name,
			Description: ff.Description,
			Suite:       ff.Suite,
			Tags:        ff.Tags,
			Steps:       ff.Steps,
		}
		flow := models.Flow{
			ID:          uuid.New(),
			WorkspaceID: seedWorkspaceID,
			Name:        ff.Name,
			Description: ff.Description,
			Suite:       ff.Suite,
			Tags:        ff.Tags,
			Definition:  def,
			Environment: "Development",
			SortOrder:   i,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if idx := collectionIndex(ff.Collection); idx >= 0 && idx < len(collections) {
			flow.CollectionID = &collections[idx].ID
		}
		if err := db.Create(&flow).Error; err != nil {
			log.Printf("  Failed to create flow %s: %v", ff.Name, err)
		} else {
			flows = append(flows, flow)
		}
	}
	log.Printf("  Created %d flows", len(flows))
}


// ============================================================================
// PHASE 3: Execution Data
// ============================================================================

func seedExecutions(db *gorm.DB) {
	log.Println("🏃 Seeding executions...")

	if len(flows) == 0 {
		log.Println("  No flows found, skipping executions")
		return
	}

	statuses := []models.ExecutionStatus{
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusCompleted,
		models.ExecutionStatusFailed,
		models.ExecutionStatusFailed,
		models.ExecutionStatusRunning,
	}

	envs := []string{"Development", "Staging", "Production", "CI/CD"}

	// Create 50 executions spread across flows
	for i := 0; i < 50; i++ {
		flow := flows[i%len(flows)]
		status := statuses[i%len(statuses)]
		env := envs[i%len(envs)]

		startedAt := time.Now().Add(-time.Duration(rand.Intn(720)) * time.Hour) // Last 30 days
		var finishedAt *time.Time
		duration := int64(rand.Intn(30000) + 1000) // 1-31 seconds

		totalSteps := len(flow.Definition.Steps)
		var passedSteps, failedSteps int
		var errMsg string

		switch status {
		case models.ExecutionStatusCompleted:
			finished := startedAt.Add(time.Duration(duration) * time.Millisecond)
			finishedAt = &finished
			passedSteps = totalSteps
			failedSteps = 0
		case models.ExecutionStatusFailed:
			finished := startedAt.Add(time.Duration(duration) * time.Millisecond)
			finishedAt = &finished
			failedSteps = rand.Intn(totalSteps/2) + 1
			passedSteps = totalSteps - failedSteps
			errMsg = getRandomError()
		case models.ExecutionStatusRunning:
			passedSteps = rand.Intn(totalSteps)
			failedSteps = 0
		}

		exec := models.Execution{
			ID:          uuid.New(),
			FlowID:      flow.ID,
			Status:      status,
			Environment: env,
			StartedAt:   &startedAt,
			FinishedAt:  finishedAt,
			DurationMs:  duration,
			TotalSteps:  totalSteps,
			PassedSteps: passedSteps,
			FailedSteps: failedSteps,
			Error:       errMsg,
			CreatedAt:   startedAt,
			UpdatedAt:   time.Now(),
		}

		if err := db.Create(&exec).Error; err != nil {
			log.Printf("Failed to create execution: %v", err)
			continue
		}
		executions = append(executions, exec)

		// Create execution steps
		seedExecutionSteps(db, exec, flow)
	}

	log.Printf("  Created %d executions", len(executions))
}

func seedExecutionSteps(db *gorm.DB, exec models.Execution, flow models.Flow) {
	for i, step := range flow.Definition.Steps {
		var stepStatus models.StepStatus
		var errMsg string

		// Determine step status based on execution status and position
		switch exec.Status {
		case models.ExecutionStatusCompleted:
			stepStatus = models.StepStatusCompleted
		case models.ExecutionStatusFailed:
			if i < exec.PassedSteps {
				stepStatus = models.StepStatusCompleted
			} else if i == exec.PassedSteps {
				stepStatus = models.StepStatusFailed
				errMsg = getRandomError()
			} else {
				stepStatus = models.StepStatusSkipped
			}
		case models.ExecutionStatusRunning:
			if i < exec.PassedSteps {
				stepStatus = models.StepStatusCompleted
			} else if i == exec.PassedSteps {
				stepStatus = models.StepStatusRunning
			} else {
				stepStatus = models.StepStatusPending
			}
		default:
			stepStatus = models.StepStatusPending
		}

		stepStarted := exec.StartedAt.Add(time.Duration(i*500) * time.Millisecond)
		stepDuration := int64(rand.Intn(2000) + 100)
		stepFinished := stepStarted.Add(time.Duration(stepDuration) * time.Millisecond)

		var finishedPtr *time.Time
		if stepStatus == models.StepStatusCompleted || stepStatus == models.StepStatusFailed {
			finishedPtr = &stepFinished
		}

		execStep := models.ExecutionStep{
			ID:          uuid.New(),
			ExecutionID: exec.ID,
			StepID:      step.ID,
			StepName:    step.Name,
			Action:      step.Action,
			Status:      stepStatus,
			StartedAt:   &stepStarted,
			FinishedAt:  finishedPtr,
			DurationMs:  stepDuration,
			Output: models.OutputData{
				"response": map[string]interface{}{
					"status":     200,
					"body":       map[string]interface{}{"success": true},
					"duration":   stepDuration,
					"step_index": i,
				},
			},
			ErrorMessage: errMsg,
			Attempt:      1,
			CreatedAt:    stepStarted,
			UpdatedAt:    time.Now(),
		}

		db.Create(&execStep)
	}
}

func getRandomError() string {
	errors := []string{
		"Connection timeout after 30000ms",
		"HTTP 500: Internal Server Error",
		"Assertion failed: expected status 200 but got 404",
		"JSON parse error: unexpected token at position 0",
		"Authentication failed: invalid API key",
		"Rate limit exceeded: 429 Too Many Requests",
		"Database connection failed: connection refused",
		"SSL certificate verification failed",
	}
	return errors[rand.Intn(len(errors))]
}

// ============================================================================
// PHASE 4: Mock System
// ============================================================================

func seedMockServers(db *gorm.DB) {
	log.Println("🎭 Seeding mock servers...")

	now := time.Now()
	startedAt := now.Add(-2 * time.Hour)

	type serverSpec struct {
		id        uuid.UUID
		name      string
		endpoints []endpointDef
	}

	servers := []serverSpec{
		{
			id:   userServiceMockID,
			name: "User Service Mock",
			endpoints: []endpointDef{
				{path: "/api/health", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{"status": "ok", "service": "user-service"}},
				{path: "/api/users", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"users": []interface{}{
							map[string]interface{}{"id": "user-001", "name": "Alice Smith", "email": "alice@example.com"},
							map[string]interface{}{"id": "user-002", "name": "Bob Jones", "email": "bob@example.com"},
						},
						"total": 2,
					}},
				{path: "/api/users/:id", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "name": "User {{.path.id}}",
						"email": "user-{{.path.id}}@example.com", "role": "member",
					}},
				{path: "/api/users", method: "POST", status: 201,
					bodyJSON: map[string]interface{}{
						"id": "user-new-001", "name": "{{.body.name}}",
						"email": "{{.body.email}}", "created": true,
					}},
				{path: "/api/users/:id", method: "PUT", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "name": "{{.body.name}}", "updated": true,
					}},
				{path: "/api/users/:id", method: "DELETE", status: 204,
					bodyJSON: map[string]interface{}{}},
				{path: "/api/login", method: "POST", status: 200,
					bodyJSON: map[string]interface{}{
						"token": "mock-jwt-token-abc123", "user_id": "user-001", "expires": 3600,
					}},
				{path: "/api/search", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"query": "{{.query.q}}", "results": []interface{}{}, "total": 0,
					}},
			},
		},
		{
			id:   orderServiceMockID,
			name: "Order Service Mock",
			endpoints: []endpointDef{
				{path: "/api/health", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{"status": "ok", "service": "order-service"}},
				{path: "/api/orders", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"orders": []interface{}{
							map[string]interface{}{"id": "ord-001", "user_id": "user-001", "status": "confirmed", "total": 99.98},
							map[string]interface{}{"id": "ord-002", "user_id": "user-002", "status": "shipped", "total": 149.00},
						},
						"total": 2,
					}},
				{path: "/api/orders/:id", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "status": "confirmed", "total": 99.98, "user_id": "user-001",
					}},
				{path: "/api/orders", method: "POST", status: 201,
					bodyJSON: map[string]interface{}{
						"id": "ord-new-001", "user_id": "{{.body.user_id}}",
						"total": "{{.body.total}}", "status": "pending", "created": true,
					}},
				{path: "/api/orders/:id", method: "PUT", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "status": "{{.body.status}}", "updated": true,
					}},
				{path: "/api/orders/:id", method: "DELETE", status: 200,
					bodyJSON: map[string]interface{}{"deleted": true, "id": "{{.path.id}}"}},
			},
		},
		{
			id:   paymentServiceMockID,
			name: "Payment Service Mock",
			endpoints: []endpointDef{
				{path: "/api/health", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{"status": "ok", "service": "payment-service"}},
				{path: "/api/payments", method: "POST", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "pay-new-001", "order_id": "{{.body.order_id}}",
						"amount": "{{.body.amount}}", "currency": "{{.body.currency}}",
						"status": "succeeded", "method": "{{.body.method}}",
					}},
				{path: "/api/payments/:id", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "amount": 149.99, "currency": "USD", "status": "succeeded",
					}},
				{path: "/api/payments", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"payments": []interface{}{
							map[string]interface{}{"id": "pay-001", "amount": 99.98, "status": "succeeded"},
							map[string]interface{}{"id": "pay-002", "amount": 149.99, "status": "succeeded"},
						},
						"total": 2,
					}},
				{path: "/api/refunds", method: "POST", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "ref-new-001", "payment_id": "{{.body.payment_id}}",
						"amount": "{{.body.amount}}", "status": "refunded",
					}},
			},
		},
		{
			id:   notificationServiceMockID,
			name: "Notification Service Mock",
			endpoints: []endpointDef{
				{path: "/api/health", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{"status": "ok", "service": "notification-service"}},
				{path: "/api/notifications/email", method: "POST", status: 202,
					bodyJSON: map[string]interface{}{
						"message_id": "msg-new-001", "to": "{{.body.to}}",
						"subject": "{{.body.subject}}", "status": "queued",
					}},
				{path: "/api/notifications/sms", method: "POST", status: 202,
					bodyJSON: map[string]interface{}{
						"message_id": "sms-new-001", "to": "{{.body.to}}", "status": "sent",
					}},
				{path: "/api/notifications", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"notifications": []interface{}{
							map[string]interface{}{"id": "notif-001", "type": "email", "status": "delivered"},
							map[string]interface{}{"id": "notif-002", "type": "sms", "status": "sent"},
						},
						"total": 2,
					}},
				{path: "/api/notifications/:id", method: "GET", status: 200,
					bodyJSON: map[string]interface{}{
						"id": "{{.path.id}}", "type": "email", "status": "delivered", "to": "user@example.com",
					}},
			},
		},
	}

	for _, s := range servers {
		server := models.MockServer{
			ID:        s.id,
			Name:      s.name,
			Port:      0,
			BaseURL:   mockURL(s.id),
			Status:    models.MockServerStatusRunning,
			StartedAt: &startedAt,
			CreatedAt: now,
			UpdatedAt: now,
		}

		if err := db.Create(&server).Error; err != nil {
			log.Printf("Failed to create mock server %s: %v", s.name, err)
			continue
		}
		mockServers = append(mockServers, server)

		for i, e := range s.endpoints {
			rc := models.ResponseConfig{StatusCode: e.status}
			if e.bodyText != "" {
				rc.Headers = map[string]string{"Content-Type": "text/plain"}
				rc.BodyText = e.bodyText
			} else {
				rc.Headers = map[string]string{"Content-Type": "application/json"}
				rc.BodyJSON = e.bodyJSON
			}
			endpoint := models.MockEndpoint{
				ID:             uuid.New(),
				MockServerID:   server.ID,
				Path:           e.path,
				Method:         e.method,
				MatchConfig:    e.matchConfig,
				ResponseConfig: rc,
				Priority:       i,
				CreatedAt:      now,
				UpdatedAt:      now,
			}
			db.Create(&endpoint)
		}

		seedMockRequests(db, server)
		seedMockState(db, server)
	}

	log.Printf("  Created %d mock servers", len(mockServers))
}

type endpointDef struct {
	path        string
	method      string
	status      int
	matchConfig models.MatchConfig
	bodyJSON    map[string]interface{}
	bodyText    string
}


func seedMockRequests(db *gorm.DB, server models.MockServer) {
	methods := []string{"GET", "POST", "PUT", "DELETE"}
	paths := []string{"/api/users", "/api/users/123", "/api/health", "/api/login"}

	numRequests := rand.Intn(20) + 10 // 10-30 requests
	for i := 0; i < numRequests; i++ {
		request := models.MockRequest{
			ID:           uuid.New(),
			MockServerID: server.ID,
			Method:       methods[rand.Intn(len(methods))],
			Path:         paths[rand.Intn(len(paths))],
			Headers: map[string]interface{}{
				"Content-Type":  "application/json",
				"Authorization": "Bearer mock-token",
			},
			QueryParams: map[string]interface{}{
				"page":  1,
				"limit": 10,
			},
			Body:         `{"test": true}`,
			Matched:      rand.Float32() > 0.2, // 80% matched
			ResponseCode: []int{200, 201, 400, 404, 500}[rand.Intn(5)],
			ReceivedAt:   time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
		}
		db.Create(&request)
	}
}

func seedMockState(db *gorm.DB, server models.MockServer) {
	states := []struct {
		key   string
		value map[string]interface{}
	}{
		{"user_count", map[string]interface{}{"value": 42}},
		{"last_request_time", map[string]interface{}{"value": time.Now().Format(time.RFC3339)}},
		{"request_count", map[string]interface{}{"value": rand.Intn(1000)}},
		{"active_sessions", map[string]interface{}{"value": rand.Intn(50)}},
		{"feature_flags", map[string]interface{}{"beta": true, "experimental": false}},
	}

	numStates := rand.Intn(3) + 2 // 2-5 state entries
	for i := 0; i < numStates && i < len(states); i++ {
		s := states[i]
		state := models.MockState{
			ID:           uuid.New(),
			MockServerID: server.ID,
			StateKey:     s.key,
			StateValue:   s.value,
			UpdatedAt:    time.Now(),
		}
		db.Create(&state)
	}
}

// ============================================================================
// PHASE 5: Contract Testing
// ============================================================================

func seedContracts(db *gorm.DB) {
	log.Println("📜 Seeding contracts...")

	contractData := []struct {
		consumer string
		provider string
		version  string
	}{
		{"web-client", "user-api", "1.0.0"},
		{"mobile-app", "user-api", "2.0.0"},
		{"web-client", "payment-api", "1.0.0"},
		{"checkout-service", "inventory-api", "1.5.0"},
		{"notification-service", "email-api", "3.0.0"},
		{"analytics-dashboard", "metrics-api", "2.1.0"},
	}

	for _, c := range contractData {
		contract := models.Contract{
			ID:          uuid.New(),
			Consumer:    c.consumer,
			Provider:    c.provider,
			Version:     c.version,
			PactVersion: "4.0",
			ContractData: models.ContractData{
				Consumer: models.ConsumerInfo{Name: c.consumer},
				Provider: models.ProviderInfo{Name: c.provider},
				Metadata: models.Metadata{
					PactSpecification: models.PactSpecification{Version: "4.0"},
				},
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		if err := db.Create(&contract).Error; err != nil {
			log.Printf("Failed to create contract %s -> %s: %v", c.consumer, c.provider, err)
			continue
		}
		contracts = append(contracts, contract)

		// Create interactions
		seedInteractions(db, contract)

		// Create verifications
		seedVerifications(db, contract)
	}

	// Create breaking changes between some contracts
	if len(contracts) >= 2 {
		seedBreakingChanges(db)
	}

	log.Printf("  Created %d contracts", len(contracts))
}

func seedInteractions(db *gorm.DB, contract models.Contract) {
	descriptions := []string{
		"Get user by ID",
		"Create new user",
		"Update user profile",
		"Delete user account",
		"List all users",
		"Authenticate user",
		"Get user preferences",
		"Update user settings",
		"Verify email address",
		"Reset password",
	}

	numInteractions := rand.Intn(7) + 3 // 3-10 interactions
	for i := 0; i < numInteractions && i < len(descriptions); i++ {
		interaction := models.Interaction{
			ID:            uuid.New(),
			ContractID:    contract.ID,
			Description:   descriptions[i],
			ProviderState: fmt.Sprintf("a %s exists", contract.Provider),
			Request: models.HTTPRequest{
				Method: []string{"GET", "POST", "PUT", "DELETE"}[i%4],
				Path:   fmt.Sprintf("/api/v1/%s", contract.Provider),
				Headers: map[string]interface{}{
					"Content-Type": "application/json",
				},
			},
			Response: models.HTTPResponse{
				Status: 200,
				Headers: map[string]interface{}{
					"Content-Type": "application/json",
				},
				Body: map[string]interface{}{
					"success": true,
					"data":    map[string]interface{}{},
				},
			},
			InteractionType: "http",
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		}
		db.Create(&interaction)
	}
}

func seedVerifications(db *gorm.DB, contract models.Contract) {
	statuses := []models.VerificationStatus{
		models.VerificationStatusPassed,
		models.VerificationStatusPassed,
		models.VerificationStatusFailed,
		models.VerificationStatusPending,
	}

	numVerifications := rand.Intn(2) + 2 // 2-4 verifications
	for i := 0; i < numVerifications; i++ {
		status := statuses[i%len(statuses)]
		verifiedAt := time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour)

		totalInteractions := rand.Intn(5) + 3
		passedInteractions := totalInteractions
		failedInteractions := 0
		if status == models.VerificationStatusFailed {
			failedInteractions = rand.Intn(totalInteractions/2) + 1
			passedInteractions = totalInteractions - failedInteractions
		}

		verification := models.Verification{
			ID:              uuid.New(),
			ContractID:      contract.ID,
			ProviderVersion: fmt.Sprintf("1.%d.0", i),
			Status:          status,
			VerifiedAt:      verifiedAt,
			Results: models.VerificationResults{
				TotalInteractions:  totalInteractions,
				PassedInteractions: passedInteractions,
				FailedInteractions: failedInteractions,
				Summary:            fmt.Sprintf("%d/%d interactions passed", passedInteractions, totalInteractions),
				Details: []models.InteractionResult{
					{
						InteractionID: uuid.New(),
						Description:   "Test interaction",
						Passed:        status == models.VerificationStatusPassed,
					},
				},
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		// Link some verifications to executions
		if len(executions) > 0 && rand.Float32() > 0.5 {
			execID := executions[rand.Intn(len(executions))].ID
			verification.ExecutionID = &execID
		}

		db.Create(&verification)
	}
}

func seedBreakingChanges(db *gorm.DB) {
	changeTypes := []string{"field_removed", "type_changed", "endpoint_removed"}
	severities := []models.BreakingChangeSeverity{
		models.SeverityCritical,
		models.SeverityMajor,
		models.SeverityMinor,
	}

	for i := 0; i < 3 && i+1 < len(contracts); i++ {
		breakingChange := models.BreakingChange{
			ID:            uuid.New(),
			OldContractID: contracts[i].ID,
			NewContractID: contracts[i+1].ID,
			ChangeType:    changeTypes[i],
			Severity:      severities[i],
			Description:   fmt.Sprintf("Breaking change detected: %s", changeTypes[i]),
			Details: models.ChangeDetails{
				Field:      "user.email",
				OldValue:   "string",
				NewValue:   "object",
				Impact:     "Clients expecting string will fail",
				Suggestion: "Use backwards-compatible migration",
			},
			DetectedAt: time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
			CreatedAt:  time.Now(),
		}
		db.Create(&breakingChange)
	}
}

// ============================================================================
// PHASE 6: Reporting
// ============================================================================

func seedReporting(db *gorm.DB) {
	log.Println("📊 Seeding reporting data...")

	// Daily metrics for last 30 days
	seedDailyMetrics(db)

	// Flakiness metrics
	seedFlakinessMetrics(db)

	// Reports
	seedReports(db)

	// Step performance
	seedStepPerformance(db)
}

func seedDailyMetrics(db *gorm.DB) {
	envs := []string{"Development", "Staging", "Production", "CI/CD"}

	for day := 0; day < 30; day++ {
		date := time.Now().AddDate(0, 0, -day).Truncate(24 * time.Hour)

		for _, env := range envs {
			totalExecs := rand.Intn(50) + 10
			passedExecs := int(float64(totalExecs) * (0.6 + rand.Float64()*0.35))
			failedExecs := totalExecs - passedExecs

			totalSteps := totalExecs * (rand.Intn(5) + 5)
			passedSteps := int(float64(totalSteps) * (0.7 + rand.Float64()*0.25))
			failedSteps := totalSteps - passedSteps

			metric := models.DailyMetric{
				ID:            uuid.New(),
				Date:          date,
				Environment:   env,
				TotalFlows:    len(flows),
				TotalExecs:    totalExecs,
				PassedExecs:   passedExecs,
				FailedExecs:   failedExecs,
				PassRate:      float64(passedExecs) / float64(totalExecs) * 100,
				AvgDurationMs: int64(rand.Intn(10000) + 2000),
				P50DurationMs: int64(rand.Intn(5000) + 1000),
				P95DurationMs: int64(rand.Intn(15000) + 5000),
				P99DurationMs: int64(rand.Intn(20000) + 10000),
				TotalSteps:    totalSteps,
				PassedSteps:   passedSteps,
				FailedSteps:   failedSteps,
				CreatedAt:     time.Now(),
				UpdatedAt:     time.Now(),
			}
			db.Create(&metric)
		}
	}
	log.Println("  Created 120 daily metrics (30 days × 4 environments)")
}

func seedFlakinessMetrics(db *gorm.DB) {
	if len(flows) < 5 {
		return
	}

	// Pick 5 flows to be "flaky"
	for i := 0; i < 5 && i < len(flows); i++ {
		flow := flows[i]
		totalExecs := rand.Intn(50) + 20
		passedExecs := int(float64(totalExecs) * (0.4 + rand.Float64()*0.4))
		failedExecs := totalExecs - passedExecs
		transitions := rand.Intn(totalExecs/2) + 5

		flakinessScore := float64(transitions) / float64(totalExecs)
		if flakinessScore > 1 {
			flakinessScore = 1
		}

		metric := models.FlakinessMetric{
			ID:              uuid.New(),
			FlowID:          flow.ID,
			WindowStartDate: time.Now().AddDate(0, 0, -7),
			WindowEndDate:   time.Now(),
			WindowDays:      7,
			TotalExecs:      totalExecs,
			PassedExecs:     passedExecs,
			FailedExecs:     failedExecs,
			Transitions:     transitions,
			FlakinessScore:  flakinessScore,
			IsFlaky:         flakinessScore > 0.2,
			FailurePatterns: []string{"timeout", "connection_reset", "intermittent"},
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		}
		db.Create(&metric)
	}
	log.Println("  Created 5 flakiness metrics")
}

func seedReports(db *gorm.DB) {
	reports := []struct {
		name   string
		format models.ReportFormat
		status models.ReportStatus
	}{
		{"Weekly Test Summary", models.ReportFormatHTML, models.ReportStatusCompleted},
		{"CI/CD Pipeline Report", models.ReportFormatJSON, models.ReportStatusCompleted},
		{"JUnit Integration Export", models.ReportFormatJUnit, models.ReportStatusCompleted},
		{"Monthly Performance Analysis", models.ReportFormatHTML, models.ReportStatusGenerating},
		{"Flaky Test Investigation", models.ReportFormatJSON, models.ReportStatusPending},
	}

	for _, r := range reports {
		generatedAt := time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour)
		var generatedPtr *time.Time
		if r.status == models.ReportStatusCompleted {
			generatedPtr = &generatedAt
		}

		report := models.Report{
			ID:          uuid.New(),
			Name:        r.name,
			Format:      r.format,
			Status:      r.status,
			StartDate:   time.Now().AddDate(0, 0, -30),
			EndDate:     time.Now(),
			FilePath:    fmt.Sprintf("/reports/%s.%s", r.name, r.format),
			FileSize:    int64(rand.Intn(1000000) + 10000),
			GeneratedAt: generatedPtr,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		db.Create(&report)
	}
	log.Println("  Created 5 reports")
}

func seedStepPerformance(db *gorm.DB) {
	if len(flows) == 0 {
		return
	}

	count := 0
	for _, flow := range flows {
		for i, step := range flow.Definition.Steps {
			for day := 0; day < 7; day++ {
				date := time.Now().AddDate(0, 0, -day).Truncate(24 * time.Hour)
				execCount := rand.Intn(20) + 5
				passedCount := int(float64(execCount) * (0.7 + rand.Float64()*0.3))
				failedCount := execCount - passedCount

				perf := models.StepPerformance{
					ID:             uuid.New(),
					FlowID:         flow.ID,
					StepID:         step.ID,
					StepName:       step.Name,
					Action:         step.Action,
					Date:           date,
					ExecutionCount: execCount,
					PassedCount:    passedCount,
					FailedCount:    failedCount,
					PassRate:       float64(passedCount) / float64(execCount) * 100,
					AvgDurationMs:  int64(rand.Intn(2000) + 100),
					MinDurationMs:  int64(rand.Intn(100) + 10),
					MaxDurationMs:  int64(rand.Intn(5000) + 1000),
					P50DurationMs:  int64(rand.Intn(1000) + 100),
					P95DurationMs:  int64(rand.Intn(3000) + 500),
					P99DurationMs:  int64(rand.Intn(4000) + 1000),
					CreatedAt:      time.Now(),
					UpdatedAt:      time.Now(),
				}
				db.Create(&perf)
				count++
			}

			// Only create metrics for first 3 steps per flow to avoid too much data
			if i >= 2 {
				break
			}
		}
	}
	log.Printf("  Created %d step performance records", count)
}

// ============================================================================
// PHASE 7: AI Features
// ============================================================================

func seedAIFeatures(db *gorm.DB) {
	log.Println("🤖 Seeding AI features...")

	seedGenerationHistory(db)
	seedSuggestions(db)
	seedImportHistory(db)
	seedCoverageAnalysis(db)
	seedAIUsageStats(db)
}

func seedGenerationHistory(db *gorm.DB) {
	providers := []models.AIProviderType{
		models.AIProviderAnthropic,
		models.AIProviderOpenAI,
	}
	models_list := []string{"claude-3-opus", "claude-3-sonnet", "gpt-4", "gpt-4-turbo"}
	statuses := []models.GenerationStatus{
		models.GenerationStatusCompleted,
		models.GenerationStatusCompleted,
		models.GenerationStatusCompleted,
		models.GenerationStatusFailed,
	}

	prompts := []string{
		"Generate a test flow for user authentication with OAuth2",
		"Create API tests for payment processing endpoint",
		"Build regression tests for user profile updates",
		"Generate E2E test for shopping cart checkout",
		"Create contract tests for microservice communication",
		"Build performance tests for database operations",
		"Generate smoke tests for health endpoints",
		"Create integration tests for message queue",
		"Build security tests for API authentication",
		"Generate load tests for concurrent users",
	}

	for i := 0; i < 10; i++ {
		status := statuses[i%len(statuses)]
		var flowID *uuid.UUID
		if status == models.GenerationStatusCompleted && len(flows) > 0 {
			id := flows[i%len(flows)].ID
			flowID = &id
		}

		var errMsg string
		if status == models.GenerationStatusFailed {
			errMsg = "Rate limit exceeded"
		}

		history := models.GenerationHistory{
			ID:         uuid.New(),
			Provider:   providers[i%len(providers)],
			Model:      models_list[i%len(models_list)],
			Prompt:     prompts[i],
			Status:     status,
			FlowID:     flowID,
			TokensUsed: rand.Intn(2000) + 500,
			LatencyMs:  int64(rand.Intn(5000) + 1000),
			Error:      errMsg,
			CreatedAt:  time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
			UpdatedAt:  time.Now(),
		}
		db.Create(&history)
	}
	log.Println("  Created 10 generation history records")
}

func seedSuggestions(db *gorm.DB) {
	if len(flows) == 0 || len(executions) == 0 {
		return
	}

	types := []models.SuggestionType{
		models.SuggestionTypeFix,
		models.SuggestionTypeOptimization,
		models.SuggestionTypeRetryStrategy,
		models.SuggestionTypeAssertion,
	}
	statuses := []models.SuggestionStatus{
		models.SuggestionStatusPending,
		models.SuggestionStatusAccepted,
		models.SuggestionStatusRejected,
		models.SuggestionStatusApplied,
	}

	titles := []string{
		"Add retry logic for flaky network calls",
		"Optimize assertion for faster validation",
		"Implement exponential backoff",
		"Add additional status code checks",
		"Reduce timeout for faster failure detection",
		"Add request correlation ID",
		"Implement circuit breaker pattern",
		"Add response body validation",
	}

	for i := 0; i < 8; i++ {
		flow := flows[i%len(flows)]
		exec := executions[i%len(executions)]

		suggestion := models.Suggestion{
			ID:          uuid.New(),
			FlowID:      flow.ID,
			ExecutionID: &exec.ID,
			Type:        types[i%len(types)],
			Status:      statuses[i%len(statuses)],
			Title:       titles[i],
			Description: fmt.Sprintf("AI-generated suggestion to improve test reliability: %s", titles[i]),
			Confidence:  0.7 + rand.Float64()*0.25,
			Reasoning:   "Based on analysis of recent execution failures and patterns",
			CreatedAt:   time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
			UpdatedAt:   time.Now(),
		}
		db.Create(&suggestion)
	}
	log.Println("  Created 8 suggestions")
}

func seedImportHistory(db *gorm.DB) {
	sources := []struct {
		sourceType models.ImportSourceType
		name       string
		status     models.ImportStatus
		flows      int
	}{
		{models.ImportSourceOpenAPI, "petstore-api.yaml", models.ImportStatusCompleted, 12},
		{models.ImportSourcePostman, "user-collection.json", models.ImportStatusCompleted, 8},
		{models.ImportSourcePact, "consumer-provider.json", models.ImportStatusCompleted, 5},
		{models.ImportSourceSwagger, "payment-api-v2.json", models.ImportStatusFailed, 0},
		{models.ImportSourceGraphQL, "schema.graphql", models.ImportStatusProcessing, 0},
	}

	for _, s := range sources {
		var errMsg string
		if s.status == models.ImportStatusFailed {
			errMsg = "Invalid schema format"
		}

		history := models.ImportHistory{
			ID:             uuid.New(),
			SourceType:     s.sourceType,
			SourceName:     s.name,
			Status:         s.status,
			FlowsGenerated: s.flows,
			Error:          errMsg,
			CreatedAt:      time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
			UpdatedAt:      time.Now(),
		}
		db.Create(&history)
	}
	log.Println("  Created 5 import history records")
}

func seedCoverageAnalysis(db *gorm.DB) {
	analyses := []struct {
		specType string
		name     string
		total    int
		covered  int
		status   models.CoverageStatus
	}{
		{"openapi", "User API Spec", 25, 18, models.CoverageStatusCompleted},
		{"swagger", "Payment Gateway", 15, 12, models.CoverageStatusCompleted},
		{"graphql", "E-commerce Schema", 40, 0, models.CoverageStatusAnalyzing},
	}

	for _, a := range analyses {
		var coverage float64
		if a.total > 0 {
			coverage = float64(a.covered) / float64(a.total) * 100
		}

		analysis := models.CoverageAnalysis{
			ID:               uuid.New(),
			SpecType:         models.ImportSourceType(a.specType),
			SpecName:         a.name,
			Status:           a.status,
			TotalEndpoints:   a.total,
			CoveredEndpoints: a.covered,
			CoveragePercent:  coverage,
			Results: models.CoverageResults{
				Covered: []models.EndpointCoverage{
					{Method: "GET", Path: "/api/users", Coverage: 1.0},
					{Method: "GET", Path: "/api/users/{id}", Coverage: 1.0},
					{Method: "POST", Path: "/api/auth/login", Coverage: 0.8},
				},
				Uncovered: []models.EndpointCoverage{
					{Method: "GET", Path: "/api/admin", Coverage: 0.0, MissingTests: []string{"admin access test"}},
					{Method: "GET", Path: "/api/reports", Coverage: 0.0, MissingTests: []string{"report generation test"}},
				},
			},
			CreatedAt: time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
			UpdatedAt: time.Now(),
		}
		db.Create(&analysis)
	}
	log.Println("  Created 3 coverage analysis records")
}

func seedAIUsageStats(db *gorm.DB) {
	providers := []models.AIProviderType{models.AIProviderAnthropic, models.AIProviderOpenAI}
	aiModels := map[models.AIProviderType][]string{
		models.AIProviderAnthropic: {"claude-3-opus", "claude-3-sonnet"},
		models.AIProviderOpenAI:    {"gpt-4", "gpt-4-turbo"},
	}

	for day := 0; day < 30; day++ {
		date := time.Now().AddDate(0, 0, -day).Truncate(24 * time.Hour)

		for _, provider := range providers {
			for _, model := range aiModels[provider] {
				totalRequests := rand.Intn(50) + 10
				successCount := int(float64(totalRequests) * (0.9 + rand.Float64()*0.1))
				failureCount := totalRequests - successCount

				stats := models.AIUsageStats{
					ID:            uuid.New(),
					Provider:      provider,
					Model:         model,
					Date:          date,
					TotalRequests: totalRequests,
					TotalTokens:   totalRequests * (rand.Intn(1000) + 500),
					SuccessCount:  successCount,
					FailureCount:  failureCount,
					AvgLatencyMs:  int64(rand.Intn(3000) + 500),
					CreatedAt:     time.Now(),
					UpdatedAt:     time.Now(),
				}
				db.Create(&stats)
			}
		}
	}
	log.Println("  Created 120 AI usage stats (30 days × 4 models)")
}

// ============================================================================
// PHASE 8: Scheduling
// ============================================================================

func seedSchedules(db *gorm.DB) {
	log.Println("📅 Seeding schedules...")

	if len(flows) == 0 {
		log.Println("  No flows found, skipping schedules")
		return
	}

	scheduleData := []struct {
		name     string
		cron     string
		status   models.ScheduleStatus
		timezone string
	}{
		{"Nightly Regression", "0 2 * * *", models.ScheduleStatusActive, "UTC"},
		{"Hourly Health Check", "0 * * * *", models.ScheduleStatusActive, "UTC"},
		{"Weekly Full Suite", "0 3 * * 0", models.ScheduleStatusActive, "America/New_York"},
		{"Deploy Verification", "*/15 * * * *", models.ScheduleStatusPaused, "UTC"},
		{"Monday Morning Run", "0 8 * * 1", models.ScheduleStatusActive, "Europe/London"},
		{"Pre-Release Tests", "0 18 * * 5", models.ScheduleStatusDisabled, "UTC"},
		{"Database Backup Verify", "30 4 * * *", models.ScheduleStatusActive, "UTC"},
		{"Performance Baseline", "0 6 1 * *", models.ScheduleStatusActive, "UTC"},
	}

	for i, s := range scheduleData {
		flow := flows[i%len(flows)]
		nextRun := time.Now().Add(time.Duration(rand.Intn(24)) * time.Hour)
		lastRun := time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour)

		var lastRunID *uuid.UUID
		if len(executions) > 0 {
			id := executions[i%len(executions)].ID
			lastRunID = &id
		}

		schedule := models.Schedule{
			ID:              uuid.New(),
			Name:            s.name,
			Description:     fmt.Sprintf("Scheduled run for %s", s.name),
			FlowID:          flow.ID,
			CronExpr:        s.cron,
			Timezone:        s.timezone,
			Status:          s.status,
			NotifyOnFailure: true,
			NotifyOnSuccess: false,
			NotifyEmails:    models.StringArray{"team@testmesh.io", "oncall@testmesh.io"},
			MaxRetries:      2,
			RetryDelay:      "5m",
			NextRunAt:       &nextRun,
			LastRunAt:       &lastRun,
			LastRunID:       lastRunID,
			LastRunResult:   []string{"success", "failure", "success"}[rand.Intn(3)],
			Tags:            models.StringArray{"automated", "scheduled"},
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		}

		if err := db.Create(&schedule).Error; err != nil {
			log.Printf("Failed to create schedule %s: %v", s.name, err)
			continue
		}
		schedules = append(schedules, schedule)

		// Create schedule runs
		seedScheduleRuns(db, schedule)
	}

	log.Printf("  Created %d schedules", len(schedules))
}

func seedScheduleRuns(db *gorm.DB, schedule models.Schedule) {
	statuses := []string{"completed", "completed", "completed", "failed", "skipped"}
	results := []string{"success", "success", "success", "failure", "skipped"}

	numRuns := rand.Intn(10) + 5 // 5-15 runs
	for i := 0; i < numRuns; i++ {
		scheduledAt := time.Now().Add(-time.Duration(i*24) * time.Hour)
		startedAt := scheduledAt.Add(time.Duration(rand.Intn(60)) * time.Second)
		completedAt := startedAt.Add(time.Duration(rand.Intn(300)+60) * time.Second)

		status := statuses[i%len(statuses)]
		result := results[i%len(statuses)]

		var errMsg string
		if result == "failure" {
			errMsg = "Test execution failed: assertion error"
		}

		var execID *uuid.UUID
		if len(executions) > 0 && status == "completed" {
			id := executions[rand.Intn(len(executions))].ID
			execID = &id
		}

		run := models.ScheduleRun{
			ID:          uuid.New(),
			ScheduleID:  schedule.ID,
			ExecutionID: execID,
			Status:      status,
			Result:      result,
			Error:       errMsg,
			RetryCount:  0,
			ScheduledAt: scheduledAt,
			StartedAt:   &startedAt,
			CompletedAt: &completedAt,
			Duration:    completedAt.Sub(startedAt).Milliseconds(),
			CreatedAt:   scheduledAt,
		}
		db.Create(&run)
	}
}

// ============================================================================
// PHASE 9: Request History
// ============================================================================

func seedRequestHistory(db *gorm.DB) {
	log.Println("📝 Seeding request history...")

	methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	urls := []string{
		"https://api.testmesh.io/v1/users",
		"https://api.testmesh.io/v1/users/123",
		"https://api.testmesh.io/v1/auth/login",
		"https://api.testmesh.io/v1/products",
		"https://api.testmesh.io/v1/orders",
		"https://api.testmesh.io/v1/payments",
		"https://api.testmesh.io/v1/notifications",
		"https://api.testmesh.io/v1/health",
	}
	statusCodes := []int{200, 201, 400, 401, 404, 500}

	for i := 0; i < 20; i++ {
		method := methods[rand.Intn(len(methods))]
		url := urls[rand.Intn(len(urls))]
		statusCode := statusCodes[rand.Intn(len(statusCodes))]
		duration := int64(rand.Intn(2000) + 50)

		var flowID *uuid.UUID
		if len(flows) > 0 && rand.Float32() > 0.3 {
			id := flows[rand.Intn(len(flows))].ID
			flowID = &id
		}

		var collectionID *uuid.UUID
		if len(collections) > 0 && rand.Float32() > 0.5 {
			id := collections[rand.Intn(len(collections))].ID
			collectionID = &id
		}

		var savedAt *time.Time
		if rand.Float32() > 0.7 {
			saved := time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour)
			savedAt = &saved
		}

		history := models.RequestHistory{
			ID:           uuid.New(),
			FlowID:       flowID,
			CollectionID: collectionID,
			Method:       method,
			URL:          url,
			Request: models.RequestHistoryData{
				Method: method,
				URL:    url,
				Headers: map[string]string{
					"Content-Type":  "application/json",
					"Authorization": "Bearer token123",
				},
				Body:     `{"test": true}`,
				BodyType: "json",
			},
			Response: models.ResponseHistoryData{
				StatusCode: statusCode,
				StatusText: getStatusText(statusCode),
				Headers: map[string]string{
					"Content-Type": "application/json",
				},
				Body:      `{"success": true}`,
				SizeBytes: int64(rand.Intn(5000) + 100),
				TimeMs:    duration,
			},
			StatusCode: statusCode,
			DurationMs: duration,
			SizeBytes:  int64(rand.Intn(5000) + 100),
			Tags:       []string{"api", "test"},
			SavedAt:    savedAt,
			CreatedAt:  time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour),
		}
		db.Create(&history)
	}

	log.Println("  Created 20 request history records")
}

func getStatusText(code int) string {
	texts := map[int]string{
		200: "OK",
		201: "Created",
		400: "Bad Request",
		401: "Unauthorized",
		404: "Not Found",
		500: "Internal Server Error",
	}
	if text, ok := texts[code]; ok {
		return text
	}
	return "Unknown"
}

// ============================================================================
// PHASE 10: Activity Events
// ============================================================================

func seedActivityEvents(db *gorm.DB) {
	log.Println("📢 Seeding activity events...")

	actorNames := []string{"Alice Chen", "Bob Smith", "Carol Johnson", "David Lee", "Emma Wilson"}
	actorAvatars := []string{
		"https://api.dicebear.com/7.x/avataaars/svg?seed=Alice",
		"https://api.dicebear.com/7.x/avataaars/svg?seed=Bob",
		"https://api.dicebear.com/7.x/avataaars/svg?seed=Carol",
		"https://api.dicebear.com/7.x/avataaars/svg?seed=David",
		"https://api.dicebear.com/7.x/avataaars/svg?seed=Emma",
	}

	eventTypes := []struct {
		eventType    string
		resourceType string
		description  string
	}{
		{models.EventTypeFlowCreated, "flow", "created a new flow"},
		{models.EventTypeFlowUpdated, "flow", "updated the flow"},
		{models.EventTypeFlowDeleted, "flow", "deleted the flow"},
		{models.EventTypeExecutionStarted, "execution", "started test execution"},
		{models.EventTypeExecutionCompleted, "execution", "completed test execution"},
		{models.EventTypeExecutionFailed, "execution", "execution failed"},
		{models.EventTypeCommentAdded, "comment", "added a comment"},
		{models.EventTypeCommentResolved, "comment", "resolved a comment"},
		{models.EventTypeCollectionCreated, "collection", "created a new collection"},
		{models.EventTypeCollectionUpdated, "collection", "updated the collection"},
	}

	// Create 30 activity events spread over the last 7 days
	for i := 0; i < 30; i++ {
		actorIdx := rand.Intn(len(actorNames))
		eventIdx := rand.Intn(len(eventTypes))
		event := eventTypes[eventIdx]

		// Get a resource ID based on type
		var resourceID uuid.UUID
		var resourceName string

		switch event.resourceType {
		case "flow":
			if len(flows) > 0 {
				flow := flows[rand.Intn(len(flows))]
				resourceID = flow.ID
				resourceName = flow.Name
			} else {
				resourceID = uuid.New()
				resourceName = "Sample Flow"
			}
		case "execution":
			if len(executions) > 0 {
				exec := executions[rand.Intn(len(executions))]
				resourceID = exec.ID
				if len(flows) > 0 {
					for _, f := range flows {
						if f.ID == exec.FlowID {
							resourceName = f.Name + " execution"
							break
						}
					}
				}
			} else {
				resourceID = uuid.New()
				resourceName = "Test Execution"
			}
		case "collection":
			if len(collections) > 0 {
				col := collections[rand.Intn(len(collections))]
				resourceID = col.ID
				resourceName = col.Name
			} else {
				resourceID = uuid.New()
				resourceName = "Sample Collection"
			}
		case "comment":
			if len(flows) > 0 {
				flow := flows[rand.Intn(len(flows))]
				resourceID = flow.ID
				resourceName = flow.Name
			} else {
				resourceID = uuid.New()
				resourceName = "Sample Flow"
			}
		default:
			resourceID = uuid.New()
			resourceName = "Unknown Resource"
		}

		actorID := uuid.New()
		createdAt := time.Now().Add(-time.Duration(rand.Intn(168)) * time.Hour)

		activity := models.ActivityEvent{
			ID:           uuid.New(),
			ActorID:      actorID,
			ActorName:    actorNames[actorIdx],
			ActorAvatar:  actorAvatars[actorIdx],
			EventType:    event.eventType,
			ResourceType: event.resourceType,
			ResourceID:   resourceID,
			ResourceName: resourceName,
			Description:  fmt.Sprintf("%s %s", actorNames[actorIdx], event.description),
			CreatedAt:    createdAt,
		}

		// Add some metadata for certain event types
		if event.eventType == models.EventTypeFlowUpdated {
			activity.Changes = models.JSONMap{
				"fields": []string{"name", "description", "steps"},
			}
		}
		if event.eventType == models.EventTypeExecutionCompleted {
			activity.Metadata = models.JSONMap{
				"duration_ms": rand.Intn(30000) + 1000,
				"passed":      rand.Intn(10) + 1,
				"failed":      rand.Intn(3),
			}
		}
		if event.eventType == models.EventTypeExecutionFailed {
			activity.Metadata = models.JSONMap{
				"error": "Assertion failed: expected status 200",
			}
		}

		if err := db.Create(&activity).Error; err != nil {
			log.Printf("Failed to create activity event: %v", err)
		}
	}

	log.Println("  Created 30 activity events")
}

// ============================================================================
// Summary
// ============================================================================

func printSummary() {
	summary := `
╔════════════════════════════════════════════════════════════╗
║                    SEEDING SUMMARY                         ║
╠════════════════════════════════════════════════════════════╣
║  Environments:        4                                    ║
║  Collections:         8 (5 root + 3 nested)                ║
║  Flows:               15                                   ║
║  Executions:          50                                   ║
║  Mock Servers:        5                                    ║
║  Contracts:           6                                    ║
║  Schedules:           8                                    ║
║  Daily Metrics:       120 (30 days × 4 envs)               ║
║  Flakiness Metrics:   5                                    ║
║  Reports:             5                                    ║
║  AI Generation:       10                                   ║
║  AI Suggestions:      8                                    ║
║  Import History:      5                                    ║
║  Coverage Analysis:   3                                    ║
║  AI Usage Stats:      120 (30 days × 4 models)             ║
║  Request History:     20                                   ║
║  Activity Events:     30                                   ║
╚════════════════════════════════════════════════════════════╝
`
	fmt.Println(summary)
}
