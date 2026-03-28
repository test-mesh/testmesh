package scanner

import (
	"context"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
)

// Scanner produces nodes and edges from a specific source layer.
type Scanner interface {
	// Scan performs a full scan of the given input.
	Scan(ctx context.Context, input ScanInput) (*ScannerOutput, error)
	// ScanDiff performs an incremental scan based on changed files.
	ScanDiff(ctx context.Context, input DiffInput) (*ScannerOutput, error)
	// Capabilities describes what this scanner can detect.
	Capabilities() ScannerCapabilities
}

// ScanInput provides context for a full scan.
type ScanInput struct {
	RepoPath    string
	RepoID      uuid.UUID
	WorkspaceID uuid.UUID
	Config      ScannerConfig
}

// DiffInput provides context for an incremental scan.
type DiffInput struct {
	ScanInput
	ChangedFiles  []string
	PreviousGraph *ScannerOutput
}

// ScannerOutput is the result of a scan operation.
type ScannerOutput struct {
	Nodes    []graph.GraphNode
	Edges    []graph.GraphEdge
	Warnings []ScanWarning
}

// Merge combines another output into this one.
func (o *ScannerOutput) Merge(other *ScannerOutput) {
	if other == nil {
		return
	}
	o.Nodes = append(o.Nodes, other.Nodes...)
	o.Edges = append(o.Edges, other.Edges...)
	o.Warnings = append(o.Warnings, other.Warnings...)
}

// ScanWarning records a non-fatal issue during scanning.
type ScanWarning struct {
	File    string `json:"file"`
	Line    int    `json:"line,omitempty"`
	Message string `json:"message"`
	Level   string `json:"level"` // "info", "warn", "error"
}

// ScannerConfig holds per-scanner configuration options.
type ScannerConfig struct {
	// MaxFileSizeMB skips files larger than this.
	MaxFileSizeMB int
	// MaxFileCount limits total files scanned.
	MaxFileCount int
	// ExcludePatterns are glob patterns to skip.
	ExcludePatterns []string
	// IncludePatterns restricts scanning to matching files.
	IncludePatterns []string
	// Extra holds scanner-specific configuration.
	Extra map[string]any
}

// ScannerCapabilities describes what a scanner can detect.
type ScannerCapabilities struct {
	// Name is the scanner identifier (e.g., "infra", "spec", "flow", "go", "typescript").
	Name string
	// Layer is the source layer this scanner produces.
	Layer graph.SourceLayer
	// FilePatterns are glob patterns this scanner is interested in.
	FilePatterns []string
	// Description is a human-readable description.
	Description string
}

// DefaultExcludePatterns are common paths to skip during scanning.
var DefaultExcludePatterns = []string{
	"**/node_modules/**",
	"**/.git/**",
	"**/vendor/**",
	"**/.terraform/**",
	"**/dist/**",
	"**/build/**",
	"**/__pycache__/**",
	"**/.venv/**",
	"**/target/**",    // Java/Rust
	"**/bin/**",
	"**/obj/**",       // .NET
	"**/*.min.js",
	"**/*.min.css",
	"**/*.map",
	"**/*.lock",
	"**/package-lock.json",
	"**/yarn.lock",
	"**/go.sum",
}
