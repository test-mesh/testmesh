package gitops

import "context"

// AppStatus represents the health and sync state of a GitOps-managed application.
type AppStatus struct {
	Health  string // "Healthy", "Degraded", "Progressing", "Unknown"
	Sync    string // "Synced", "OutOfSync"
	Message string // optional diagnostic message
}

// Provider is the abstraction for any GitOps tool (Argo CD, Flux, etc.).
// Implement this interface to add new providers without changing core logic.
type Provider interface {
	// GetAppStatus returns the current health/sync status of an application.
	GetAppStatus(ctx context.Context, appName string) (*AppStatus, error)
	// WaitForHealthy polls until the app is Healthy+Synced or ctx is cancelled.
	WaitForHealthy(ctx context.Context, appName string) error
	// DeleteApp removes the application and its namespace resources (cascade).
	DeleteApp(ctx context.Context, appName string) error
}
