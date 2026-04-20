package telemetry

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/protobuf/proto"
)

// APIKeyResolver resolves a Bearer token to a workspace ID.
type APIKeyResolver interface {
	ResolveKey(ctx context.Context, token string) (uuid.UUID, error)
}

// OTLPReceiver handles incoming OTLP trace data.
type OTLPReceiver struct {
	processor *SpanProcessor
	keyRepo   APIKeyResolver
	logger    *zap.Logger
}

// NewOTLPReceiver creates a new OTLPReceiver.
func NewOTLPReceiver(processor *SpanProcessor, keyRepo APIKeyResolver, logger *zap.Logger) *OTLPReceiver {
	return &OTLPReceiver{processor: processor, keyRepo: keyRepo, logger: logger}
}

// HandleTraces is the Gin handler for POST /otlp/v1/traces.
func (r *OTLPReceiver) HandleTraces(c *gin.Context) {
	workspaceID, err := r.resolveWorkspace(c)
	if err != nil {
		r.otlpError(c, http.StatusBadRequest, err.Error())
		return
	}

	body, err := r.readBody(c)
	if err != nil {
		r.otlpError(c, http.StatusBadRequest, err.Error())
		return
	}

	var req coltracepb.ExportTraceServiceRequest
	if err := proto.Unmarshal(body, &req); err != nil {
		r.logger.Error("failed to unmarshal OTLP request", zap.Error(err))
		r.otlpError(c, http.StatusBadRequest, "invalid OTLP protobuf payload")
		return
	}

	if err := r.processor.ProcessOTLP(c.Request.Context(), workspaceID, &req); err != nil {
		r.logger.Error("failed to process OTLP spans",
			zap.String("workspace_id", workspaceID.String()),
			zap.Error(err))
		r.otlpError(c, http.StatusInternalServerError, "failed to process spans")
		return
	}

	resp := &coltracepb.ExportTraceServiceResponse{}
	out, _ := proto.Marshal(resp)
	c.Data(http.StatusOK, "application/x-protobuf", out)
}

func (r *OTLPReceiver) resolveWorkspace(c *gin.Context) (uuid.UUID, error) {
	// Option 1: workspace UUID header (local dev / trusted network)
	if wsIDStr := c.GetHeader("X-Workspace-ID"); wsIDStr != "" {
		id, err := uuid.Parse(wsIDStr)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid X-Workspace-ID")
		}
		return id, nil
	}

	// Option 2: Bearer API key
	if authHeader := c.GetHeader("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if r.keyRepo == nil {
			return uuid.Nil, fmt.Errorf("API key auth not configured")
		}
		id, err := r.keyRepo.ResolveKey(c.Request.Context(), token)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid API key")
		}
		return id, nil
	}

	return uuid.Nil, fmt.Errorf("X-Workspace-ID header or Authorization: Bearer token required")
}

func (r *OTLPReceiver) readBody(c *gin.Context) ([]byte, error) {
	reader := c.Request.Body
	if strings.EqualFold(c.GetHeader("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			return nil, fmt.Errorf("failed to decompress gzip body")
		}
		defer gz.Close()
		reader = gz
	}
	return io.ReadAll(reader)
}

func (r *OTLPReceiver) otlpError(c *gin.Context, status int, msg string) {
	resp := &coltracepb.ExportTraceServiceResponse{}
	out, _ := proto.Marshal(resp)
	r.logger.Warn("OTLP request rejected", zap.Int("status", status), zap.String("reason", msg))
	c.Data(status, "application/x-protobuf", out)
}
