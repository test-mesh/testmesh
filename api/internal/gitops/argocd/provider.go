package argocd

import (
	"context"
	"fmt"
	"time"

	"github.com/test-mesh/testmesh/internal/gitops"
)

const pollInterval = 5 * time.Second

type Provider struct {
	client *Client
}

func NewProvider(baseURL, token string) *Provider {
	return &Provider{client: NewClient(baseURL, token)}
}

// Ensure Provider implements the gitops.Provider interface at compile time.
var _ gitops.Provider = (*Provider)(nil)

func (p *Provider) GetAppStatus(ctx context.Context, appName string) (*gitops.AppStatus, error) {
	resp, err := p.client.GetApp(ctx, appName)
	if err != nil {
		return nil, err
	}
	return &gitops.AppStatus{
		Health:  resp.Status.Health.Status,
		Sync:    resp.Status.Sync.Status,
		Message: resp.Status.Health.Message,
	}, nil
}

func (p *Provider) WaitForHealthy(ctx context.Context, appName string) error {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for %q to become healthy: %w", appName, ctx.Err())
		case <-ticker.C:
			status, err := p.GetAppStatus(ctx, appName)
			if err != nil {
				// Transient error — keep polling.
				continue
			}
			if status.Health == "Healthy" && status.Sync == "Synced" {
				return nil
			}
			if status.Health == "Degraded" {
				return fmt.Errorf("app %q is Degraded: %s", appName, status.Message)
			}
		}
	}
}

func (p *Provider) DeleteApp(ctx context.Context, appName string) error {
	return p.client.DeleteApp(ctx, appName)
}
