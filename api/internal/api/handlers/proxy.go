package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// ProxyHandler handles proxied HTTP requests from the request builder
type ProxyHandler struct {
	logger *zap.Logger
	client *http.Client
}

// NewProxyHandler creates a new proxy handler
func NewProxyHandler(logger *zap.Logger) *ProxyHandler {
	return &ProxyHandler{
		logger: logger,
		client: &http.Client{
			Timeout: 60 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

type ProxySendRequest struct {
	Method          string            `json:"method"`
	URL             string            `json:"url"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	FollowRedirects *bool             `json:"follow_redirects"`
	TimeoutSeconds  int               `json:"timeout_seconds"`
}

type ProxySendResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"status_text"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	SizeBytes  int               `json:"size_bytes"`
	TimeMs     int64             `json:"time_ms"`
}

// Send proxies an HTTP request on behalf of the client
func (h *ProxyHandler) Send(c *gin.Context) {
	var req ProxySendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	if req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	if req.Method == "" {
		req.Method = "GET"
	}

	// Build the outgoing request
	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	outReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	// Copy headers
	for key, value := range req.Headers {
		outReq.Header.Set(key, value)
	}

	// Configure client for this request
	client := h.client
	if req.FollowRedirects != nil && !*req.FollowRedirects {
		client = &http.Client{
			Timeout: h.client.Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	if req.TimeoutSeconds > 0 {
		client = &http.Client{
			Timeout:       time.Duration(req.TimeoutSeconds) * time.Second,
			CheckRedirect: client.CheckRedirect,
		}
	}

	// Execute the request
	start := time.Now()
	resp, err := client.Do(outReq)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"error":   err.Error(),
			"time_ms": elapsed,
		})
		return
	}
	defer resp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // 10MB limit
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read response: " + err.Error()})
		return
	}

	// Collect response headers
	respHeaders := make(map[string]string)
	for key := range resp.Header {
		respHeaders[key] = resp.Header.Get(key)
	}

	// Pretty-print JSON if applicable
	bodyStr := string(bodyBytes)
	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "application/json") {
		var prettyBuf bytes.Buffer
		if json.Indent(&prettyBuf, bodyBytes, "", "  ") == nil {
			bodyStr = prettyBuf.String()
		}
	}

	c.JSON(http.StatusOK, ProxySendResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    respHeaders,
		Body:       bodyStr,
		SizeBytes:  len(bodyBytes),
		TimeMs:     elapsed,
	})
}
