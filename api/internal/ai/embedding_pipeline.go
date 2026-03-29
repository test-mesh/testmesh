package ai

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// EmbeddingPipeline processes items into vector embeddings asynchronously
type EmbeddingPipeline struct {
	embedder EmbeddingProvider
	store    VectorStore
	logger   *zap.Logger
	queue    chan embeddingJob
	wg       sync.WaitGroup
	cancel   context.CancelFunc
}

type embeddingJob struct {
	items       []VectorItem
	workspaceID uuid.UUID
}

const (
	pipelineWorkers  = 10
	pipelineQueueCap = 1000
)

// NewEmbeddingPipeline creates a new embedding pipeline
func NewEmbeddingPipeline(embedder EmbeddingProvider, store VectorStore, logger *zap.Logger) *EmbeddingPipeline {
	return &EmbeddingPipeline{
		embedder: embedder,
		store:    store,
		logger:   logger,
		queue:    make(chan embeddingJob, pipelineQueueCap),
	}
}

// Start begins processing the embedding queue
func (p *EmbeddingPipeline) Start(ctx context.Context) {
	ctx, p.cancel = context.WithCancel(ctx)
	for i := 0; i < pipelineWorkers; i++ {
		p.wg.Add(1)
		go p.worker(ctx)
	}
	p.logger.Info("Embedding pipeline started", zap.Int("workers", pipelineWorkers))
}

// Stop gracefully shuts down the pipeline
func (p *EmbeddingPipeline) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	close(p.queue)
	p.wg.Wait()
	p.logger.Info("Embedding pipeline stopped")
}

func (p *EmbeddingPipeline) worker(ctx context.Context) {
	defer p.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-p.queue:
			if !ok {
				return
			}
			p.processJob(ctx, job)
		}
	}
}

func (p *EmbeddingPipeline) processJob(ctx context.Context, job embeddingJob) {
	// Extract texts from items
	texts := make([]string, len(job.items))
	for i, item := range job.items {
		texts[i] = item.Content
	}

	// Generate embeddings
	embeddings, err := p.embedder.Embed(ctx, texts)
	if err != nil {
		p.logger.Error("Failed to generate embeddings", zap.Error(err))
		return
	}

	// Attach embeddings to items
	for i := range job.items {
		if i < len(embeddings) {
			job.items[i].Embedding = embeddings[i]
		}
	}

	// Upsert into vector store
	if err := p.store.Upsert(ctx, job.items); err != nil {
		p.logger.Error("Failed to upsert embeddings", zap.Error(err))
	}
}

func (p *EmbeddingPipeline) enqueue(job embeddingJob) {
	select {
	case p.queue <- job:
	default:
		p.logger.Warn("Embedding pipeline queue full, dropping job",
			zap.Int("items", len(job.items)))
	}
}

// IndexNodes converts graph nodes to vector items and queues for embedding
func (p *EmbeddingPipeline) IndexNodes(workspaceID uuid.UUID, nodes []graph.GraphNode) {
	items := make([]VectorItem, 0, len(nodes))
	for _, node := range nodes {
		content := fmt.Sprintf("%s: %s", node.Type, node.Name)
		if node.Service != "" {
			content += fmt.Sprintf(" (service: %s)", node.Service)
		}
		items = append(items, VectorItem{
			ID:          node.ID.String(),
			WorkspaceID: workspaceID,
			ItemType:    "node",
			Content:     content,
			Metadata: map[string]string{
				"type":    string(node.Type),
				"service": node.Service,
			},
		})
	}
	if len(items) > 0 {
		p.enqueue(embeddingJob{items: items, workspaceID: workspaceID})
	}
}

// IndexFlows converts flows to vector items and queues for embedding
func (p *EmbeddingPipeline) IndexFlows(workspaceID uuid.UUID, flows []models.Flow) {
	items := make([]VectorItem, 0, len(flows))
	for _, flow := range flows {
		content := fmt.Sprintf("%s: %s", flow.Name, flow.Description)
		if len(flow.Tags) > 0 {
			content += fmt.Sprintf(". Tags: %s", strings.Join(flow.Tags, ", "))
		}
		items = append(items, VectorItem{
			ID:          flow.ID.String(),
			WorkspaceID: workspaceID,
			ItemType:    "flow",
			Content:     content,
			Metadata: map[string]string{
				"name":  flow.Name,
				"suite": flow.Suite,
			},
		})
	}
	if len(items) > 0 {
		p.enqueue(embeddingJob{items: items, workspaceID: workspaceID})
	}
}

// IndexCodeChanges indexes code change diffs for semantic search
func (p *EmbeddingPipeline) IndexCodeChanges(workspaceID uuid.UUID, commitSHA string, changedFiles []string, diff string) {
	content := fmt.Sprintf("Commit %s changed: %s\n%s", commitSHA, strings.Join(changedFiles, ", "), diff)
	// Truncate diff content to avoid excessively long embeddings
	if len(content) > 8000 {
		content = content[:8000]
	}
	items := []VectorItem{
		{
			ID:          fmt.Sprintf("commit:%s", commitSHA),
			WorkspaceID: workspaceID,
			ItemType:    "code_change",
			Content:     content,
			Metadata: map[string]string{
				"commit_sha": commitSHA,
			},
		},
	}
	p.enqueue(embeddingJob{items: items, workspaceID: workspaceID})
}
