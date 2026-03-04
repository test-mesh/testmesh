package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/ai"
	"github.com/georgi-georgiev/testmesh/internal/api/handlers"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/api/websocket"
	"github.com/georgi-georgiev/testmesh/internal/auth"
	"github.com/georgi-georgiev/testmesh/internal/loadtest"
	"github.com/georgi-georgiev/testmesh/internal/plugins"
	"github.com/georgi-georgiev/testmesh/internal/reporting"
	"github.com/georgi-georgiev/testmesh/internal/runner"
	"github.com/georgi-georgiev/testmesh/internal/runner/debugger"
	"github.com/georgi-georgiev/testmesh/internal/runner/mocks"
	"github.com/georgi-georgiev/testmesh/internal/scheduler"
	"github.com/georgi-georgiev/testmesh/internal/security"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// integrationRepoAdapter adapts IntegrationRepository to ai.IntegrationProvider interface
type integrationRepoAdapter struct {
	repo *repository.IntegrationRepository
}

// GetAIIntegrations implements ai.IntegrationProvider
func (a *integrationRepoAdapter) GetAIIntegrations() ([]*ai.IntegrationData, error) {
	integrations, err := a.repo.GetAllAIIntegrationsWithSecrets()
	if err != nil {
		return nil, err
	}

	var result []*ai.IntegrationData
	for _, integration := range integrations {
		data := &ai.IntegrationData{
			Provider: string(integration.Provider),
			Config: ai.IntegrationConfig{
				Model:       integration.Config.Model,
				Endpoint:    integration.Config.Endpoint,
				Temperature: integration.Config.Temperature,
				MaxTokens:   integration.Config.MaxTokens,
			},
			Secrets: integration.Secrets,
		}
		result = append(result, data)
	}

	return result, nil
}

// NewRouter creates and configures the API router
func NewRouter(db *gorm.DB, logger *zap.Logger, wsHub *websocket.Hub, port int) *gin.Engine {
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()

	// Global middleware
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.CORS())

	// Initialize repositories
	flowRepo := repository.NewFlowRepository(db)
	executionRepo := repository.NewExecutionRepository(db)
	envRepo := repository.NewEnvironmentRepository(db)
	mockRepo := repository.NewMockRepository(db)
	contractRepo := repository.NewContractRepository(db)
	reportingRepo := repository.NewReportingRepository(db)
	collectionRepo := repository.NewCollectionRepository(db)
	historyRepo := repository.NewHistoryRepository(db)

	// Initialize encryption service for integrations
	encryptionKey := os.Getenv("ENCRYPTION_KEY")
	if encryptionKey == "" {
		logger.Warn("ENCRYPTION_KEY not set - generating temporary key (DO NOT USE IN PRODUCTION)")
		// Generate a temporary key for development (32 bytes = 64 hex chars)
		encryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	}
	encryptionService, err := security.NewEncryptionService(encryptionKey)
	if err != nil {
		logger.Fatal("Failed to initialize encryption service", zap.Error(err))
	}

	// Initialize integration repositories
	integrationRepo := repository.NewIntegrationRepository(db, encryptionService)
	gitTriggerRuleRepo := repository.NewGitTriggerRuleRepository(db)
	webhookDeliveryRepo := repository.NewWebhookDeliveryRepository(db)

	// Initialize reporting services
	reportOutputDir := filepath.Join(os.TempDir(), "testmesh", "reports")
	aggregator := reporting.NewAggregator(db, reportingRepo, executionRepo, flowRepo, logger)
	generator := reporting.NewGenerator(db, reportingRepo, executionRepo, flowRepo, logger, reportOutputDir)

	// Start scheduled aggregation
	if err := aggregator.ScheduleAggregation(); err != nil {
		logger.Error("Failed to schedule aggregation", zap.Error(err))
	}

	// Initialize AI services
	// First try to load from database, fallback to environment variables
	aiConfig := ai.ProviderConfig{
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),
		OpenAIAPIKey:    os.Getenv("OPENAI_API_KEY"),
		LocalEndpoint:   os.Getenv("LOCAL_LLM_ENDPOINT"),
	}
	aiProviders := ai.NewProviderManager(aiConfig, logger)

	// Try to reload from database (will use env vars as fallback if DB has no integrations)
	if err := aiProviders.ReloadFromDatabase(&integrationRepoAdapter{repo: integrationRepo}); err != nil {
		logger.Warn("Failed to load AI providers from database, using environment variables", zap.Error(err))
	}

	aiGenerator := ai.NewGenerator(db, aiProviders, flowRepo, logger)
	aiAnalyzer := ai.NewAnalyzer(db, aiProviders, flowRepo, logger)
	aiSelfHealing := ai.NewSelfHealingEngine(db, aiProviders, flowRepo, executionRepo, logger)
	aiRepo := repository.NewAIRepository(db)

	// Initialize services
	oauth2Service := auth.NewOAuth2Service(logger)

	// Initialize singleton mock manager (routes through main API server)
	mockBaseURL := fmt.Sprintf("http://localhost:%d", port)
	mockManager := mocks.NewManager(mockRepo, logger, mockBaseURL)
	mockManager.RestoreRunningServers() // re-register DB-persisted running servers on startup

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler(db)
	flowHandler := handlers.NewFlowHandler(flowRepo, logger)
	executionHandler := handlers.NewExecutionHandler(executionRepo, flowRepo, envRepo, contractRepo, mockManager, logger, wsHub)
	mockHandler := handlers.NewMockHandler(mockRepo, mockManager, logger)
	contractHandler := handlers.NewContractHandler(contractRepo, logger)
	reportingHandler := handlers.NewReportingHandler(reportingRepo, aggregator, generator, logger)
	aiHandler := handlers.NewAIHandler(db, aiRepo, aiGenerator, aiAnalyzer, aiSelfHealing, aiProviders, logger)
	collectionHandler := handlers.NewCollectionHandler(collectionRepo, flowRepo, logger)
	oauth2Handler := handlers.NewOAuth2Handler(oauth2Service, logger)
	historyHandler := handlers.NewHistoryHandler(historyRepo, logger)
	wsHandler := websocket.NewHandler(wsHub, logger)

	// Initialize debug controller
	debugController := debugger.NewController(logger)
	debugController.SetEventHandler(wsHub)

	// Initialize collection runner (executor created per-run to support parallel executions)
	executor := runner.NewExecutor(executionRepo, contractRepo, logger, wsHub, nil)
	executor.SetDebugController(debugController)
	collectionRunner := runner.NewCollectionRunner(executor, logger)
	runnerHandler := handlers.NewRunnerHandler(collectionRunner, flowRepo, envRepo, logger)

	// Initialize debug handler
	debugHandler := handlers.NewDebugHandler(debugController, logger)

	// Initialize workspace handler
	workspaceRepo := repository.NewWorkspaceRepository(db)
	workspaceHandler := handlers.NewWorkspaceHandler(workspaceRepo, logger)

	// Initialize bulk handler
	bulkHandler := handlers.NewBulkHandler(flowRepo, collectionRepo, logger)

	// Initialize import/export handler
	importExportHandler := handlers.NewImportExportHandler(flowRepo, logger)

	// Initialize load test handler
	loadTester := loadtest.NewLoadTester(logger)
	loadTestHandler := handlers.NewLoadTestHandler(loadTester, flowRepo, envRepo, logger)

	// Initialize plugin registry
	pluginDir := filepath.Join(os.TempDir(), "testmesh", "plugins")
	pluginRegistry := plugins.NewRegistry(pluginDir, logger)

	// Register native Go plugins (no external process needed)
	pluginRegistry.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
	pluginRegistry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))

	// Discover and load external plugins (JS, etc.)
	pluginRegistry.Discover()
	pluginRegistry.LoadAll()
	pluginHandler := handlers.NewPluginHandler(pluginRegistry, logger)

	// Initialize scheduler
	scheduleRepo := repository.NewScheduleRepository(db)
	sched := scheduler.NewScheduler(scheduleRepo, logger)
	scheduleHandler := handlers.NewScheduleHandler(scheduleRepo, sched, logger)

	// Start the scheduler
	if err := sched.Start(); err != nil {
		logger.Error("Failed to start scheduler", zap.Error(err))
	}

	// Initialize collaboration handler
	collaborationRepo := repository.NewCollaborationRepository(db)
	collaborationHandler := handlers.NewCollaborationHandler(collaborationRepo, logger)

	// Initialize environment handler
	envHandler := handlers.NewEnvironmentHandler(envRepo, logger)

	// Initialize integration handlers
	integrationHandler := handlers.NewIntegrationHandler(integrationRepo, aiProviders, logger)
	gitTriggerRuleHandler := handlers.NewGitTriggerRuleHandler(gitTriggerRuleRepo, logger)
	webhookHandler := handlers.NewWebhookHandler(integrationRepo, gitTriggerRuleRepo, webhookDeliveryRepo, sched, logger)

	// Health check
	router.GET("/health", healthHandler.Check)

	// Mock server wildcard route — serves all mock endpoints through the main API server
	router.Any("/mocks/:server_id/*path", mockManager.GinHandler())

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Workspace-scoped routes (multi-tenant)
		ws := v1.Group("/workspaces/:workspace_id")
		ws.Use(middleware.WorkspaceScope(workspaceRepo))
		{
			// Git trigger rules (workspace-scoped)
			gitTriggerRules := ws.Group("/git-trigger-rules")
			{
				gitTriggerRules.GET("", gitTriggerRuleHandler.List)
				gitTriggerRules.POST("", gitTriggerRuleHandler.Create)
				gitTriggerRules.GET("/:id", gitTriggerRuleHandler.Get)
				gitTriggerRules.PUT("/:id", gitTriggerRuleHandler.Update)
				gitTriggerRules.DELETE("/:id", gitTriggerRuleHandler.Delete)
			}

			// Collection routes (workspace-scoped)
			collections := ws.Group("/collections")
			{
				collections.POST("", collectionHandler.Create)
				collections.GET("", collectionHandler.List)
				collections.GET("/tree", collectionHandler.GetTree)
				collections.GET("/search", collectionHandler.Search)
				collections.GET("/:id", collectionHandler.Get)
				collections.PUT("/:id", collectionHandler.Update)
				collections.DELETE("/:id", collectionHandler.Delete)
				collections.GET("/:id/children", collectionHandler.GetChildren)
				collections.GET("/:id/flows", collectionHandler.GetFlows)
				collections.POST("/:id/flows", collectionHandler.AddFlow)
				collections.DELETE("/:id/flows/:flow_id", collectionHandler.RemoveFlow)
				collections.GET("/:id/ancestors", collectionHandler.GetAncestors)
				collections.POST("/:id/move", collectionHandler.Move)
				collections.POST("/:id/duplicate", collectionHandler.Duplicate)
				collections.POST("/:id/reorder", collectionHandler.Reorder)
			}

			// Flow routes (workspace-scoped)
			flows := ws.Group("/flows")
			{
				flows.POST("", flowHandler.Create)
				flows.GET("", flowHandler.List)
				flows.GET("/:id", flowHandler.Get)
				flows.PUT("/:id", flowHandler.Update)
				flows.DELETE("/:id", flowHandler.Delete)
			}

			// Environment routes (workspace-scoped)
			environments := ws.Group("/environments")
			{
				environments.GET("", envHandler.List)
				environments.GET("/default", envHandler.GetDefault)
				environments.POST("", envHandler.Create)
				environments.POST("/import", envHandler.Import)
				environments.GET("/:id", envHandler.Get)
				environments.PUT("/:id", envHandler.Update)
				environments.DELETE("/:id", envHandler.Delete)
				environments.POST("/:id/default", envHandler.SetDefault)
				environments.POST("/:id/duplicate", envHandler.Duplicate)
				environments.GET("/:id/export", envHandler.Export)
			}

			// Execution routes (workspace-scoped)
			executions := ws.Group("/executions")
			{
				executions.POST("", executionHandler.Create)
				executions.GET("", executionHandler.List)
				executions.GET("/:id", executionHandler.Get)
				executions.POST("/:id/cancel", executionHandler.Cancel)
				executions.GET("/:id/logs", executionHandler.GetLogs)
				executions.GET("/:id/steps", executionHandler.GetSteps)
				executions.GET("/:id/steps/:step_id", executionHandler.GetStep)
			}
		}

		// Mock server routes
		mocksGroup := v1.Group("/mock-servers")
		{
			mocksGroup.GET("", mockHandler.ListServers)
			mocksGroup.POST("", mockHandler.CreateServer)
			mocksGroup.GET("/:id", mockHandler.GetServer)
			mocksGroup.DELETE("/:id", mockHandler.DeleteServer)
			mocksGroup.POST("/:id/start", mockHandler.StartServer)
			mocksGroup.POST("/:id/stop", mockHandler.StopServer)
			mocksGroup.GET("/:id/endpoints", mockHandler.GetEndpoints)
			mocksGroup.POST("/:id/endpoints", mockHandler.CreateEndpoint)
			mocksGroup.PUT("/:id/endpoints/:endpoint_id", mockHandler.UpdateEndpoint)
			mocksGroup.DELETE("/:id/endpoints/:endpoint_id", mockHandler.DeleteEndpoint)
			mocksGroup.GET("/:id/requests", mockHandler.GetRequests)
			mocksGroup.GET("/:id/requests/:request_id", mockHandler.GetRequest)
			mocksGroup.DELETE("/:id/requests", mockHandler.DeleteRequests)
			mocksGroup.GET("/:id/state", mockHandler.GetStates)
			mocksGroup.POST("/:id/state", mockHandler.CreateState)
			mocksGroup.GET("/:id/state/:key", mockHandler.GetState)
			mocksGroup.PUT("/:id/state/:key", mockHandler.UpdateState)
			mocksGroup.DELETE("/:id/state/:key", mockHandler.DeleteState)
		}

		// Contract testing routes
		contractsGroup := v1.Group("/contracts")
		{
			contractsGroup.GET("", contractHandler.ListContracts)
			contractsGroup.GET("/versions", contractHandler.GetContractVersions)
			contractsGroup.POST("/import", contractHandler.ImportPact)
			contractsGroup.POST("/breaking-changes", contractHandler.DetectBreakingChanges)
			contractsGroup.GET("/:id", contractHandler.GetContract)
			contractsGroup.DELETE("/:id", contractHandler.DeleteContract)
			contractsGroup.GET("/:id/pact", contractHandler.ExportPact)
			contractsGroup.GET("/:id/verifications", contractHandler.ListVerifications)
			contractsGroup.GET("/:id/breaking-changes", contractHandler.ListBreakingChanges)
			contractsGroup.GET("/:id/interactions", contractHandler.ListInteractions)
			contractsGroup.GET("/:id/interactions/:interaction_id", contractHandler.GetInteraction)
			contractsGroup.DELETE("/:id/interactions/:interaction_id", contractHandler.DeleteInteraction)
		}

		// Verification routes
		verifications := v1.Group("/verifications")
		{
			verifications.POST("", contractHandler.CreateVerification)
			verifications.GET("/:id", contractHandler.GetVerification)
			verifications.PUT("/:id", contractHandler.UpdateVerification)
		}

		// Report routes
		reports := v1.Group("/reports")
		{
			reports.POST("/generate", reportingHandler.GenerateReport)
			reports.GET("", reportingHandler.ListReports)
			reports.GET("/:id", reportingHandler.GetReport)
			reports.GET("/:id/download", reportingHandler.DownloadReport)
			reports.DELETE("/:id", reportingHandler.DeleteReport)
		}

		// Analytics routes
		analytics := v1.Group("/analytics")
		{
			analytics.GET("/metrics", reportingHandler.GetMetrics)
			analytics.GET("/flakiness", reportingHandler.GetFlakiness)
			analytics.GET("/trends", reportingHandler.GetTrends)
			analytics.GET("/steps", reportingHandler.GetStepPerformance)
			analytics.POST("/aggregate", reportingHandler.TriggerAggregation)
		}

		// AI routes
		aiRoutes := v1.Group("/ai")
		{
			aiRoutes.POST("/generate", aiHandler.Generate)
			aiRoutes.POST("/import/openapi", aiHandler.ImportOpenAPI)
			aiRoutes.POST("/import/postman", aiHandler.ImportPostman)
			aiRoutes.POST("/import/pact", aiHandler.ImportPact)
			aiRoutes.POST("/coverage/analyze", aiHandler.AnalyzeCoverage)
			aiRoutes.POST("/analyze/:execution_id", aiHandler.AnalyzeFailure)
			aiRoutes.GET("/suggestions", aiHandler.ListSuggestions)
			aiRoutes.GET("/suggestions/:id", aiHandler.GetSuggestion)
			aiRoutes.POST("/suggestions/:id/apply", aiHandler.ApplySuggestion)
			aiRoutes.POST("/suggestions/:id/accept", aiHandler.AcceptSuggestion)
			aiRoutes.POST("/suggestions/:id/reject", aiHandler.RejectSuggestion)
			aiRoutes.DELETE("/suggestions/:id", aiHandler.DeleteSuggestion)
			aiRoutes.GET("/usage", aiHandler.GetUsage)
			aiRoutes.GET("/providers", aiHandler.GetProviders)
			aiRoutes.GET("/generation-history", aiHandler.ListGenerationHistory)
			aiRoutes.GET("/generation-history/:id", aiHandler.GetGenerationHistory)
			aiRoutes.GET("/import-history", aiHandler.ListImportHistory)
			aiRoutes.GET("/import-history/:id", aiHandler.GetImportHistory)
			aiRoutes.GET("/coverage-analysis", aiHandler.ListCoverageAnalyses)
			aiRoutes.GET("/coverage-analysis/:id", aiHandler.GetCoverageAnalysis)
		}

		// OAuth2 routes
		oauth2 := v1.Group("/oauth2")
		{
			oauth2.GET("/providers", oauth2Handler.GetProviders)
			oauth2.GET("/providers/:name", oauth2Handler.GetProvider)
			oauth2.POST("/auth-url", oauth2Handler.GetAuthorizationURL)
			oauth2.POST("/token/code", oauth2Handler.ExchangeCode)
			oauth2.POST("/token/client-credentials", oauth2Handler.ClientCredentials)
			oauth2.POST("/token/password", oauth2Handler.PasswordGrant)
			oauth2.POST("/token/refresh", oauth2Handler.RefreshToken)
		}

		// Request history routes
		history := v1.Group("/history")
		{
			history.POST("", historyHandler.Create)
			history.GET("", historyHandler.List)
			history.GET("/stats", historyHandler.GetStats)
			history.GET("/:id", historyHandler.Get)
			history.DELETE("/:id", historyHandler.Delete)
			history.POST("/:id/save", historyHandler.Save)
			history.POST("/:id/unsave", historyHandler.Unsave)
			history.POST("/:id/tags", historyHandler.AddTag)
			history.DELETE("/:id/tags/:tag", historyHandler.RemoveTag)
			history.DELETE("", historyHandler.Clear)
		}

		// Collection runner routes (data-driven testing)
		runnerRoutes := v1.Group("/runner")
		{
			runnerRoutes.POST("/run", runnerHandler.Run)
			runnerRoutes.POST("/parse-data", runnerHandler.ParseData)
		}

		// Workspace routes (use :workspace_id to match scoped routes)
		workspaces := v1.Group("/workspaces")
		{
			workspaces.POST("", workspaceHandler.Create)
			workspaces.GET("", workspaceHandler.List)
			workspaces.GET("/personal", workspaceHandler.GetPersonal)
			workspaces.GET("/slug/:slug", workspaceHandler.GetBySlug)
			workspaces.GET("/:workspace_id", workspaceHandler.Get)
			workspaces.PUT("/:workspace_id", workspaceHandler.Update)
			workspaces.DELETE("/:workspace_id", workspaceHandler.Delete)
			workspaces.GET("/:workspace_id/role", workspaceHandler.GetUserRole)
			workspaces.GET("/:workspace_id/members", workspaceHandler.ListMembers)
			workspaces.POST("/:workspace_id/members", workspaceHandler.AddMember)
			workspaces.PUT("/:workspace_id/members/:user_id", workspaceHandler.UpdateMember)
			workspaces.DELETE("/:workspace_id/members/:user_id", workspaceHandler.RemoveMember)
			workspaces.GET("/:workspace_id/invitations", workspaceHandler.ListInvitations)
			workspaces.POST("/:workspace_id/invitations", workspaceHandler.InviteMember)
			workspaces.DELETE("/:workspace_id/invitations/:invitation_id", workspaceHandler.RevokeInvitation)
		}

		// Invitation acceptance (outside workspace context)
		v1.POST("/invitations/accept", workspaceHandler.AcceptInvitation)

		// Bulk operations routes
		bulk := v1.Group("/bulk/flows")
		{
			bulk.POST("/tags/add", bulkHandler.AddTags)
			bulk.POST("/tags/remove", bulkHandler.RemoveTags)
			bulk.POST("/move", bulkHandler.Move)
			bulk.POST("/delete", bulkHandler.Delete)
			bulk.POST("/duplicate", bulkHandler.Duplicate)
			bulk.POST("/export", bulkHandler.Export)
			bulk.POST("/find-replace", bulkHandler.FindReplace)
		}

		// Import/Export routes
		v1.POST("/import/parse", importExportHandler.Parse)
		v1.POST("/import", importExportHandler.Import)
		v1.POST("/export", importExportHandler.Export)
		v1.GET("/export/download", importExportHandler.ExportDownload)

		// Load testing routes
		loadTests := v1.Group("/load-tests")
		{
			loadTests.POST("", loadTestHandler.Start)
			loadTests.GET("", loadTestHandler.List)
			loadTests.GET("/:id", loadTestHandler.Get)
			loadTests.POST("/:id/stop", loadTestHandler.Stop)
			loadTests.GET("/:id/metrics", loadTestHandler.GetMetrics)
			loadTests.GET("/:id/timeline", loadTestHandler.GetTimeline)
		}

		// Plugin routes
		pluginsRoutes := v1.Group("/plugins")
		{
			pluginsRoutes.GET("", pluginHandler.List)
			pluginsRoutes.GET("/types", pluginHandler.GetTypes)
			pluginsRoutes.POST("/discover", pluginHandler.Discover)
			pluginsRoutes.POST("/install", pluginHandler.Install)
			pluginsRoutes.GET("/:id", pluginHandler.Get)
			pluginsRoutes.POST("/:id/enable", pluginHandler.Enable)
			pluginsRoutes.POST("/:id/disable", pluginHandler.Disable)
			pluginsRoutes.DELETE("/:id", pluginHandler.Uninstall)
		}

		// Schedule routes
		schedules := v1.Group("/schedules")
		{
			schedules.POST("", scheduleHandler.Create)
			schedules.GET("", scheduleHandler.List)
			schedules.GET("/presets", scheduleHandler.GetPresets)
			schedules.GET("/timezones", scheduleHandler.GetTimezones)
			schedules.POST("/validate-cron", scheduleHandler.ValidateCron)
			schedules.GET("/:id", scheduleHandler.Get)
			schedules.PUT("/:id", scheduleHandler.Update)
			schedules.DELETE("/:id", scheduleHandler.Delete)
			schedules.POST("/:id/pause", scheduleHandler.Pause)
			schedules.POST("/:id/resume", scheduleHandler.Resume)
			schedules.POST("/:id/trigger", scheduleHandler.Trigger)
			schedules.GET("/:id/runs", scheduleHandler.GetRuns)
			schedules.GET("/:id/stats", scheduleHandler.GetStats)
		}

		// Debug routes
		debug := v1.Group("/debug")
		{
			debug.GET("/sessions", debugHandler.ListSessions)
			debug.POST("/sessions", debugHandler.StartSession)
			debug.GET("/sessions/:id", debugHandler.GetSession)
			debug.DELETE("/sessions/:id", debugHandler.EndSession)
			debug.GET("/sessions/:id/state", debugHandler.GetState)
			debug.GET("/sessions/:id/history", debugHandler.GetHistory)
			debug.GET("/sessions/:id/breakpoints", debugHandler.ListBreakpoints)
			debug.POST("/sessions/:id/breakpoints", debugHandler.AddBreakpoint)
			debug.DELETE("/sessions/:id/breakpoints/:breakpoint_id", debugHandler.RemoveBreakpoint)
			debug.POST("/sessions/:id/breakpoints/:breakpoint_id/toggle", debugHandler.ToggleBreakpoint)
			debug.POST("/sessions/:id/pause", debugHandler.Pause)
			debug.POST("/sessions/:id/resume", debugHandler.Resume)
			debug.POST("/sessions/:id/step-over", debugHandler.StepOver)
			debug.POST("/sessions/:id/stop", debugHandler.Stop)
		}

		// Collaboration routes
		collaboration := v1.Group("/collaboration")
		{
			// Presence
			collaboration.POST("/presence", collaborationHandler.SetPresence)
			collaboration.DELETE("/presence", collaborationHandler.RemovePresence)
			collaboration.GET("/presence/:resource_type/:resource_id", collaborationHandler.GetPresence)

			// Comments
			collaboration.POST("/comments", collaborationHandler.CreateComment)
			collaboration.GET("/comments/:id", collaborationHandler.GetComment)
			collaboration.PUT("/comments/:id", collaborationHandler.UpdateComment)
			collaboration.DELETE("/comments/:id", collaborationHandler.DeleteComment)
			collaboration.POST("/comments/:id/resolve", collaborationHandler.ResolveComment)
			collaboration.POST("/comments/:id/unresolve", collaborationHandler.UnresolveComment)

			// Flow-specific comments
			collaboration.GET("/flows/:flow_id/comments", collaborationHandler.ListFlowComments)

			// Flow versions
			collaboration.GET("/flows/:flow_id/versions", collaborationHandler.ListFlowVersions)
			collaboration.GET("/flows/:flow_id/versions/compare", collaborationHandler.CompareVersions)
			collaboration.GET("/flows/:flow_id/versions/:version", collaborationHandler.GetFlowVersion)

			// Activity feed
			collaboration.GET("/activity", collaborationHandler.ListActivity)
		}

		// Admin routes (require admin middleware)
		admin := v1.Group("/admin")
		admin.Use(middleware.RequireAdmin())
		{
			// System integrations (AI providers, Git webhooks)
			integrations := admin.Group("/integrations")
			{
				integrations.GET("", integrationHandler.List)
				integrations.POST("", integrationHandler.Create)
				integrations.GET("/:id", integrationHandler.Get)
				integrations.PUT("/:id", integrationHandler.Update)
				integrations.DELETE("/:id", integrationHandler.Delete)
				integrations.POST("/:id/test", integrationHandler.TestConnection)
				integrations.GET("/:id/secrets", integrationHandler.GetSecrets)
				integrations.PUT("/:id/secrets", integrationHandler.UpdateSecrets)
			}
		}

		// Public webhook endpoint (no auth - signature verified)
		v1.POST("/webhooks/github", webhookHandler.HandleGitHub)

	}

	// WebSocket routes
	router.GET("/ws/executions/:id", wsHandler.HandleConnection)

	// 404 handler
	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
	})

	return router
}
