package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/ai"
	"github.com/test-mesh/testmesh/internal/api/handlers"
	sharedconfig "github.com/test-mesh/testmesh/internal/shared/config"
	"github.com/test-mesh/testmesh/internal/filestorage"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/api/websocket"
	"github.com/test-mesh/testmesh/internal/auth"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/cloud"
	codescanner "github.com/test-mesh/testmesh/internal/graph/scanner/code"
	"github.com/test-mesh/testmesh/internal/graph/scanner/flow"
	"github.com/test-mesh/testmesh/internal/graph/scanner/infra"
	"github.com/test-mesh/testmesh/internal/graph/scanner/spec"
	graphrepo "github.com/test-mesh/testmesh/internal/graph/repo"
	graphscanner "github.com/test-mesh/testmesh/internal/graph/scanner"
	tracescanner "github.com/test-mesh/testmesh/internal/graph/scanner/trace"
	"github.com/test-mesh/testmesh/internal/plugins"
	"github.com/test-mesh/testmesh/internal/telemetry"
	"github.com/test-mesh/testmesh/internal/tracing"
	"github.com/test-mesh/testmesh/internal/reporting"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/runner/debugger"
	"github.com/test-mesh/testmesh/internal/runner/mocks"
	"github.com/test-mesh/testmesh/internal/scheduler"
	"github.com/test-mesh/testmesh/internal/security"
	"github.com/test-mesh/testmesh/internal/shared/notifications"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
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

// GetAIIntegrationsForWorkspace implements ai.IntegrationProvider
func (a *integrationRepoAdapter) GetAIIntegrationsForWorkspace(workspaceID uuid.UUID) ([]*ai.IntegrationData, error) {
	integrations, err := a.repo.GetAIIntegrationsForWorkspaceWithSecrets(workspaceID)
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
func NewRouter(db *gorm.DB, logger *zap.Logger, wsHub *websocket.Hub, port int, graphEngine ...graph.Engine) *gin.Engine {
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

	// Initialize notification dispatcher
	notifRepo := repository.NewNotificationRepository(db)
	notifDispatcher := notifications.NewNotificationDispatcher(notifRepo, integrationRepo, logger)

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

	aiGenerator := ai.NewGenerator(db, aiProviders, flowRepo, envRepo, logger)
	aiAnalyzer := ai.NewAnalyzer(db, aiProviders, flowRepo, logger)
	aiSelfHealing := ai.NewSelfHealingEngine(db, aiProviders, flowRepo, executionRepo, logger)
	aiRepo := repository.NewAIRepository(db)

	// Repository link support
	repoLinkRepo := repository.NewRepositoryLinkRepository(db)
	aiDiffAnalyzer := ai.NewDiffAnalyzer(db, aiProviders, flowRepo, repoLinkRepo, logger)

	// Initialize embedding infrastructure (if OpenAI key available for embeddings)
	var embeddingPipeline *ai.EmbeddingPipeline
	var semanticSearch *ai.SemanticSearch
	openAIKey := os.Getenv("OPENAI_API_KEY")
	if openAIKey != "" {
		embedder := ai.NewOpenAIEmbeddingProvider(openAIKey)
		vectorStore := ai.NewPgVectorStore(db, embedder.Dimensions())
		semanticSearch = ai.NewSemanticSearch(embedder, vectorStore)
		embeddingPipeline = ai.NewEmbeddingPipeline(embedder, vectorStore, logger)
		embeddingPipeline.Start(context.Background())
		aiDiffAnalyzer.SetSemanticSearch(semanticSearch)
		logger.Info("Embedding pipeline initialized")
	}

	// Initialize services
	oauth2Service := auth.NewOAuth2Service(logger)

	// Initialize singleton mock manager (routes through main API server)
	mockBaseURL := fmt.Sprintf("http://localhost:%d", port)
	mockManager := mocks.NewManager(mockRepo, logger, mockBaseURL)
	mockManager.RestoreRunningServers() // re-register DB-persisted running servers on startup

	// Initialize collaboration repository (needed by multiple handlers)
	collaborationRepo := repository.NewCollaborationRepository(db)

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler(db)
	proxyHandler := handlers.NewProxyHandler(logger)
	flowHandler := handlers.NewFlowHandler(flowRepo, collaborationRepo, logger)
	executionHandler := handlers.NewExecutionHandler(executionRepo, flowRepo, envRepo, mockManager, logger, wsHub)
	executionHandler.SetNotificationDispatcher(notifDispatcher)
	mockHandler := handlers.NewMockHandler(mockRepo, mockManager, logger)
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
	executor := runner.NewExecutor(executionRepo, logger, wsHub, nil)
	executor.SetDebugController(debugController)
	collectionRunner := runner.NewCollectionRunner(executor, logger)
	runnerHandler := handlers.NewRunnerHandler(collectionRunner, flowRepo, envRepo, logger)

	// Initialize execution tracer for OpenTelemetry instrumentation
	executionTracer := tracing.NewExecutionTracer()
	executor.SetExecutionTracer(executionTracer)

	// Initialize telemetry pipeline
	telemetryRepo := telemetry.NewTelemetryRepository(db, logger)
	spanProcessor := telemetry.NewSpanProcessor(telemetryRepo, logger)
	otlpReceiver := telemetry.NewOTLPReceiver(spanProcessor, logger)
	cleanupJob := telemetry.NewCleanupJob(telemetryRepo, logger)
	flowDiscovery := telemetry.NewFlowDiscovery(telemetryRepo, logger)
	traceValidator := telemetry.NewTraceValidator(telemetryRepo, flowDiscovery, logger)
	rootCauseAnalyzer := telemetry.NewRootCauseAnalyzer(telemetryRepo, logger)
	telemetryHandler := telemetry.NewTelemetryHandler(telemetryRepo, flowDiscovery, traceValidator, rootCauseAnalyzer, logger)

	// Start telemetry lifecycle
	spanProcessor.Start(context.Background())
	cleanupJob.Start(context.Background())

	// Wire flow discovery: completed traces → discover flow patterns
	go func() {
		for tc := range spanProcessor.DiscoveryChan() {
			if err := flowDiscovery.ProcessCompletedTrace(context.Background(), tc.WorkspaceID, tc.TraceID); err != nil {
				logger.Warn("flow discovery failed",
					zap.String("trace_id", tc.TraceID),
					zap.Error(err))
			}
		}
	}()

	// Initialize debug handler
	debugHandler := handlers.NewDebugHandler(debugController, logger)

	// Initialize notification handler
	notifHandler := handlers.NewNotificationHandler(notifRepo, logger)

	// Initialize workspace handler
	workspaceRepo := repository.NewWorkspaceRepository(db)
	workspaceHandler := handlers.NewWorkspaceHandler(workspaceRepo, logger)

	// Initialize bulk handler
	bulkHandler := handlers.NewBulkHandler(flowRepo, collectionRepo, logger)

	// Initialize import/export handler
	importExportHandler := handlers.NewImportExportHandler(flowRepo, logger)

	// Initialize dataset handler (file storage for data-driven testing)
	datasetRepo := repository.NewDatasetRepository(db)
	var s3Client *filestorage.Client
	s3Client, err = filestorage.New(filestorage.Config{
		Endpoint:  getEnvOrDefault("MINIO_ENDPOINT", "localhost:9000"),
		AccessKey: getEnvOrDefault("MINIO_ACCESS_KEY", "minioadmin"),
		SecretKey: getEnvOrDefault("MINIO_SECRET_KEY", "minioadmin"),
		UseSSL:    os.Getenv("MINIO_USE_SSL") == "true",
		Bucket:    getEnvOrDefault("MINIO_BUCKET", "testmesh"),
		Region:    os.Getenv("MINIO_REGION"),
	}, logger)
	if err != nil {
		logger.Warn("MinIO not available — dataset uploads disabled (list/get still work)", zap.Error(err))
		s3Client = nil
	} else {
		logger.Info("MinIO file storage initialized")
	}
	datasetHandler := handlers.NewDatasetHandler(datasetRepo, s3Client, logger)

	// Initialize plugin registry
	pluginDir := filepath.Join(os.TempDir(), "testmesh", "plugins")
	pluginRegistry := plugins.NewRegistry(pluginDir, logger)

	// Register native Go plugins (no external process needed)
	pluginRegistry.RegisterAction("kafka",      plugins.NewKafkaNativePlugin(logger))
	pluginRegistry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))
	pluginRegistry.RegisterAction("redis",      plugins.NewRedisNativePlugin(logger))
	pluginRegistry.RegisterAction("neo4j",      plugins.NewNeo4jNativePlugin(logger))
	pluginRegistry.RegisterAction("minio",      plugins.NewMinioNativePlugin(logger))
	pluginRegistry.RegisterAction("otel",       plugins.NewOtelNativePlugin(logger))
	pluginRegistry.RegisterAction("loki",       plugins.NewLokiNativePlugin(logger))
	pluginRegistry.RegisterAction("prometheus", plugins.NewPrometheusNativePlugin(logger))

	// Discover and load external plugins (JS, Python, etc. via HTTP protocol)
	pluginRegistry.Discover()
	pluginRegistry.LoadAll()
	pluginHandler := handlers.NewPluginHandler(pluginRegistry, logger)

	// Wire plugin registry into the executor so plugin actions are available at runtime
	executor.SetPluginRegistry(pluginRegistry)

	// Initialize scheduler
	scheduleRepo := repository.NewScheduleRepository(db)
	sched := scheduler.NewScheduler(scheduleRepo, logger)
	scheduleHandler := handlers.NewScheduleHandler(scheduleRepo, sched, logger)

	// Start the scheduler
	if err := sched.Start(); err != nil {
		logger.Error("Failed to start scheduler", zap.Error(err))
	}

	// Initialize collaboration handler
	collaborationHandler := handlers.NewCollaborationHandler(collaborationRepo, logger)

	// Initialize environment handler
	envHandler := handlers.NewEnvironmentHandler(envRepo, logger)

	// Initialize integration handlers
	integrationHandler := handlers.NewIntegrationHandler(integrationRepo, aiProviders, logger)
	gitTriggerRuleHandler := handlers.NewGitTriggerRuleHandler(gitTriggerRuleRepo, logger)
	webhookHandler := handlers.NewWebhookHandler(integrationRepo, gitTriggerRuleRepo, webhookDeliveryRepo, repoLinkRepo, aiDiffAnalyzer, aiSelfHealing, sched, embeddingPipeline, logger)
	repositoryLinkHandler := handlers.NewRepositoryLinkHandler(repoLinkRepo, logger)

	// Initialize GitHub OAuth handler
	githubAppID, _ := strconv.ParseInt(os.Getenv("GITHUB_APP_ID"), 10, 64)
	githubCfg := sharedconfig.GitHubAppConfig{
		AppID:         githubAppID,
		PrivateKey:    os.Getenv("GITHUB_PRIVATE_KEY"),
		ClientID:      os.Getenv("GITHUB_CLIENT_ID"),
		ClientSecret:  os.Getenv("GITHUB_CLIENT_SECRET"),
		WebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
	}
	dashboardURL := getEnvOrDefault("DASHBOARD_URL", "http://localhost:3000")
	githubOAuthHandler := handlers.NewGitHubOAuthHandler(db, githubCfg, integrationRepo, dashboardURL, logger)

	// Health check
	router.GET("/health", healthHandler.Check)

	// OTLP receiver endpoint (root level — OTLP convention, not under /api/v1)
	router.POST("/otlp/v1/traces", otlpReceiver.HandleTraces)

	// Mock server wildcard route — serves all mock endpoints through the main API server
	router.Any("/mocks/:server_id/*path", mockManager.GinHandler())

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Workspace-scoped routes (multi-tenant)
		ws := v1.Group("/workspaces/:workspace_id")
		ws.Use(middleware.WorkspaceScope(workspaceRepo))
		{
			// Notification routes (workspace-scoped)
			notifs := ws.Group("/notifications")
			{
				notifs.GET("", notifHandler.List)
				notifs.PATCH("/:id/read", notifHandler.MarkRead)
				notifs.PATCH("/read-all", notifHandler.MarkAllRead)
				notifs.DELETE("/:id", notifHandler.Delete)
			}

			// Git trigger rules (workspace-scoped)
			gitTriggerRules := ws.Group("/git-trigger-rules")
			{
				gitTriggerRules.GET("", gitTriggerRuleHandler.List)
				gitTriggerRules.POST("", gitTriggerRuleHandler.Create)
				gitTriggerRules.GET("/:id", gitTriggerRuleHandler.Get)
				gitTriggerRules.PUT("/:id", gitTriggerRuleHandler.Update)
				gitTriggerRules.DELETE("/:id", gitTriggerRuleHandler.Delete)
			}

			// GitHub OAuth (workspace-scoped: authorize + installations require workspace context)
			wsGitHub := ws.Group("/github")
			{
				wsGitHub.GET("/oauth/authorize", githubOAuthHandler.Authorize)
				wsGitHub.GET("/installations", githubOAuthHandler.ListInstallations)
			}

			// Repository links (workspace-scoped)
			repoLinks := ws.Group("/repository-links")
			{
				repoLinks.GET("", repositoryLinkHandler.List)
				repoLinks.POST("", repositoryLinkHandler.Create)
				repoLinks.GET("/:link_id", repositoryLinkHandler.Get)
				repoLinks.PUT("/:link_id", repositoryLinkHandler.Update)
				repoLinks.DELETE("/:link_id", repositoryLinkHandler.Delete)
			}

			// Workspace AI config routes
			wsAIConfig := ws.Group("/ai-config")
			{
				wsAIConfig.GET("", func(c *gin.Context) {
					workspaceIDStr := c.Param("workspace_id")
					wsID, err := uuid.Parse(workspaceIDStr)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
						return
					}
					var config models.WorkspaceAIConfig
					if err := db.Where("workspace_id = ?", wsID).First(&config).Error; err != nil {
						// Return empty config if none exists
						c.JSON(http.StatusOK, gin.H{"workspace_id": wsID, "default_provider": "", "agent_overrides": []interface{}{}})
						return
					}
					c.JSON(http.StatusOK, config)
				})
				wsAIConfig.PUT("", func(c *gin.Context) {
					workspaceIDStr := c.Param("workspace_id")
					wsID, err := uuid.Parse(workspaceIDStr)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
						return
					}
					var req struct {
						DefaultProvider string                          `json:"default_provider"`
						AgentOverrides  []models.AgentProviderOverride  `json:"agent_overrides"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					config := models.WorkspaceAIConfig{
						WorkspaceID:     wsID,
						DefaultProvider: req.DefaultProvider,
						AgentOverrides:  req.AgentOverrides,
					}
					// Upsert
					result := db.Where("workspace_id = ?", wsID).Assign(config).FirstOrCreate(&config)
					if result.Error != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
						return
					}
					c.JSON(http.StatusOK, config)
				})
			}

			// Dataset routes (workspace-scoped)
			datasets := ws.Group("/datasets")
			{
				datasets.POST("/upload", datasetHandler.Upload)
				datasets.GET("", datasetHandler.List)
				datasets.GET("/:id", datasetHandler.Get)
				datasets.GET("/:id/download", datasetHandler.Download)
				datasets.GET("/:id/content", datasetHandler.GetContent)
				datasets.DELETE("/:id", datasetHandler.Delete)
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
				flows.POST("/:id/versions/:version/restore", flowHandler.RestoreVersion)
			}

			// Import/Export routes (workspace-scoped)
			ws.POST("/import/parse", importExportHandler.Parse)
			ws.POST("/import", importExportHandler.Import)
			ws.POST("/export", importExportHandler.Export)
			ws.GET("/export/download", importExportHandler.ExportDownload)

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

			// Report routes (workspace-scoped)
			wsReports := ws.Group("/reports")
			{
				wsReports.POST("/generate", reportingHandler.GenerateReport)
				wsReports.GET("", reportingHandler.ListReports)
				wsReports.GET("/:id", reportingHandler.GetReport)
				wsReports.GET("/:id/download", reportingHandler.DownloadReport)
				wsReports.DELETE("/:id", reportingHandler.DeleteReport)
			}

			// Telemetry routes (workspace-scoped)
			telemetryRoutes := ws.Group("/telemetry")
			{
				telemetryRoutes.GET("/flows", telemetryHandler.ListDiscoveredFlows)
				telemetryRoutes.GET("/flows/:flow_id", telemetryHandler.GetDiscoveredFlow)
				telemetryRoutes.POST("/flows/:flow_id/export", telemetryHandler.ExportFlowYAML)
				telemetryRoutes.GET("/spans", telemetryHandler.QuerySpans)
				telemetryRoutes.GET("/drift", telemetryHandler.ListDriftAlerts)
			}
			ws.GET("/settings/telemetry", telemetryHandler.GetTraceSettings)
			ws.PUT("/settings/telemetry", telemetryHandler.UpdateTraceSettings)
			ws.GET("/executions/:id/trace-validation", telemetryHandler.GetTraceValidation)

			// Graph routes (workspace-scoped)
			if len(graphEngine) > 0 && graphEngine[0] != nil && graphEngine[0].IsAvailable() || (len(graphEngine) > 0 && graphEngine[0] != nil) {
				ge := graphEngine[0]
				traceScanner := tracescanner.New(telemetryRepo, logger)
				scanners := []graphscanner.Scanner{
					infra.New(logger),
					spec.New(logger),
					flow.New(logger),
					codescanner.NewGoScanner(logger),
					codescanner.NewTypeScriptScanner(logger),
					codescanner.NewPythonScanner(logger),
					codescanner.NewJavaScanner(logger),
					codescanner.NewDotNetScanner(logger),
					traceScanner,
				}
				mergeEngine := graph.NewMergeEngine(db, ge, logger)
				crossRepoMerger := graphscanner.NewCrossRepoMerger(db, ge, logger)
				orchestrator := graphscanner.NewOrchestrator(ge, mergeEngine, crossRepoMerger, scanners, logger)

				// Wire graph resolver into the executor for graph-aware step resolution
				graphResolver := graph.NewGraphResolver(ge, logger)
				executor.SetGraphResolver(graphResolver)
				clonePath := os.Getenv("GRAPH_REPO_CLONE_PATH")
				if clonePath == "" {
					clonePath = "/tmp/testmesh-repos"
				}
				repoMgr := graphrepo.NewManager(ge, clonePath, logger)
				graphHandler := handlers.NewGraphHandler(ge, orchestrator, repoMgr, crossRepoMerger, db, logger)

				// Wire graph scan deps into the webhook handler so pushes trigger rescans
				webhookHandler.SetGraphScanDeps(ge, repoMgr, orchestrator)

				graphRoutes := ws.Group("/graph")
				{
					// Graph management
					graphRoutes.POST("/scan", graphHandler.TriggerScan)
					graphRoutes.GET("/status", graphHandler.GetGraphStatus)
					graphRoutes.DELETE("", graphHandler.ClearGraph)
					graphRoutes.GET("/stats", graphHandler.GetStats)

					// Repos
					repos := graphRoutes.Group("/repos")
					{
						repos.POST("", graphHandler.CreateRepo)
						repos.GET("", graphHandler.ListRepos)
						repos.PUT("/:repo_id", graphHandler.UpdateRepo)
						repos.DELETE("/:repo_id", graphHandler.DeleteRepo)
						repos.POST("/:repo_id/scan", graphHandler.TriggerRepoScan)
					}

					// Nodes
					nodes := graphRoutes.Group("/nodes")
					{
						nodes.GET("", graphHandler.ListNodes)
						nodes.GET("/:node_id", graphHandler.GetNode)
						nodes.GET("/:node_id/dependencies", graphHandler.GetNodeDependencies)
						nodes.GET("/:node_id/dependents", graphHandler.GetNodeDependents)
					}

					// Edges
					graphRoutes.GET("/edges", graphHandler.ListEdges)

					// Queries
					graphRoutes.GET("/paths", graphHandler.FindPaths)
					graphRoutes.POST("/search", graphHandler.SearchNodes)

					// Coverage & Contracts
					graphRoutes.GET("/coverage", graphHandler.GetCoverage)
					graphRoutes.GET("/contracts", graphHandler.GetContracts)
					graphRoutes.GET("/conflicts", graphHandler.GetConflicts)
					graphRoutes.POST("/conflicts/:id/resolve", graphHandler.ResolveConflict)

					// Merge jobs
					graphRoutes.GET("/merge-jobs", graphHandler.ListMergeJobs)
					graphRoutes.POST("/merge", graphHandler.TriggerMerge)

					// Cloud graph endpoints (runtime, history, AI agents)
					runtimeScanner := cloud.NewRuntimeScanner(ge, logger)
					historyScanner := cloud.NewHistoryScanner(db, ge, logger)
					cloudHandler := cloud.NewCloudGraphHandler(ge, runtimeScanner, historyScanner, logger)
					agentHandler := ai.NewAgentHandler(ge, runtimeScanner, historyScanner, logger)

					cloudRoutes := graphRoutes.Group("/cloud")
					{
						cloudRoutes.POST("/executions", cloudHandler.IngestExecution)
						cloudRoutes.POST("/snapshots", cloudHandler.TakeSnapshot)
						cloudRoutes.GET("/history", cloudHandler.GetHistory)
						cloudRoutes.GET("/diff", cloudHandler.GetDiff)
						cloudRoutes.POST("/impact", cloudHandler.GetImpact)
						cloudRoutes.GET("/contracts/evolution", cloudHandler.GetContractEvolution)

						// AI agents
						cloudRoutes.GET("/agents", agentHandler.ListAgents)
						cloudRoutes.POST("/agents/orchestrate", agentHandler.RunOrchestrator)
						cloudRoutes.POST("/agents/:agent_name", agentHandler.RunAgent)
						cloudRoutes.POST("/confidence", agentHandler.ScoreConfidence)
					}
				}
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

		// Inline execution — runs a flow definition without saving it to the database
		v1.POST("/executions/run-definition", executionHandler.RunDefinition)

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

		// Plugin routes
		pluginsRoutes := v1.Group("/plugins")
		{
			pluginsRoutes.GET("", pluginHandler.List)
			pluginsRoutes.GET("/native", pluginHandler.ListNative)
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

		// Integration routes (AI providers, Git webhooks)
		integrations := v1.Group("/integrations")
		{
			integrations.GET("", integrationHandler.List)
			integrations.POST("", integrationHandler.Create)
			integrations.GET("/:id", integrationHandler.Get)
			integrations.PUT("/:id", integrationHandler.Update)
			integrations.DELETE("/:id", integrationHandler.Delete)
			integrations.POST("/:id/test", integrationHandler.TestConnection)
			integrations.GET("/:id/secrets", integrationHandler.GetSecrets)
			integrations.PUT("/:id/secrets", integrationHandler.UpdateSecrets)
			integrations.GET("/:id/repos", integrationHandler.ListRepositories)
		}

		// Request builder proxy
		v1.POST("/proxy/send", proxyHandler.Send)

		// Public webhook endpoints (no auth - signature verified)
		v1.POST("/webhooks/github", webhookHandler.HandleGitHub)
		v1.POST("/webhooks/gitea", webhookHandler.HandleGitea)
		v1.POST("/webhooks/gitlab", webhookHandler.HandleGitLab)

		// GitHub OAuth routes (unscoped: app-status is public, callback has no auth context from GitHub)
		github := v1.Group("/github")
		{
			github.GET("/app/status", githubOAuthHandler.AppStatus)
			github.GET("/oauth/callback", githubOAuthHandler.Callback)
		}

	}

	// WebSocket routes
	router.GET("/ws/executions/:id", wsHandler.HandleConnection)

	// 404 handler
	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
	})

	return router
}

func getEnvOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
