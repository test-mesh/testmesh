package runner

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// FlowExecutorFunc is called to execute a single flow within a suite run.
// It returns the created execution ID, whether the flow passed, and any error.
type FlowExecutorFunc func(
	ctx context.Context,
	flowID uuid.UUID,
	environment string,
	variables map[string]interface{},
	triggerType models.TriggerType,
	triggerRef string,
	suiteRunID uuid.UUID,
) (executionID uuid.UUID, success bool, err error)

// RunSuiteRequest holds the parameters needed to start a suite run.
type RunSuiteRequest struct {
	SuiteID     uuid.UUID
	Environment string
	Variables   map[string]interface{}
	TriggerType models.TriggerType
	TriggerRef  string
}

// SuiteRunner executes a Suite's flows in ordered, optionally-parallel groups.
type SuiteRunner struct {
	suiteRepo *repository.SuiteRepository
	execRepo  *repository.ExecutionRepository
	executor  FlowExecutorFunc
	logger    *zap.Logger
}

// NewSuiteRunner creates a new SuiteRunner.
func NewSuiteRunner(
	suiteRepo *repository.SuiteRepository,
	execRepo *repository.ExecutionRepository,
	executor FlowExecutorFunc,
	logger *zap.Logger,
) *SuiteRunner {
	return &SuiteRunner{
		suiteRepo: suiteRepo,
		execRepo:  execRepo,
		executor:  executor,
		logger:    logger,
	}
}

// Run creates a SuiteRun record, starts execution in the background, and returns immediately.
func (sr *SuiteRunner) Run(ctx context.Context, req RunSuiteRequest) (*models.SuiteRun, error) {
	// Load suite with its flows.
	suite, err := sr.suiteRepo.Get(ctx, req.SuiteID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	run := &models.SuiteRun{
		SuiteID:     suite.ID,
		Status:      models.SuiteRunPending,
		TriggerType: req.TriggerType,
		TriggerRef:  req.TriggerRef,
		Environment: req.Environment,
		StartedAt:   &now,
		TotalFlows:  len(suite.SuiteFlows),
	}

	if err := sr.suiteRepo.CreateRun(ctx, run); err != nil {
		return nil, err
	}

	// Execute in the background; the caller gets the run record immediately.
	go sr.execute(context.Background(), run, suite.SuiteFlows, req)

	return run, nil
}

// flowResult carries the outcome of executing a single flow.
type flowResult struct {
	suiteFlow   models.SuiteFlow
	executionID uuid.UUID
	success     bool
	err         error
}

// execute runs all flow groups in order, concurrently within each group.
func (sr *SuiteRunner) execute(ctx context.Context, run *models.SuiteRun, suiteFlows []models.SuiteFlow, req RunSuiteRequest) {
	// Mark the run as running.
	run.Status = models.SuiteRunRunning
	if err := sr.suiteRepo.UpdateRun(ctx, run); err != nil {
		sr.logger.Error("suite_runner: failed to mark run as running",
			zap.String("suite_run_id", run.ID.String()),
			zap.Error(err),
		)
	}

	groups := groupByOrder(suiteFlows)
	passed := 0
	failed := 0
	overallSuccess := true

	for _, group := range groups {
		results := sr.executeGroup(ctx, group, run.ID, req)
		for _, res := range results {
			// Persist SuiteRunExecution join record.
			sre := &models.SuiteRunExecution{
				SuiteRunID:  run.ID,
				ExecutionID: res.executionID,
				FlowID:      res.suiteFlow.FlowID,
				Order:       res.suiteFlow.Order,
			}
			if createErr := sr.suiteRepo.CreateRunExecution(ctx, sre); createErr != nil {
				sr.logger.Error("suite_runner: failed to create suite run execution",
					zap.String("suite_run_id", run.ID.String()),
					zap.String("flow_id", res.suiteFlow.FlowID.String()),
					zap.Error(createErr),
				)
			}

			if res.success {
				passed++
			} else {
				failed++
				overallSuccess = false
			}
		}
	}

	// Finalise the run record.
	completedAt := time.Now()
	run.CompletedAt = &completedAt
	run.DurationMs = completedAt.Sub(*run.StartedAt).Milliseconds()
	run.PassedFlows = passed
	run.FailedFlows = failed

	if overallSuccess {
		run.Status = models.SuiteRunCompleted
	} else {
		run.Status = models.SuiteRunFailed
	}

	if err := sr.suiteRepo.UpdateRun(ctx, run); err != nil {
		sr.logger.Error("suite_runner: failed to finalise suite run",
			zap.String("suite_run_id", run.ID.String()),
			zap.Error(err),
		)
	}
}

// executeGroup runs all flows in a single order-group concurrently.
func (sr *SuiteRunner) executeGroup(
	ctx context.Context,
	group []models.SuiteFlow,
	suiteRunID uuid.UUID,
	req RunSuiteRequest,
) []flowResult {
	results := make([]flowResult, len(group))
	var wg sync.WaitGroup

	for i, sf := range group {
		wg.Add(1)
		go func(idx int, suiteFlow models.SuiteFlow) {
			defer wg.Done()

			execID, success, err := sr.executor(
				ctx,
				suiteFlow.FlowID,
				req.Environment,
				req.Variables,
				req.TriggerType,
				req.TriggerRef,
				suiteRunID,
			)

			if err != nil {
				sr.logger.Error("suite_runner: flow execution error",
					zap.String("flow_id", suiteFlow.FlowID.String()),
					zap.String("suite_run_id", suiteRunID.String()),
					zap.Error(err),
				)
			}

			results[idx] = flowResult{
				suiteFlow:   suiteFlow,
				executionID: execID,
				success:     success,
				err:         err,
			}
		}(i, sf)
	}

	wg.Wait()
	return results
}

// groupByOrder groups SuiteFlows by their Order value and returns slices sorted
// ascending by order value.
func groupByOrder(flows []models.SuiteFlow) [][]models.SuiteFlow {
	if len(flows) == 0 {
		return nil
	}

	// Collect unique order values.
	orderMap := make(map[int][]models.SuiteFlow)
	for _, sf := range flows {
		orderMap[sf.Order] = append(orderMap[sf.Order], sf)
	}

	// Sort order keys.
	keys := make([]int, 0, len(orderMap))
	for k := range orderMap {
		keys = append(keys, k)
	}
	sort.Ints(keys)

	groups := make([][]models.SuiteFlow, 0, len(keys))
	for _, k := range keys {
		groups = append(groups, orderMap[k])
	}
	return groups
}
