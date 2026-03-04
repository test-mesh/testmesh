package database

import (
	"fmt"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/shared/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// New creates a new database connection
func New(cfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get database instance: %w", err)
	}

	// Set connection pool settings
	sqlDB.SetMaxOpenConns(cfg.MaxConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdle)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// AutoMigrate runs database migrations
func AutoMigrate(db *gorm.DB) error {
	// Create schemas
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS flows").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS executions").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS scheduler").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS mocks").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS contracts").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS reporting").Error; err != nil {
		return err
	}
	if err := db.Exec("CREATE SCHEMA IF NOT EXISTS ai").Error; err != nil {
		return err
	}

	// Import and migrate models
	// We'll do this manually here to avoid circular dependencies
	// In production, you might want to use a proper migration tool like golang-migrate

	// Create workspaces table FIRST (other tables reference it)
	db.Exec(`
		CREATE TABLE IF NOT EXISTS workspaces (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			slug VARCHAR(255) NOT NULL UNIQUE,
			description TEXT,
			type VARCHAR(20) NOT NULL DEFAULT 'personal',
			owner_id UUID,
			settings JSONB DEFAULT '{}',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);
		CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
		CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);
		CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_at ON workspaces(deleted_at);
	`)

	// Create default workspace for existing data
	db.Exec(`
		INSERT INTO workspaces (id, name, slug, description, type, owner_id)
		VALUES (
			'00000000-0000-0000-0000-000000000001'::uuid,
			'Default Workspace',
			'default',
			'Default workspace',
			'personal',
			'00000000-0000-0000-0000-000000000001'::uuid
		)
		ON CONFLICT (id) DO NOTHING;
	`)

	// Create environments table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flows.environments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			color VARCHAR(20),
			is_default BOOLEAN DEFAULT false,
			variables JSONB DEFAULT '[]',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_environments_name ON flows.environments(name);
		CREATE INDEX IF NOT EXISTS idx_environments_deleted_at ON flows.environments(deleted_at);
		CREATE INDEX IF NOT EXISTS idx_environments_workspace_id ON flows.environments(workspace_id);
	`)

	// Add workspace_id column to existing environments table (idempotent migration)
	db.Exec(`
		ALTER TABLE flows.environments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
		CREATE INDEX IF NOT EXISTS idx_environments_workspace_id ON flows.environments(workspace_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_workspace_name ON flows.environments(workspace_id, name) WHERE deleted_at IS NULL;
	`)

	// Create collections table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flows.collections (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			icon VARCHAR(100),
			color VARCHAR(20),
			parent_id UUID REFERENCES flows.collections(id),
			sort_order INTEGER DEFAULT 0,
			variables JSONB DEFAULT '{}',
			auth JSONB DEFAULT '{}',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_collections_name ON flows.collections(name);
		CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON flows.collections(parent_id);
		CREATE INDEX IF NOT EXISTS idx_collections_deleted_at ON flows.collections(deleted_at);
		CREATE INDEX IF NOT EXISTS idx_collections_workspace_id ON flows.collections(workspace_id);
	`)

	// Add workspace_id column to existing collections table (idempotent migration)
	db.Exec(`
		ALTER TABLE flows.collections ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
		CREATE INDEX IF NOT EXISTS idx_collections_workspace_id ON flows.collections(workspace_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_workspace_name ON flows.collections(workspace_id, name) WHERE deleted_at IS NULL;
	`)

	// Create flows table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flows.flows (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			suite VARCHAR(255),
			tags TEXT[],
			definition JSONB NOT NULL,
			environment VARCHAR(50) DEFAULT 'default',
			collection_id UUID,
			sort_order INTEGER DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_flows_name ON flows.flows(name);
		CREATE INDEX IF NOT EXISTS idx_flows_suite ON flows.flows(suite);
		CREATE INDEX IF NOT EXISTS idx_flows_deleted_at ON flows.flows(deleted_at);
		CREATE INDEX IF NOT EXISTS idx_flows_collection_id ON flows.flows(collection_id);
		CREATE INDEX IF NOT EXISTS idx_flows_workspace_id ON flows.flows(workspace_id);
	`)

	// Add missing columns to existing flows table (idempotent migration)
	db.Exec(`
		ALTER TABLE flows.flows ADD COLUMN IF NOT EXISTS collection_id UUID;
		ALTER TABLE flows.flows ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
		ALTER TABLE flows.flows ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
		CREATE INDEX IF NOT EXISTS idx_flows_workspace_id ON flows.flows(workspace_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_flows_workspace_name ON flows.flows(workspace_id, name) WHERE deleted_at IS NULL;
	`)

	// Create executions table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS executions.executions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL REFERENCES flows.flows(id),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			environment VARCHAR(50) DEFAULT 'default',
			started_at TIMESTAMP WITH TIME ZONE,
			finished_at TIMESTAMP WITH TIME ZONE,
			duration_ms BIGINT,
			total_steps INTEGER DEFAULT 0,
			passed_steps INTEGER DEFAULT 0,
			failed_steps INTEGER DEFAULT 0,
			error TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_executions_flow_id ON executions.executions(flow_id);
		CREATE INDEX IF NOT EXISTS idx_executions_status ON executions.executions(status);
	`)

	// Create execution_steps table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS executions.execution_steps (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			execution_id UUID NOT NULL REFERENCES executions.executions(id) ON DELETE CASCADE,
			step_id VARCHAR(255) NOT NULL,
			step_name VARCHAR(255),
			action VARCHAR(100) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			started_at TIMESTAMP WITH TIME ZONE,
			finished_at TIMESTAMP WITH TIME ZONE,
			duration_ms BIGINT,
			output JSONB,
			error_message TEXT,
			attempt INTEGER DEFAULT 1,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON executions.execution_steps(execution_id);
	`)

	// Create mock_servers table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS mocks.mock_servers (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			execution_id UUID REFERENCES executions.executions(id),
			name VARCHAR(255) NOT NULL,
			port INTEGER NOT NULL,
			base_url VARCHAR(500) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'starting',
			started_at TIMESTAMP WITH TIME ZONE,
			stopped_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_mock_servers_execution_id ON mocks.mock_servers(execution_id);
		CREATE INDEX IF NOT EXISTS idx_mock_servers_port ON mocks.mock_servers(port);
	`)

	// Create mock_endpoints table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS mocks.mock_endpoints (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			mock_server_id UUID NOT NULL REFERENCES mocks.mock_servers(id) ON DELETE CASCADE,
			path VARCHAR(500) NOT NULL,
			method VARCHAR(10) NOT NULL,
			match_config JSONB,
			response_config JSONB NOT NULL,
			state_config JSONB,
			priority INTEGER DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_mock_endpoints_server_id ON mocks.mock_endpoints(mock_server_id);
		CREATE INDEX IF NOT EXISTS idx_mock_endpoints_path_method ON mocks.mock_endpoints(path, method);
	`)

	// Create mock_requests table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS mocks.mock_requests (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			mock_server_id UUID NOT NULL REFERENCES mocks.mock_servers(id) ON DELETE CASCADE,
			endpoint_id UUID REFERENCES mocks.mock_endpoints(id),
			method VARCHAR(10) NOT NULL,
			path VARCHAR(500) NOT NULL,
			headers JSONB,
			query_params JSONB,
			body TEXT,
			matched BOOLEAN DEFAULT false,
			response_code INTEGER,
			received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_mock_requests_server_id ON mocks.mock_requests(mock_server_id);
		CREATE INDEX IF NOT EXISTS idx_mock_requests_endpoint_id ON mocks.mock_requests(endpoint_id);
	`)

	// Create mock_state table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS mocks.mock_state (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			mock_server_id UUID NOT NULL REFERENCES mocks.mock_servers(id) ON DELETE CASCADE,
			state_key VARCHAR(255) NOT NULL,
			state_value JSONB NOT NULL,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(mock_server_id, state_key)
		);
		CREATE INDEX IF NOT EXISTS idx_mock_state_server_id ON mocks.mock_state(mock_server_id);
		CREATE INDEX IF NOT EXISTS idx_mock_state_key ON mocks.mock_state(state_key);
	`)

	// Create contracts table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS contracts.contracts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			consumer VARCHAR(255) NOT NULL,
			provider VARCHAR(255) NOT NULL,
			version VARCHAR(100) NOT NULL,
			pact_version VARCHAR(10) DEFAULT '4.0',
			contract_data JSONB NOT NULL,
			flow_id UUID REFERENCES flows.flows(id),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(consumer, provider, version)
		);
		CREATE INDEX IF NOT EXISTS idx_contracts_consumer ON contracts.contracts(consumer);
		CREATE INDEX IF NOT EXISTS idx_contracts_provider ON contracts.contracts(provider);
		CREATE INDEX IF NOT EXISTS idx_contracts_flow_id ON contracts.contracts(flow_id);
	`)

	// Create interactions table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS contracts.interactions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			contract_id UUID NOT NULL REFERENCES contracts.contracts(id) ON DELETE CASCADE,
			description TEXT NOT NULL,
			provider_state VARCHAR(500),
			request JSONB NOT NULL,
			response JSONB NOT NULL,
			interaction_type VARCHAR(50) DEFAULT 'http',
			metadata JSONB,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_interactions_contract_id ON contracts.interactions(contract_id);
	`)

	// Create verifications table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS contracts.verifications (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			contract_id UUID NOT NULL REFERENCES contracts.contracts(id) ON DELETE CASCADE,
			provider_version VARCHAR(100) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			results JSONB NOT NULL,
			execution_id UUID REFERENCES executions.executions(id),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_verifications_contract_id ON contracts.verifications(contract_id);
		CREATE INDEX IF NOT EXISTS idx_verifications_execution_id ON contracts.verifications(execution_id);
		CREATE INDEX IF NOT EXISTS idx_verifications_status ON contracts.verifications(status);
	`)

	// Create breaking_changes table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS contracts.breaking_changes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			old_contract_id UUID NOT NULL REFERENCES contracts.contracts(id),
			new_contract_id UUID NOT NULL REFERENCES contracts.contracts(id),
			change_type VARCHAR(100) NOT NULL,
			severity VARCHAR(20) NOT NULL,
			description TEXT NOT NULL,
			details JSONB,
			detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_breaking_changes_old_contract ON contracts.breaking_changes(old_contract_id);
		CREATE INDEX IF NOT EXISTS idx_breaking_changes_new_contract ON contracts.breaking_changes(new_contract_id);
		CREATE INDEX IF NOT EXISTS idx_breaking_changes_severity ON contracts.breaking_changes(severity);
	`)

	// Create daily_metrics table for reporting
	db.Exec(`
		CREATE TABLE IF NOT EXISTS reporting.daily_metrics (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			date DATE NOT NULL,
			environment VARCHAR(50) NOT NULL,
			total_flows INTEGER DEFAULT 0,
			total_execs INTEGER DEFAULT 0,
			passed_execs INTEGER DEFAULT 0,
			failed_execs INTEGER DEFAULT 0,
			pass_rate DECIMAL(5,2) DEFAULT 0,
			avg_duration_ms BIGINT DEFAULT 0,
			p50_duration_ms BIGINT DEFAULT 0,
			p95_duration_ms BIGINT DEFAULT 0,
			p99_duration_ms BIGINT DEFAULT 0,
			total_steps INTEGER DEFAULT 0,
			passed_steps INTEGER DEFAULT 0,
			failed_steps INTEGER DEFAULT 0,
			by_flow_metrics JSONB,
			by_suite_metrics JSONB,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(date, environment)
		);
		CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON reporting.daily_metrics(date);
		CREATE INDEX IF NOT EXISTS idx_daily_metrics_environment ON reporting.daily_metrics(environment);
	`)

	// Create flakiness_metrics table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS reporting.flakiness_metrics (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL REFERENCES flows.flows(id),
			window_start_date DATE NOT NULL,
			window_end_date DATE NOT NULL,
			window_days INTEGER NOT NULL,
			total_execs INTEGER DEFAULT 0,
			passed_execs INTEGER DEFAULT 0,
			failed_execs INTEGER DEFAULT 0,
			transitions INTEGER DEFAULT 0,
			flakiness_score DECIMAL(5,4) DEFAULT 0,
			is_flaky BOOLEAN DEFAULT false,
			failure_patterns TEXT[],
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_flow_id ON reporting.flakiness_metrics(flow_id);
		CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_is_flaky ON reporting.flakiness_metrics(is_flaky);
		CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_window ON reporting.flakiness_metrics(window_start_date, window_end_date);
	`)

	// Create reports table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS reporting.reports (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			format VARCHAR(20) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			filters JSONB,
			start_date DATE,
			end_date DATE,
			file_path VARCHAR(500),
			file_size BIGINT DEFAULT 0,
			generated_at TIMESTAMP WITH TIME ZONE,
			expires_at TIMESTAMP WITH TIME ZONE,
			error TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_reports_status ON reporting.reports(status);
		CREATE INDEX IF NOT EXISTS idx_reports_format ON reporting.reports(format);
		CREATE INDEX IF NOT EXISTS idx_reports_expires_at ON reporting.reports(expires_at);
	`)

	// Create step_performance table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS reporting.step_performance (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL REFERENCES flows.flows(id),
			step_id VARCHAR(255) NOT NULL,
			step_name VARCHAR(255),
			action VARCHAR(100) NOT NULL,
			date DATE NOT NULL,
			execution_count INTEGER DEFAULT 0,
			passed_count INTEGER DEFAULT 0,
			failed_count INTEGER DEFAULT 0,
			pass_rate DECIMAL(5,2) DEFAULT 0,
			avg_duration_ms BIGINT DEFAULT 0,
			min_duration_ms BIGINT DEFAULT 0,
			max_duration_ms BIGINT DEFAULT 0,
			p50_duration_ms BIGINT DEFAULT 0,
			p95_duration_ms BIGINT DEFAULT 0,
			p99_duration_ms BIGINT DEFAULT 0,
			common_errors TEXT[],
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_step_performance_flow_id ON reporting.step_performance(flow_id);
		CREATE INDEX IF NOT EXISTS idx_step_performance_step_id ON reporting.step_performance(step_id);
		CREATE INDEX IF NOT EXISTS idx_step_performance_date ON reporting.step_performance(date);
		CREATE INDEX IF NOT EXISTS idx_step_performance_action ON reporting.step_performance(action);
	`)

	// Create AI generation_history table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai.generation_history (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			provider VARCHAR(50) NOT NULL,
			model VARCHAR(100) NOT NULL,
			prompt TEXT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			generated_yaml TEXT,
			flow_id UUID REFERENCES flows.flows(id),
			tokens_used INTEGER DEFAULT 0,
			latency_ms BIGINT DEFAULT 0,
			error TEXT,
			metadata JSONB,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_generation_history_provider ON ai.generation_history(provider);
		CREATE INDEX IF NOT EXISTS idx_generation_history_status ON ai.generation_history(status);
		CREATE INDEX IF NOT EXISTS idx_generation_history_flow_id ON ai.generation_history(flow_id);
	`)

	// Create AI suggestions table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai.suggestions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL REFERENCES flows.flows(id),
			execution_id UUID REFERENCES executions.executions(id),
			type VARCHAR(50) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			title VARCHAR(500) NOT NULL,
			description TEXT,
			original_yaml TEXT,
			suggested_yaml TEXT,
			diff_patch TEXT,
			confidence DECIMAL(5,4) DEFAULT 0,
			reasoning TEXT,
			applied_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_suggestions_flow_id ON ai.suggestions(flow_id);
		CREATE INDEX IF NOT EXISTS idx_suggestions_execution_id ON ai.suggestions(execution_id);
		CREATE INDEX IF NOT EXISTS idx_suggestions_type ON ai.suggestions(type);
		CREATE INDEX IF NOT EXISTS idx_suggestions_status ON ai.suggestions(status);
	`)

	// Create AI import_history table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai.import_history (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			source_type VARCHAR(50) NOT NULL,
			source_name VARCHAR(255) NOT NULL,
			source_content TEXT,
			source_url VARCHAR(500),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			flows_generated INTEGER DEFAULT 0,
			flow_ids TEXT[],
			error TEXT,
			metadata JSONB,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_import_history_source_type ON ai.import_history(source_type);
		CREATE INDEX IF NOT EXISTS idx_import_history_status ON ai.import_history(status);
	`)

	// Create AI coverage_analysis table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai.coverage_analysis (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			spec_type VARCHAR(50) NOT NULL,
			spec_name VARCHAR(255) NOT NULL,
			spec_content TEXT,
			spec_url VARCHAR(500),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			total_endpoints INTEGER DEFAULT 0,
			covered_endpoints INTEGER DEFAULT 0,
			coverage_percent DECIMAL(5,2) DEFAULT 0,
			results JSONB,
			error TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_coverage_analysis_spec_type ON ai.coverage_analysis(spec_type);
		CREATE INDEX IF NOT EXISTS idx_coverage_analysis_status ON ai.coverage_analysis(status);
	`)

	// Create AI usage_stats table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai.usage_stats (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			provider VARCHAR(50) NOT NULL,
			model VARCHAR(100) NOT NULL,
			date DATE NOT NULL,
			total_requests INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			success_count INTEGER DEFAULT 0,
			failure_count INTEGER DEFAULT 0,
			avg_latency_ms BIGINT DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(provider, model, date)
		);
		CREATE INDEX IF NOT EXISTS idx_usage_stats_provider ON ai.usage_stats(provider);
		CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON ai.usage_stats(date);
	`)

	// Create system_integrations table (system-level, not workspace-scoped)
	db.Exec(`
		CREATE TABLE IF NOT EXISTS system_integrations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			type VARCHAR(50) NOT NULL,
			provider VARCHAR(50) NOT NULL,
			status VARCHAR(20) DEFAULT 'active',
			config JSONB DEFAULT '{}',
			last_test_at TIMESTAMP WITH TIME ZONE,
			last_test_status VARCHAR(20),
			last_test_error TEXT,
			created_by UUID,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_system_integrations_type ON system_integrations(type);
		CREATE INDEX IF NOT EXISTS idx_system_integrations_provider ON system_integrations(provider);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_system_integrations_type_provider ON system_integrations(type, provider) WHERE deleted_at IS NULL;
	`)

	// Create integration_secrets table (encrypted storage)
	db.Exec(`
		CREATE TABLE IF NOT EXISTS integration_secrets (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			integration_id UUID NOT NULL REFERENCES system_integrations(id) ON DELETE CASCADE,
			encrypted_data TEXT NOT NULL,
			nonce TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_secrets_integration ON integration_secrets(integration_id);
	`)

	// Create git_trigger_rules table (workspace-scoped)
	db.Exec(`
		CREATE TABLE IF NOT EXISTS git_trigger_rules (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			integration_id UUID NOT NULL REFERENCES system_integrations(id),
			name VARCHAR(255) NOT NULL,
			repository VARCHAR(255) NOT NULL,
			branch_filter VARCHAR(255) DEFAULT '*',
			event_types TEXT[] DEFAULT ARRAY['push', 'pull_request'],
			trigger_mode VARCHAR(20) NOT NULL,
			schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
			flow_id UUID REFERENCES flows.flows(id) ON DELETE CASCADE,
			enabled BOOLEAN DEFAULT true,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT check_trigger_target CHECK (
				(trigger_mode = 'schedule' AND schedule_id IS NOT NULL AND flow_id IS NULL) OR
				(trigger_mode = 'direct' AND flow_id IS NOT NULL AND schedule_id IS NULL)
			)
		);
		CREATE INDEX IF NOT EXISTS idx_git_rules_workspace ON git_trigger_rules(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_git_rules_repository ON git_trigger_rules(repository);
		CREATE INDEX IF NOT EXISTS idx_git_rules_integration ON git_trigger_rules(integration_id);
	`)

	// Create webhook_deliveries table (audit log)
	db.Exec(`
		CREATE TABLE IF NOT EXISTS webhook_deliveries (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			integration_id UUID NOT NULL REFERENCES system_integrations(id),
			workspace_id UUID,
			event_type VARCHAR(50) NOT NULL,
			repository VARCHAR(255),
			branch VARCHAR(255),
			commit_sha VARCHAR(40),
			payload JSONB NOT NULL,
			signature VARCHAR(255),
			status VARCHAR(20) NOT NULL,
			error TEXT,
			triggered_runs UUID[],
			received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			processed_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_integration ON webhook_deliveries(integration_id);
		CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received ON webhook_deliveries(received_at DESC);
		CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
	`)

	// Create schedules table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS schedules (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			description TEXT,
			flow_id UUID NOT NULL REFERENCES flows.flows(id),
			cron_expr VARCHAR(100) NOT NULL,
			timezone VARCHAR(50) DEFAULT 'UTC',
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			environment JSONB DEFAULT '{}',
			notify_on_failure BOOLEAN DEFAULT false,
			notify_on_success BOOLEAN DEFAULT false,
			notify_emails TEXT[] DEFAULT '{}',
			max_retries INTEGER DEFAULT 0,
			retry_delay VARCHAR(20) DEFAULT '1m',
			allow_overlap BOOLEAN DEFAULT false,
			next_run_at TIMESTAMP WITH TIME ZONE,
			last_run_at TIMESTAMP WITH TIME ZONE,
			last_run_id UUID,
			last_run_result VARCHAR(20),
			tags TEXT[] DEFAULT '{}',
			created_by UUID,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_schedules_flow_id ON schedules(flow_id);
		CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
		CREATE INDEX IF NOT EXISTS idx_schedules_next_run_at ON schedules(next_run_at);
	`)

	// Migrate existing jsonb columns to text[] (idempotent)
	db.Exec(`
		DO $$
		BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'schedules' AND column_name = 'notify_emails' AND data_type = 'jsonb'
			) THEN
				ALTER TABLE schedules DROP COLUMN notify_emails;
				ALTER TABLE schedules ADD COLUMN notify_emails TEXT[] DEFAULT '{}';
			END IF;
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'schedules' AND column_name = 'tags' AND data_type = 'jsonb'
			) THEN
				ALTER TABLE schedules DROP COLUMN tags;
				ALTER TABLE schedules ADD COLUMN tags TEXT[] DEFAULT '{}';
			END IF;
		END $$;
	`)

	// Create schedule_runs table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS schedule_runs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
			execution_id UUID,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			result VARCHAR(20),
			error TEXT,
			retry_count INTEGER DEFAULT 0,
			scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
			started_at TIMESTAMP WITH TIME ZONE,
			completed_at TIMESTAMP WITH TIME ZONE,
			duration BIGINT DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule_id ON schedule_runs(schedule_id);
		CREATE INDEX IF NOT EXISTS idx_schedule_runs_status ON schedule_runs(status);
		CREATE INDEX IF NOT EXISTS idx_schedule_runs_scheduled_at ON schedule_runs(scheduled_at);
	`)

	// Create request_history table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flows.request_history (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID REFERENCES flows.flows(id),
			collection_id UUID REFERENCES flows.collections(id),
			method VARCHAR(10) NOT NULL,
			url VARCHAR(2048) NOT NULL,
			request JSONB NOT NULL,
			response JSONB,
			status_code INTEGER,
			duration_ms BIGINT,
			size_bytes BIGINT,
			error TEXT,
			tags TEXT[],
			saved_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_request_history_flow_id ON flows.request_history(flow_id);
		CREATE INDEX IF NOT EXISTS idx_request_history_collection_id ON flows.request_history(collection_id);
		CREATE INDEX IF NOT EXISTS idx_request_history_url ON flows.request_history(url);
		CREATE INDEX IF NOT EXISTS idx_request_history_created_at ON flows.request_history(created_at);
	`)

	// Add collection_items table for organizing flows within collections
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flows.collection_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			collection_id UUID NOT NULL REFERENCES flows.collections(id) ON DELETE CASCADE,
			flow_id UUID NOT NULL REFERENCES flows.flows(id) ON DELETE CASCADE,
			sort_order INTEGER DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(collection_id, flow_id)
		);
		CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON flows.collection_items(collection_id);
		CREATE INDEX IF NOT EXISTS idx_collection_items_flow_id ON flows.collection_items(flow_id);
	`)

	// Create workspace_members table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS workspace_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			user_id UUID NOT NULL,
			email VARCHAR(255),
			name VARCHAR(255),
			role VARCHAR(20) NOT NULL DEFAULT 'viewer',
			invited_by UUID,
			invited_at TIMESTAMP WITH TIME ZONE,
			joined_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(workspace_id, user_id)
		);
		CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
		CREATE INDEX IF NOT EXISTS idx_workspace_members_email ON workspace_members(email);
	`)

	// Create workspace_invitations table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS workspace_invitations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			email VARCHAR(255) NOT NULL,
			role VARCHAR(20) NOT NULL,
			token VARCHAR(255) NOT NULL UNIQUE,
			invited_by UUID NOT NULL,
			expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_id ON workspace_invitations(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
		CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);
	`)

	// Create collaboration schema
	db.Exec(`CREATE SCHEMA IF NOT EXISTS collaboration`)

	// Create user_presences table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS user_presences (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			user_name VARCHAR(255) NOT NULL,
			user_email VARCHAR(255),
			user_avatar VARCHAR(500),
			color VARCHAR(20) NOT NULL,
			resource_type VARCHAR(50) NOT NULL,
			resource_id UUID NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'viewing',
			cursor_data JSONB,
			last_active_at TIMESTAMP WITH TIME ZONE NOT NULL,
			connected_at TIMESTAMP WITH TIME ZONE NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_user_presences_user_id ON user_presences(user_id);
		CREATE INDEX IF NOT EXISTS idx_user_presences_resource ON user_presences(resource_type, resource_id);
		CREATE INDEX IF NOT EXISTS idx_user_presences_last_active ON user_presences(last_active_at);
	`)

	// Create flow_comments table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flow_comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL,
			step_id VARCHAR(255),
			parent_id UUID REFERENCES flow_comments(id),
			author_id UUID NOT NULL,
			author_name VARCHAR(255) NOT NULL,
			author_avatar VARCHAR(500),
			content TEXT NOT NULL,
			resolved BOOLEAN DEFAULT false,
			position JSONB,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_flow_comments_flow_id ON flow_comments(flow_id);
		CREATE INDEX IF NOT EXISTS idx_flow_comments_step_id ON flow_comments(step_id);
		CREATE INDEX IF NOT EXISTS idx_flow_comments_parent_id ON flow_comments(parent_id);
		CREATE INDEX IF NOT EXISTS idx_flow_comments_deleted_at ON flow_comments(deleted_at);
	`)

	// Create activity_events table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS activity_events (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor_id UUID,
			actor_name VARCHAR(255) NOT NULL,
			actor_avatar VARCHAR(500),
			event_type VARCHAR(100) NOT NULL,
			resource_type VARCHAR(50) NOT NULL,
			resource_id UUID NOT NULL,
			resource_name VARCHAR(255),
			description TEXT,
			changes JSONB,
			metadata JSONB,
			workspace_id UUID,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_activity_events_actor_id ON activity_events(actor_id);
		CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
		CREATE INDEX IF NOT EXISTS idx_activity_events_resource ON activity_events(resource_type, resource_id);
		CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_id ON activity_events(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
	`)

	// Create flow_versions table
	db.Exec(`
		CREATE TABLE IF NOT EXISTS flow_versions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			flow_id UUID NOT NULL,
			version INTEGER NOT NULL,
			content TEXT NOT NULL,
			author_id UUID,
			author_name VARCHAR(255),
			message VARCHAR(500),
			description TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_id ON flow_versions(flow_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_versions_flow_version ON flow_versions(flow_id, version);
	`)

	// Migration: Assign existing data to default workspace
	db.Exec(`
		-- Update flows without workspace_id
		UPDATE flows.flows
		SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
		WHERE workspace_id IS NULL;

		-- Update collections without workspace_id
		UPDATE flows.collections
		SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
		WHERE workspace_id IS NULL;

		-- Update environments without workspace_id
		UPDATE flows.environments
		SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
		WHERE workspace_id IS NULL;

		-- Add default workspace member
		INSERT INTO workspace_members (workspace_id, user_id, email, name, role, joined_at)
		VALUES (
			'00000000-0000-0000-0000-000000000001'::uuid,
			'00000000-0000-0000-0000-000000000001'::uuid,
			'default@testmesh.local',
			'Default User',
			'owner',
			CURRENT_TIMESTAMP
		)
		ON CONFLICT (workspace_id, user_id) DO NOTHING;
	`)

	// Seed comprehensive sample data
	seedSampleData(db)

	return nil
}

// seedSampleData creates sample data for all features
func seedSampleData(db *gorm.DB) {
	// ==================== ENVIRONMENTS ====================
	db.Exec(`
		INSERT INTO flows.environments (id, workspace_id, name, description, color, is_default, variables)
		VALUES
			('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Development', 'Local development environment', 'green', true, '[{"key": "base_url", "value": "http://localhost:8080", "type": "text"}, {"key": "api_key", "value": "dev-key-123", "type": "secret"}, {"key": "db_host", "value": "localhost", "type": "text"}]'),
			('00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Staging', 'Staging environment for QA', 'yellow', false, '[{"key": "base_url", "value": "https://staging.api.example.com", "type": "text"}, {"key": "api_key", "value": "stg-key-456", "type": "secret"}]'),
			('00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Production', 'Production environment', 'red', false, '[{"key": "base_url", "value": "https://api.example.com", "type": "text"}, {"key": "api_key", "value": "prod-key-789", "type": "secret"}]')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== COLLECTIONS ====================
	db.Exec(`
		INSERT INTO flows.collections (id, workspace_id, name, description, icon, color, parent_id, sort_order)
		VALUES
			('00000000-0000-0000-0001-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'User Management API', 'User CRUD and authentication tests', 'users', 'blue', NULL, 0),
			('00000000-0000-0000-0001-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'E-Commerce API', 'Product and order management tests', 'shopping-cart', 'purple', NULL, 1),
			('00000000-0000-0000-0001-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Authentication', 'Auth flow tests', 'lock', 'green', '00000000-0000-0000-0001-000000000001'::uuid, 0),
			('00000000-0000-0000-0001-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Products', 'Product catalog tests', 'package', 'orange', '00000000-0000-0000-0001-000000000002'::uuid, 0),
			('00000000-0000-0000-0001-000000000005'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Orders', 'Order management tests', 'file-text', 'teal', '00000000-0000-0000-0001-000000000002'::uuid, 1),
			('00000000-0000-0000-0001-000000000006'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Payment Integration', 'Payment gateway tests', 'credit-card', 'pink', NULL, 2),
			('00000000-0000-0000-0001-000000000007'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Notifications', 'Email and push notification tests', 'bell', 'yellow', NULL, 3)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== FLOWS ====================
	db.Exec(`
		INSERT INTO flows.flows (id, workspace_id, name, description, suite, tags, definition, collection_id, sort_order)
		VALUES
			-- User Management Flows
			('00000000-0000-0000-0002-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'User Registration', 'Test user registration flow', 'smoke', ARRAY['api', 'users', 'auth'],
			'{"name": "User Registration", "description": "Test user registration flow", "suite": "smoke", "tags": ["api", "users", "auth"], "steps": [{"id": "register", "name": "Register New User", "action": "http", "config": {"method": "POST", "url": "{{base_url}}/api/users/register", "body": {"email": "test@example.com", "password": "SecurePass123!", "name": "Test User"}}, "assertions": [{"type": "status", "expected": 201}], "extract": [{"name": "user_id", "type": "jsonpath", "path": "$.id"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000001'::uuid, 0),

			('00000000-0000-0000-0002-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'User Login', 'Test user authentication', 'smoke', ARRAY['api', 'auth'],
			'{"name": "User Login", "description": "Test user authentication", "suite": "smoke", "tags": ["api", "auth"], "steps": [{"id": "login", "name": "Login User", "action": "http", "config": {"method": "POST", "url": "{{base_url}}/api/auth/login", "body": {"email": "test@example.com", "password": "SecurePass123!"}}, "assertions": [{"type": "status", "expected": 200}, {"type": "jsonpath", "path": "$.token", "operator": "exists"}], "extract": [{"name": "auth_token", "type": "jsonpath", "path": "$.token"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000003'::uuid, 0),

			('00000000-0000-0000-0002-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Get User Profile', 'Fetch authenticated user profile', 'integration', ARRAY['api', 'users'],
			'{"name": "Get User Profile", "description": "Fetch authenticated user profile", "suite": "integration", "tags": ["api", "users"], "steps": [{"id": "get-profile", "name": "Get Profile", "action": "http", "config": {"method": "GET", "url": "{{base_url}}/api/users/me", "headers": {"Authorization": "Bearer {{auth_token}}"}}, "assertions": [{"type": "status", "expected": 200}, {"type": "jsonpath", "path": "$.email", "operator": "equals", "expected": "test@example.com"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000001'::uuid, 1),

			-- E-Commerce Flows
			('00000000-0000-0000-0002-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'List Products', 'Get product catalog', 'smoke', ARRAY['api', 'products'],
			'{"name": "List Products", "description": "Get product catalog", "suite": "smoke", "tags": ["api", "products"], "steps": [{"id": "list-products", "name": "Get Products", "action": "http", "config": {"method": "GET", "url": "{{base_url}}/api/products", "params": {"limit": 10, "offset": 0}}, "assertions": [{"type": "status", "expected": 200}, {"type": "jsonpath", "path": "$.products", "operator": "is_array"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000004'::uuid, 0),

			('00000000-0000-0000-0002-000000000005'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Create Order', 'Place a new order', 'integration', ARRAY['api', 'orders'],
			'{"name": "Create Order", "description": "Place a new order", "suite": "integration", "tags": ["api", "orders"], "steps": [{"id": "create-order", "name": "Create Order", "action": "http", "config": {"method": "POST", "url": "{{base_url}}/api/orders", "headers": {"Authorization": "Bearer {{auth_token}}"}, "body": {"items": [{"product_id": "prod-123", "quantity": 2}], "shipping_address": {"street": "123 Main St", "city": "New York", "zip": "10001"}}}, "assertions": [{"type": "status", "expected": 201}], "extract": [{"name": "order_id", "type": "jsonpath", "path": "$.id"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000005'::uuid, 0),

			('00000000-0000-0000-0002-000000000006'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Process Payment', 'Process order payment', 'integration', ARRAY['api', 'payments'],
			'{"name": "Process Payment", "description": "Process order payment", "suite": "integration", "tags": ["api", "payments"], "steps": [{"id": "process-payment", "name": "Submit Payment", "action": "http", "config": {"method": "POST", "url": "{{base_url}}/api/payments", "body": {"order_id": "{{order_id}}", "payment_method": "card", "card_token": "tok_visa"}}, "assertions": [{"type": "status", "expected": 200}, {"type": "jsonpath", "path": "$.status", "operator": "equals", "expected": "succeeded"}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000006'::uuid, 0),

			('00000000-0000-0000-0002-000000000007'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Health Check', 'API health check', 'smoke', ARRAY['api', 'health'],
			'{"name": "Health Check", "description": "API health check", "suite": "smoke", "tags": ["api", "health"], "steps": [{"id": "health", "name": "Check Health", "action": "http", "config": {"method": "GET", "url": "{{base_url}}/health"}, "assertions": [{"type": "status", "expected": 200}]}]}'::jsonb,
			NULL, 0),

			('00000000-0000-0000-0002-000000000008'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Database Connection Test', 'Test database connectivity', 'smoke', ARRAY['db', 'postgres'],
			'{"name": "Database Connection Test", "description": "Test database connectivity", "suite": "smoke", "tags": ["db", "postgres"], "steps": [{"id": "db-query", "name": "Run Query", "action": "postgresql", "config": {"host": "{{db_host}}", "port": 5432, "database": "testdb", "query": "SELECT 1 as health"}, "assertions": [{"type": "row_count", "operator": "equals", "expected": 1}]}]}'::jsonb,
			NULL, 1),

			('00000000-0000-0000-0002-000000000009'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Kafka Message Test', 'Test Kafka producer/consumer', 'integration', ARRAY['kafka', 'messaging'],
			'{"name": "Kafka Message Test", "description": "Test Kafka producer/consumer", "suite": "integration", "tags": ["kafka", "messaging"], "steps": [{"id": "produce", "name": "Produce Message", "action": "kafka", "config": {"operation": "produce", "brokers": ["localhost:9092"], "topic": "test-topic", "message": {"event": "test", "timestamp": "{{$timestamp}}"}}}, {"id": "consume", "name": "Consume Message", "action": "kafka", "config": {"operation": "consume", "brokers": ["localhost:9092"], "topic": "test-topic", "timeout": 5000}, "assertions": [{"type": "jsonpath", "path": "$.event", "operator": "equals", "expected": "test"}]}]}'::jsonb,
			NULL, 2),

			('00000000-0000-0000-0002-000000000010'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Send Notification', 'Test notification service', 'integration', ARRAY['api', 'notifications'],
			'{"name": "Send Notification", "description": "Test notification service", "suite": "integration", "tags": ["api", "notifications"], "steps": [{"id": "send-email", "name": "Send Email", "action": "http", "config": {"method": "POST", "url": "{{base_url}}/api/notifications/email", "body": {"to": "user@example.com", "subject": "Test", "body": "Test notification"}}, "assertions": [{"type": "status", "expected": 202}]}]}'::jsonb,
			'00000000-0000-0000-0001-000000000007'::uuid, 0)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== EXECUTIONS ====================
	db.Exec(`
		INSERT INTO executions.executions (id, flow_id, status, environment, started_at, finished_at, duration_ms, total_steps, passed_steps, failed_steps)
		VALUES
			('00000000-0000-0000-0003-000000000001'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'completed', 'Development', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '1500 milliseconds', 1500, 1, 1, 0),
			('00000000-0000-0000-0003-000000000002'::uuid, '00000000-0000-0000-0002-000000000002'::uuid, 'completed', 'Development', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '800 milliseconds', 800, 1, 1, 0),
			('00000000-0000-0000-0003-000000000003'::uuid, '00000000-0000-0000-0002-000000000004'::uuid, 'completed', 'Staging', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes' + INTERVAL '2200 milliseconds', 2200, 1, 1, 0),
			('00000000-0000-0000-0003-000000000004'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, 'failed', 'Development', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes' + INTERVAL '3500 milliseconds', 3500, 1, 0, 1),
			('00000000-0000-0000-0003-000000000005'::uuid, '00000000-0000-0000-0002-000000000007'::uuid, 'completed', 'Production', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes' + INTERVAL '250 milliseconds', 250, 1, 1, 0),
			('00000000-0000-0000-0003-000000000006'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'running', 'Development', NOW() - INTERVAL '1 minute', NULL, NULL, 1, 0, 0)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== EXECUTION STEPS ====================
	db.Exec(`
		INSERT INTO executions.execution_steps (id, execution_id, step_id, step_name, action, status, started_at, finished_at, duration_ms, output)
		VALUES
			('00000000-0000-0000-0004-000000000001'::uuid, '00000000-0000-0000-0003-000000000001'::uuid, 'register', 'Register New User', 'http', 'passed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '1500 milliseconds', 1500, '{"status_code": 201, "body": {"id": "user-123", "email": "test@example.com"}}'::jsonb),
			('00000000-0000-0000-0004-000000000002'::uuid, '00000000-0000-0000-0003-000000000002'::uuid, 'login', 'Login User', 'http', 'passed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '800 milliseconds', 800, '{"status_code": 200, "body": {"token": "eyJhbGciOiJIUzI1NiIs..."}}'::jsonb),
			('00000000-0000-0000-0004-000000000003'::uuid, '00000000-0000-0000-0003-000000000003'::uuid, 'list-products', 'Get Products', 'http', 'passed', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes' + INTERVAL '2200 milliseconds', 2200, '{"status_code": 200, "body": {"products": [{"id": "prod-1", "name": "Widget"}]}}'::jsonb),
			('00000000-0000-0000-0004-000000000004'::uuid, '00000000-0000-0000-0003-000000000004'::uuid, 'create-order', 'Create Order', 'http', 'failed', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes' + INTERVAL '3500 milliseconds', 3500, '{"status_code": 500, "body": {"error": "Internal server error"}}'::jsonb),
			('00000000-0000-0000-0004-000000000005'::uuid, '00000000-0000-0000-0003-000000000005'::uuid, 'health', 'Check Health', 'http', 'passed', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes' + INTERVAL '250 milliseconds', 250, '{"status_code": 200, "body": {"status": "healthy"}}'::jsonb)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== SCHEDULES ====================
	db.Exec(`
		INSERT INTO schedules (id, name, description, flow_id, cron_expr, timezone, status, environment, notify_on_failure, notify_emails, next_run_at, last_run_at, last_run_result, tags)
		VALUES
			('00000000-0000-0000-0005-000000000001'::uuid, 'Hourly Health Check', 'Run health check every hour', '00000000-0000-0000-0002-000000000007'::uuid, '0 * * * *', 'UTC', 'active', '{"environment": "Production"}'::jsonb, true, ARRAY['alerts@example.com'], NOW() + INTERVAL '1 hour', NOW() - INTERVAL '5 minutes', 'success', ARRAY['monitoring', 'health']),
			('00000000-0000-0000-0005-000000000002'::uuid, 'Nightly Regression', 'Full regression suite at 2 AM', '00000000-0000-0000-0002-000000000001'::uuid, '0 2 * * *', 'America/New_York', 'active', '{"environment": "Staging"}'::jsonb, true, ARRAY['team@example.com'], NOW() + INTERVAL '8 hours', NOW() - INTERVAL '16 hours', 'success', ARRAY['regression', 'nightly']),
			('00000000-0000-0000-0005-000000000003'::uuid, 'Weekly E2E Tests', 'End-to-end tests every Sunday', '00000000-0000-0000-0002-000000000005'::uuid, '0 6 * * 0', 'UTC', 'active', '{"environment": "Staging"}'::jsonb, true, ARRAY['qa@example.com'], NOW() + INTERVAL '3 days', NOW() - INTERVAL '4 days', 'failed', ARRAY['e2e', 'weekly']),
			('00000000-0000-0000-0005-000000000004'::uuid, 'Database Health', 'Check DB connectivity every 15 min', '00000000-0000-0000-0002-000000000008'::uuid, '*/15 * * * *', 'UTC', 'paused', '{"environment": "Development"}'::jsonb, false, ARRAY[]::text[], NULL, NOW() - INTERVAL '2 hours', 'success', ARRAY['database', 'monitoring'])
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== SCHEDULE RUNS ====================
	db.Exec(`
		INSERT INTO schedule_runs (id, schedule_id, execution_id, status, result, scheduled_at, started_at, completed_at, duration)
		VALUES
			('00000000-0000-0000-0006-000000000001'::uuid, '00000000-0000-0000-0005-000000000001'::uuid, '00000000-0000-0000-0003-000000000005'::uuid, 'completed', 'success', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes', 60000),
			('00000000-0000-0000-0006-000000000002'::uuid, '00000000-0000-0000-0005-000000000001'::uuid, NULL, 'completed', 'success', NOW() - INTERVAL '65 minutes', NOW() - INTERVAL '65 minutes', NOW() - INTERVAL '64 minutes', 58000),
			('00000000-0000-0000-0006-000000000003'::uuid, '00000000-0000-0000-0005-000000000002'::uuid, '00000000-0000-0000-0003-000000000001'::uuid, 'completed', 'success', NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours' + INTERVAL '2 minutes', 120000),
			('00000000-0000-0000-0006-000000000004'::uuid, '00000000-0000-0000-0005-000000000003'::uuid, '00000000-0000-0000-0003-000000000004'::uuid, 'completed', 'failed', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days' + INTERVAL '5 minutes', 300000)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== MOCK SERVERS ====================
	// Fixed UUIDs match seed/main.go so environments can reference their base URLs
	db.Exec(`
		INSERT INTO mocks.mock_servers (id, name, port, base_url, status, started_at)
		VALUES
			('bb000000-0000-0000-0000-000000000001'::uuid, 'User Service Mock',         0, 'http://localhost:5016/mocks/bb000000-0000-0000-0000-000000000001', 'running', NOW() - INTERVAL '2 hours'),
			('bb000000-0000-0000-0000-000000000002'::uuid, 'Order Service Mock',        0, 'http://localhost:5016/mocks/bb000000-0000-0000-0000-000000000002', 'running', NOW() - INTERVAL '2 hours'),
			('bb000000-0000-0000-0000-000000000003'::uuid, 'Payment Service Mock',      0, 'http://localhost:5016/mocks/bb000000-0000-0000-0000-000000000003', 'running', NOW() - INTERVAL '2 hours'),
			('bb000000-0000-0000-0000-000000000004'::uuid, 'Notification Service Mock', 0, 'http://localhost:5016/mocks/bb000000-0000-0000-0000-000000000004', 'running', NOW() - INTERVAL '2 hours')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== MOCK ENDPOINTS ====================
	db.Exec(`
		INSERT INTO mocks.mock_endpoints (id, mock_server_id, path, method, response_config, priority)
		VALUES
			('bb000000-0000-0000-0001-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, '/api/health',      'GET',  '{"status_code": 200, "body_json": {"status": "ok", "service": "user-service"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 0),
			('bb000000-0000-0000-0001-000000000002'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, '/api/users',       'GET',  '{"status_code": 200, "body_json": {"users": [{"id": "user-001", "name": "Alice Smith"}], "total": 1}, "headers": {"Content-Type": "application/json"}}'::jsonb, 1),
			('bb000000-0000-0000-0001-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, '/api/users/:id',   'GET',  '{"status_code": 200, "body_json": {"id": "{{.path.id}}", "name": "User {{.path.id}}", "email": "user-{{.path.id}}@example.com"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 2),
			('bb000000-0000-0000-0001-000000000004'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, '/api/users',       'POST', '{"status_code": 201, "body_json": {"id": "user-new-001", "name": "{{.body.name}}", "email": "{{.body.email}}", "created": true}, "headers": {"Content-Type": "application/json"}}'::jsonb, 3),
			('bb000000-0000-0000-0001-000000000005'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, '/api/login',       'POST', '{"status_code": 200, "body_json": {"token": "mock-jwt-token-abc123", "user_id": "user-001", "expires": 3600}, "headers": {"Content-Type": "application/json"}}'::jsonb, 4),
			('bb000000-0000-0000-0002-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, '/api/health',      'GET',  '{"status_code": 200, "body_json": {"status": "ok", "service": "order-service"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 0),
			('bb000000-0000-0000-0002-000000000002'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, '/api/orders',      'GET',  '{"status_code": 200, "body_json": {"orders": [], "total": 0}, "headers": {"Content-Type": "application/json"}}'::jsonb, 1),
			('bb000000-0000-0000-0002-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, '/api/orders',      'POST', '{"status_code": 201, "body_json": {"id": "ord-new-001", "user_id": "{{.body.user_id}}", "status": "pending", "created": true}, "headers": {"Content-Type": "application/json"}}'::jsonb, 2),
			('bb000000-0000-0000-0002-000000000004'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, '/api/orders/:id',  'GET',  '{"status_code": 200, "body_json": {"id": "{{.path.id}}", "status": "confirmed"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 3),
			('bb000000-0000-0000-0002-000000000005'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, '/api/orders/:id',  'PUT',  '{"status_code": 200, "body_json": {"id": "{{.path.id}}", "status": "{{.body.status}}", "updated": true}, "headers": {"Content-Type": "application/json"}}'::jsonb, 4),
			('bb000000-0000-0000-0003-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid, '/api/health',      'GET',  '{"status_code": 200, "body_json": {"status": "ok", "service": "payment-service"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 0),
			('bb000000-0000-0000-0003-000000000002'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid, '/api/payments',    'POST', '{"status_code": 200, "body_json": {"id": "pay-new-001", "order_id": "{{.body.order_id}}", "amount": "{{.body.amount}}", "status": "succeeded"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 1),
			('bb000000-0000-0000-0003-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid, '/api/payments/:id','GET',  '{"status_code": 200, "body_json": {"id": "{{.path.id}}", "status": "succeeded", "currency": "USD"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 2),
			('bb000000-0000-0000-0003-000000000004'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid, '/api/refunds',     'POST', '{"status_code": 200, "body_json": {"id": "ref-new-001", "payment_id": "{{.body.payment_id}}", "status": "refunded"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 3),
			('bb000000-0000-0000-0004-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000004'::uuid, '/api/health',                  'GET',  '{"status_code": 200, "body_json": {"status": "ok", "service": "notification-service"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 0),
			('bb000000-0000-0000-0004-000000000002'::uuid, 'bb000000-0000-0000-0000-000000000004'::uuid, '/api/notifications/email',     'POST', '{"status_code": 202, "body_json": {"message_id": "msg-new-001", "to": "{{.body.to}}", "subject": "{{.body.subject}}", "status": "queued"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 1),
			('bb000000-0000-0000-0004-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000004'::uuid, '/api/notifications/sms',       'POST', '{"status_code": 202, "body_json": {"message_id": "sms-new-001", "to": "{{.body.to}}", "status": "sent"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 2),
			('bb000000-0000-0000-0004-000000000004'::uuid, 'bb000000-0000-0000-0000-000000000004'::uuid, '/api/notifications/:id',       'GET',  '{"status_code": 200, "body_json": {"id": "{{.path.id}}", "type": "email", "status": "delivered"}, "headers": {"Content-Type": "application/json"}}'::jsonb, 3)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== MOCK REQUESTS ====================
	db.Exec(`
		INSERT INTO mocks.mock_requests (id, mock_server_id, endpoint_id, method, path, headers, body, matched, response_code, received_at)
		VALUES
			('bb000000-0000-0000-0009-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0003-000000000002'::uuid, 'POST', '/api/payments', '{"Content-Type": "application/json"}'::jsonb, '{"amount": 99.98, "currency": "USD", "order_id": "ord-001"}', true, 200, NOW() - INTERVAL '1 hour'),
			('bb000000-0000-0000-0009-000000000002'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, 'bb000000-0000-0000-0001-000000000002'::uuid, 'GET',  '/api/users',    '{"Authorization": "Bearer mock-jwt-token-abc123"}'::jsonb, NULL, true, 200, NOW() - INTERVAL '30 minutes'),
			('bb000000-0000-0000-0009-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid, 'bb000000-0000-0000-0002-000000000003'::uuid, 'POST', '/api/orders',   '{"Content-Type": "application/json"}'::jsonb, '{"user_id": "user-001", "total": 99.98}', true, 201, NOW() - INTERVAL '15 minutes')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== CONTRACTS ====================
	db.Exec(`
		INSERT INTO contracts.contracts (id, consumer, provider, version, pact_version, contract_data, flow_id)
		VALUES
			('00000000-0000-0000-000a-000000000001'::uuid, 'web-frontend', 'user-service', '1.0.0', '4.0', '{"consumer": {"name": "web-frontend"}, "provider": {"name": "user-service"}, "interactions": []}'::jsonb, '00000000-0000-0000-0002-000000000003'::uuid),
			('00000000-0000-0000-000a-000000000002'::uuid, 'mobile-app', 'user-service', '1.0.0', '4.0', '{"consumer": {"name": "mobile-app"}, "provider": {"name": "user-service"}, "interactions": []}'::jsonb, NULL),
			('00000000-0000-0000-000a-000000000003'::uuid, 'order-service', 'payment-gateway', '2.1.0', '4.0', '{"consumer": {"name": "order-service"}, "provider": {"name": "payment-gateway"}, "interactions": []}'::jsonb, '00000000-0000-0000-0002-000000000006'::uuid),
			('00000000-0000-0000-000a-000000000004'::uuid, 'web-frontend', 'product-service', '1.2.0', '4.0', '{"consumer": {"name": "web-frontend"}, "provider": {"name": "product-service"}, "interactions": []}'::jsonb, '00000000-0000-0000-0002-000000000004'::uuid)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== CONTRACT INTERACTIONS ====================
	db.Exec(`
		INSERT INTO contracts.interactions (id, contract_id, description, provider_state, request, response, interaction_type)
		VALUES
			('00000000-0000-0000-000b-000000000001'::uuid, '00000000-0000-0000-000a-000000000001'::uuid, 'Get user profile', 'user exists', '{"method": "GET", "path": "/api/users/123"}'::jsonb, '{"status": 200, "body": {"id": "123", "name": "John"}}'::jsonb, 'http'),
			('00000000-0000-0000-000b-000000000002'::uuid, '00000000-0000-0000-000a-000000000001'::uuid, 'User not found', 'user does not exist', '{"method": "GET", "path": "/api/users/999"}'::jsonb, '{"status": 404, "body": {"error": "Not found"}}'::jsonb, 'http'),
			('00000000-0000-0000-000b-000000000003'::uuid, '00000000-0000-0000-000a-000000000003'::uuid, 'Process payment', 'valid card', '{"method": "POST", "path": "/api/payments"}'::jsonb, '{"status": 200, "body": {"status": "succeeded"}}'::jsonb, 'http'),
			('00000000-0000-0000-000b-000000000004'::uuid, '00000000-0000-0000-000a-000000000003'::uuid, 'Payment declined', 'invalid card', '{"method": "POST", "path": "/api/payments"}'::jsonb, '{"status": 400, "body": {"error": "Card declined"}}'::jsonb, 'http')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== CONTRACT VERIFICATIONS ====================
	db.Exec(`
		INSERT INTO contracts.verifications (id, contract_id, provider_version, status, verified_at, results)
		VALUES
			('00000000-0000-0000-000c-000000000001'::uuid, '00000000-0000-0000-000a-000000000001'::uuid, '1.0.5', 'passed', NOW() - INTERVAL '1 day', '{"total": 2, "passed": 2, "failed": 0, "interactions": [{"description": "Get user profile", "status": "passed"}, {"description": "User not found", "status": "passed"}]}'::jsonb),
			('00000000-0000-0000-000c-000000000002'::uuid, '00000000-0000-0000-000a-000000000003'::uuid, '2.0.0', 'failed', NOW() - INTERVAL '2 days', '{"total": 2, "passed": 1, "failed": 1, "interactions": [{"description": "Process payment", "status": "passed"}, {"description": "Payment declined", "status": "failed", "error": "Response body mismatch"}]}'::jsonb),
			('00000000-0000-0000-000c-000000000003'::uuid, '00000000-0000-0000-000a-000000000004'::uuid, '1.2.1', 'passed', NOW() - INTERVAL '6 hours', '{"total": 1, "passed": 1, "failed": 0}'::jsonb)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== REPORTS ====================
	db.Exec(`
		INSERT INTO reporting.reports (id, name, format, status, filters, start_date, end_date, file_path, file_size, generated_at)
		VALUES
			('00000000-0000-0000-000d-000000000001'::uuid, 'Weekly Test Summary', 'pdf', 'completed', '{"suites": ["smoke", "integration"]}'::jsonb, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, '/reports/weekly-summary-2024-01.pdf', 245678, NOW() - INTERVAL '1 day'),
			('00000000-0000-0000-000d-000000000002'::uuid, 'Monthly Analytics Report', 'html', 'completed', '{"environment": "Production"}'::jsonb, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, '/reports/monthly-analytics.html', 512000, NOW() - INTERVAL '3 days'),
			('00000000-0000-0000-000d-000000000003'::uuid, 'Flakiness Analysis', 'json', 'completed', '{}'::jsonb, CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE, '/reports/flakiness.json', 34567, NOW() - INTERVAL '12 hours'),
			('00000000-0000-0000-000d-000000000004'::uuid, 'Daily Execution Report', 'pdf', 'pending', '{}'::jsonb, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE, NULL, 0, NULL)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== DAILY METRICS ====================
	db.Exec(`
		INSERT INTO reporting.daily_metrics (id, date, environment, total_flows, total_execs, passed_execs, failed_execs, pass_rate, avg_duration_ms, p50_duration_ms, p95_duration_ms, p99_duration_ms, total_steps, passed_steps, failed_steps)
		VALUES
			('00000000-0000-0000-000e-000000000001'::uuid, CURRENT_DATE, 'Development', 10, 45, 40, 5, 88.89, 1250, 980, 2500, 4200, 120, 110, 10),
			('00000000-0000-0000-000e-000000000002'::uuid, CURRENT_DATE - INTERVAL '1 day', 'Development', 10, 52, 48, 4, 92.31, 1180, 920, 2200, 3800, 140, 132, 8),
			('00000000-0000-0000-000e-000000000003'::uuid, CURRENT_DATE - INTERVAL '2 days', 'Development', 10, 38, 35, 3, 92.11, 1320, 1050, 2800, 4500, 95, 88, 7),
			('00000000-0000-0000-000e-000000000004'::uuid, CURRENT_DATE, 'Staging', 8, 25, 22, 3, 88.00, 1450, 1100, 3200, 5100, 65, 58, 7),
			('00000000-0000-0000-000e-000000000005'::uuid, CURRENT_DATE - INTERVAL '1 day', 'Staging', 8, 30, 28, 2, 93.33, 1380, 1050, 2900, 4800, 78, 74, 4),
			('00000000-0000-0000-000e-000000000006'::uuid, CURRENT_DATE, 'Production', 5, 150, 148, 2, 98.67, 850, 680, 1500, 2200, 375, 372, 3),
			('00000000-0000-0000-000e-000000000007'::uuid, CURRENT_DATE - INTERVAL '1 day', 'Production', 5, 145, 144, 1, 99.31, 820, 650, 1400, 2000, 360, 358, 2)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== FLAKINESS METRICS ====================
	db.Exec(`
		INSERT INTO reporting.flakiness_metrics (id, flow_id, window_start_date, window_end_date, window_days, total_execs, passed_execs, failed_execs, transitions, flakiness_score, is_flaky, failure_patterns)
		VALUES
			('00000000-0000-0000-000f-000000000001'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, 7, 20, 15, 5, 8, 0.4000, true, ARRAY['timeout', 'connection_refused']),
			('00000000-0000-0000-000f-000000000002'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, 7, 25, 24, 1, 2, 0.0800, false, ARRAY['assertion_failed']),
			('00000000-0000-0000-000f-000000000003'::uuid, '00000000-0000-0000-0002-000000000007'::uuid, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, 7, 168, 168, 0, 0, 0.0000, false, ARRAY[]::text[])
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== AI GENERATION HISTORY ====================
	db.Exec(`
		INSERT INTO ai.generation_history (id, provider, model, prompt, status, generated_yaml, flow_id, tokens_used, latency_ms)
		VALUES
			('00000000-0000-0000-0010-000000000001'::uuid, 'anthropic', 'claude-3-opus', 'Generate a test flow for user registration with email validation', 'completed', 'name: User Registration Test\nsteps:\n  - id: register\n    action: http\n    config:\n      method: POST\n      url: "{{base_url}}/api/register"', '00000000-0000-0000-0002-000000000001'::uuid, 1250, 3500),
			('00000000-0000-0000-0010-000000000002'::uuid, 'openai', 'gpt-4', 'Create API tests for payment processing', 'completed', 'name: Payment Flow\nsteps:\n  - id: create-payment\n    action: http', '00000000-0000-0000-0002-000000000006'::uuid, 980, 2800),
			('00000000-0000-0000-0010-000000000003'::uuid, 'anthropic', 'claude-3-sonnet', 'Generate database integration tests', 'failed', NULL, NULL, 0, 1200)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== AI SUGGESTIONS ====================
	db.Exec(`
		INSERT INTO ai.suggestions (id, flow_id, execution_id, type, status, title, description, confidence, reasoning)
		VALUES
			('00000000-0000-0000-0011-000000000001'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, '00000000-0000-0000-0003-000000000004'::uuid, 'fix', 'pending', 'Add retry logic for transient failures', 'The order creation step fails intermittently due to network timeouts. Adding retry logic could improve reliability.', 0.85, 'Analysis of 20 executions shows 15% fail with timeout errors that succeed on manual retry.'),
			('00000000-0000-0000-0011-000000000002'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, '00000000-0000-0000-0003-000000000004'::uuid, 'optimization', 'accepted', 'Increase timeout for slow endpoints', 'The payment processing endpoint occasionally exceeds the default timeout.', 0.72, 'P95 latency for this endpoint is 4.5 seconds but timeout is set to 3 seconds.'),
			('00000000-0000-0000-0011-000000000003'::uuid, '00000000-0000-0000-0002-000000000002'::uuid, NULL, 'assertion', 'applied', 'Add token expiry validation', 'The login test should verify the token expiry time is reasonable.', 0.90, 'Security best practice to validate token lifetime.')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== AI IMPORT HISTORY ====================
	db.Exec(`
		INSERT INTO ai.import_history (id, source_type, source_name, status, flows_generated, flow_ids)
		VALUES
			('00000000-0000-0000-0012-000000000001'::uuid, 'openapi', 'user-service-api.yaml', 'completed', 5, ARRAY['00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0002-000000000003']),
			('00000000-0000-0000-0012-000000000002'::uuid, 'postman', 'E-Commerce Collection.json', 'completed', 3, ARRAY['00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0002-000000000005']),
			('00000000-0000-0000-0012-000000000003'::uuid, 'har', 'browser-session.har', 'failed', 0, ARRAY[]::text[])
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== AI COVERAGE ANALYSIS ====================
	db.Exec(`
		INSERT INTO ai.coverage_analysis (id, spec_type, spec_name, status, total_endpoints, covered_endpoints, coverage_percent, results)
		VALUES
			('00000000-0000-0000-0013-000000000001'::uuid, 'openapi', 'User Service API v1.0', 'completed', 15, 12, 80.00, '{"covered": ["/users", "/users/{id}", "/auth/login"], "uncovered": ["/users/bulk", "/admin/users", "/auth/refresh"]}'::jsonb),
			('00000000-0000-0000-0013-000000000002'::uuid, 'openapi', 'Payment Gateway API v2.0', 'completed', 8, 6, 75.00, '{"covered": ["/payments", "/refunds"], "uncovered": ["/disputes", "/webhooks"]}'::jsonb)
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== REQUEST HISTORY ====================
	db.Exec(`
		INSERT INTO flows.request_history (id, flow_id, method, url, request, response, status_code, duration_ms, size_bytes, tags)
		VALUES
			('00000000-0000-0000-0014-000000000001'::uuid, '00000000-0000-0000-0002-000000000007'::uuid, 'GET', 'http://localhost:8080/health', '{"method": "GET", "url": "http://localhost:8080/health", "headers": {}}'::jsonb, '{"status_code": 200, "status_text": "OK", "body": "{\"status\": \"healthy\"}", "size_bytes": 128, "time_ms": 45}'::jsonb, 200, 45, 128, ARRAY['health', 'smoke']),
			('00000000-0000-0000-0014-000000000002'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'POST', 'http://localhost:8080/api/users/register', '{"method": "POST", "url": "http://localhost:8080/api/users/register", "headers": {"Content-Type": "application/json"}, "body": "{\"email\": \"test@example.com\"}", "body_type": "json"}'::jsonb, '{"status_code": 201, "status_text": "Created", "body": "{\"id\": \"user-123\"}", "size_bytes": 512, "time_ms": 250}'::jsonb, 201, 250, 512, ARRAY['users', 'registration']),
			('00000000-0000-0000-0014-000000000003'::uuid, '00000000-0000-0000-0002-000000000004'::uuid, 'GET', 'http://localhost:8080/api/products', '{"method": "GET", "url": "http://localhost:8080/api/products", "headers": {}}'::jsonb, '{"status_code": 200, "status_text": "OK", "body": "{\"products\": []}", "size_bytes": 1024, "time_ms": 180}'::jsonb, 200, 180, 1024, ARRAY['products']),
			('00000000-0000-0000-0014-000000000004'::uuid, NULL, 'POST', 'http://localhost:8080/api/orders', '{"method": "POST", "url": "http://localhost:8080/api/orders", "headers": {"Authorization": "Bearer token"}, "body": "{\"items\": []}", "body_type": "json"}'::jsonb, '{"status_code": 500, "status_text": "Internal Server Error", "body": "{\"error\": \"Internal error\"}", "size_bytes": 256, "time_ms": 3200}'::jsonb, 500, 3200, 256, ARRAY['orders', 'error'])
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== ACTIVITY EVENTS ====================
	db.Exec(`
		INSERT INTO activity_events (id, actor_id, actor_name, event_type, resource_type, resource_id, resource_name, description, workspace_id, created_at)
		VALUES
			('00000000-0000-0000-0015-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'flow.created', 'flow', '00000000-0000-0000-0002-000000000001'::uuid, 'User Registration', 'Created new flow', '00000000-0000-0000-0000-000000000001'::uuid, NOW() - INTERVAL '5 days'),
			('00000000-0000-0000-0015-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'flow.executed', 'flow', '00000000-0000-0000-0002-000000000001'::uuid, 'User Registration', 'Executed flow - Passed', '00000000-0000-0000-0000-000000000001'::uuid, NOW() - INTERVAL '2 hours'),
			('00000000-0000-0000-0015-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'schedule.created', 'schedule', '00000000-0000-0000-0005-000000000001'::uuid, 'Hourly Health Check', 'Created schedule', '00000000-0000-0000-0000-000000000001'::uuid, NOW() - INTERVAL '3 days'),
			('00000000-0000-0000-0015-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'mock.created', 'mock', 'bb000000-0000-0000-0000-000000000003'::uuid, 'Payment Service Mock', 'Created mock server', '00000000-0000-0000-0000-000000000001'::uuid, NOW() - INTERVAL '1 day'),
			('00000000-0000-0000-0015-000000000005'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'contract.verified', 'contract', '00000000-0000-0000-000a-000000000001'::uuid, 'web-frontend <> user-service', 'Contract verification passed', '00000000-0000-0000-0000-000000000001'::uuid, NOW() - INTERVAL '1 day')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== FLOW COMMENTS ====================
	db.Exec(`
		INSERT INTO flow_comments (id, flow_id, step_id, author_id, author_name, content, resolved, created_at)
		VALUES
			('00000000-0000-0000-0016-000000000001'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, 'create-order', '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'We should add validation for empty cart before creating order', false, NOW() - INTERVAL '2 days'),
			('00000000-0000-0000-0016-000000000002'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, NULL, '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'This flow needs to be updated for the new API version', false, NOW() - INTERVAL '1 day'),
			('00000000-0000-0000-0016-000000000003'::uuid, '00000000-0000-0000-0002-000000000006'::uuid, 'process-payment', '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'Added retry logic as suggested', true, NOW() - INTERVAL '12 hours')
		ON CONFLICT (id) DO NOTHING;
	`)

	// ==================== FLOW VERSIONS ====================
	db.Exec(`
		INSERT INTO flow_versions (id, flow_id, version, content, author_id, author_name, message, created_at)
		VALUES
			('00000000-0000-0000-0017-000000000001'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 1, '{"name": "User Registration", "steps": []}', '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'Initial version', NOW() - INTERVAL '5 days'),
			('00000000-0000-0000-0017-000000000002'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 2, '{"name": "User Registration", "steps": [{"id": "register"}]}', '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'Added registration step', NOW() - INTERVAL '4 days'),
			('00000000-0000-0000-0017-000000000003'::uuid, '00000000-0000-0000-0002-000000000005'::uuid, 1, '{"name": "Create Order", "steps": []}', '00000000-0000-0000-0000-000000000001'::uuid, 'Default User', 'Initial version', NOW() - INTERVAL '3 days')
		ON CONFLICT (id) DO NOTHING;
	`)
}
