package gitops

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// EnvironmentService manages TestEnvironment lifecycle:
// - Reuse decisions (warm environment found → use it; none → caller provisions)
// - Wait-for-healthy delegation to the registered Provider
// - TTL-based teardown (called by cron every 5 minutes)
//
// It is provider-agnostic: register providers at startup via RegisterProvider.
type EnvironmentService struct {
	envRepo   *repository.TestEnvironmentRepository
	logger    *zap.Logger
	providers map[models.GitOpsProviderType]Provider // populated at startup
}

// NewEnvironmentService creates a new EnvironmentService.
func NewEnvironmentService(envRepo *repository.TestEnvironmentRepository, logger *zap.Logger) *EnvironmentService {
	return &EnvironmentService{
		envRepo:   envRepo,
		logger:    logger,
		providers: make(map[models.GitOpsProviderType]Provider),
	}
}

// RegisterProvider registers a GitOps provider by type.
// Call at startup for each configured integration (e.g. Argo CD).
func (s *EnvironmentService) RegisterProvider(providerType models.GitOpsProviderType, p Provider) {
	s.providers[providerType] = p
}

// AcquireOrCreate finds a warm environment for the given context key, or creates
// a new cold record if none exists. Returns (env, isWarm, error).
// If isWarm=false, the caller must provision via their GitOps tool then call MarkWarm.
// Callers should call MarkRunning after acquiring, then MarkCooling after tests finish.
func (s *EnvironmentService) AcquireOrCreate(ctx context.Context, workspaceID uuid.UUID, envContext string, defaults *models.TestEnvironment) (*models.TestEnvironment, bool, error) {
	existing, err := s.envRepo.FindWarm(ctx, workspaceID, envContext)
	if err == nil {
		if touchErr := s.envRepo.TouchLastUsed(ctx, existing.ID); touchErr != nil {
			s.logger.Warn("Failed to touch last_used_at on warm env",
				zap.String("env_id", existing.ID.String()),
				zap.Error(touchErr))
		}
		return existing, true, nil
	}

	// Create new cold record
	if defaults.TTLMinutes == 0 {
		defaults.TTLMinutes = 120
	}
	defaults.WorkspaceID = workspaceID
	defaults.Context = envContext
	defaults.State = models.TestEnvCold

	if createErr := s.envRepo.Create(ctx, defaults); createErr != nil {
		return nil, false, createErr
	}
	return defaults, false, nil
}

// MarkProvisioning transitions an environment to the provisioning state.
func (s *EnvironmentService) MarkProvisioning(ctx context.Context, id uuid.UUID) error {
	return s.envRepo.UpdateState(ctx, id, models.TestEnvProvisioning)
}

// WaitForHealthy blocks until the provider reports the app healthy, then marks env warm.
// If no provider is registered for env.Provider, marks warm immediately (manual/docker setups).
func (s *EnvironmentService) WaitForHealthy(ctx context.Context, env *models.TestEnvironment) error {
	provider, ok := s.providers[env.Provider]
	if ok {
		if err := provider.WaitForHealthy(ctx, env.ProviderAppName); err != nil {
			return err
		}
	} else {
		s.logger.Warn("No provider registered for environment — marking warm immediately",
			zap.String("env_id", env.ID.String()),
			zap.String("provider", string(env.Provider)))
	}
	return s.envRepo.UpdateState(ctx, env.ID, models.TestEnvWarm)
}

// MarkRunning transitions an environment to the running state.
func (s *EnvironmentService) MarkRunning(ctx context.Context, id uuid.UUID) error {
	return s.envRepo.UpdateState(ctx, id, models.TestEnvRunning)
}

// MarkCooling transitions an environment to the cooling state.
func (s *EnvironmentService) MarkCooling(ctx context.Context, id uuid.UUID) error {
	return s.envRepo.UpdateState(ctx, id, models.TestEnvCooling)
}

// CleanupExpired tears down all TTL-expired environments.
// Intended to be called on a schedule every 5 minutes.
func (s *EnvironmentService) CleanupExpired(ctx context.Context) {
	expired, err := s.envRepo.ListExpired(ctx)
	if err != nil {
		s.logger.Error("Failed to list expired environments", zap.Error(err))
		return
	}

	for _, env := range expired {
		provider, ok := s.providers[env.Provider]
		if ok {
			deleteCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			if err := provider.DeleteApp(deleteCtx, env.ProviderAppName); err != nil {
				s.logger.Error("Failed to delete GitOps app for expired environment",
					zap.String("env_id", env.ID.String()),
					zap.String("app_name", env.ProviderAppName),
					zap.Error(err))
			}
			cancel()
		}

		if err := s.envRepo.UpdateState(ctx, env.ID, models.TestEnvDestroyed); err != nil {
			s.logger.Error("Failed to mark environment as destroyed",
				zap.String("env_id", env.ID.String()),
				zap.Error(err))
		} else {
			s.logger.Info("Expired test environment destroyed",
				zap.String("env_id", env.ID.String()),
				zap.String("name", env.Name))
		}
	}
}
