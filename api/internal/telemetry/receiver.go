package telemetry

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/protobuf/proto"
)

// OTLPReceiver handles incoming OTLP trace data.
type OTLPReceiver struct {
	processor *SpanProcessor
	logger    *zap.Logger
}

// NewOTLPReceiver creates a new OTLPReceiver.
func NewOTLPReceiver(processor *SpanProcessor, logger *zap.Logger) *OTLPReceiver {
	return &OTLPReceiver{
		processor: processor,
		logger:    logger,
	}
}

// HandleTraces is the Gin handler for POST /otlp/v1/traces.
func (r *OTLPReceiver) HandleTraces(c *gin.Context) {
	// Extract workspace ID from header
	wsIDStr := c.GetHeader("X-Workspace-ID")
	if wsIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Workspace-ID header is required"})
		return
	}
	workspaceID, err := uuid.Parse(wsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid X-Workspace-ID"})
		return
	}

	// Read body — decompress if gzip-encoded
	reader := c.Request.Body
	if strings.EqualFold(c.GetHeader("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			r.logger.Error("failed to create gzip reader", zap.Error(err))
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to decompress gzip body"})
			return
		}
		defer gz.Close()
		reader = gz
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		r.logger.Error("failed to read OTLP request body", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	// Parse OTLP protobuf
	var req coltracepb.ExportTraceServiceRequest
	if err := proto.Unmarshal(body, &req); err != nil {
		r.logger.Error("failed to unmarshal OTLP request", zap.Error(err))
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid OTLP protobuf payload"})
		return
	}

	// Process spans
	if err := r.processor.ProcessOTLP(c.Request.Context(), workspaceID, &req); err != nil {
		r.logger.Error("failed to process OTLP spans",
			zap.String("workspace_id", workspaceID.String()),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process spans"})
		return
	}

	// OTLP convention: return empty response on success
	c.Status(http.StatusOK)
}
