package mocks

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
	"time"
)

// ProxyConfig holds proxy configuration
type ProxyConfig struct {
	Port           int
	TargetURL      string
	RecordRequests bool
	MockResponses  bool
	TLSEnabled     bool
	CertFile       string
	KeyFile        string
}

// RecordedRequest represents a recorded request/response
type RecordedRequest struct {
	ID          string            `json:"id"`
	Timestamp   time.Time         `json:"timestamp"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body,omitempty"`
	Response    *RecordedResponse `json:"response,omitempty"`
	Duration    int64             `json:"duration_ms"`
}

// RecordedResponse represents a recorded response
type RecordedResponse struct {
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body,omitempty"`
}

// MockProxy is a recording/mocking HTTP proxy
type MockProxy struct {
	config       *ProxyConfig
	server       *http.Server
	target       *url.URL
	recordings   []RecordedRequest
	mocks        map[string]*MockResponse
	mu           sync.RWMutex
	requestCount int
	listener     net.Listener
}

// MockResponse represents a mock response
type MockResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    interface{}       `json:"body,omitempty"`
	Delay   string            `json:"delay,omitempty"`
}

// NewMockProxy creates a new mock proxy
func NewMockProxy(config *ProxyConfig) (*MockProxy, error) {
	target, err := url.Parse(config.TargetURL)
	if err != nil {
		return nil, fmt.Errorf("invalid target URL: %w", err)
	}

	return &MockProxy{
		config:     config,
		target:     target,
		recordings: make([]RecordedRequest, 0),
		mocks:      make(map[string]*MockResponse),
	}, nil
}

// Start starts the proxy server
func (p *MockProxy) Start() error {
	proxy := httputil.NewSingleHostReverseProxy(p.target)

	// Customize transport
	proxy.Transport = &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	// Wrap with recording/mocking
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.handleRequest(w, r, proxy)
	})

	p.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", p.config.Port),
		Handler: handler,
	}

	var err error
	p.listener, err = net.Listen("tcp", p.server.Addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	go func() {
		if p.config.TLSEnabled {
			p.server.ServeTLS(p.listener, p.config.CertFile, p.config.KeyFile)
		} else {
			p.server.Serve(p.listener)
		}
	}()

	return nil
}

// Stop stops the proxy server
func (p *MockProxy) Stop(ctx context.Context) error {
	if p.server == nil {
		return nil
	}
	return p.server.Shutdown(ctx)
}

func (p *MockProxy) handleRequest(w http.ResponseWriter, r *http.Request, proxy *httputil.ReverseProxy) {
	start := time.Now()
	p.mu.Lock()
	p.requestCount++
	requestID := fmt.Sprintf("req_%d", p.requestCount)
	p.mu.Unlock()

	// Check for mock
	mockKey := p.getMockKey(r)
	p.mu.RLock()
	mock, hasMock := p.mocks[mockKey]
	p.mu.RUnlock()

	if hasMock && p.config.MockResponses {
		p.serveMock(w, r, mock, requestID, start)
		return
	}

	// Record request
	recorded := RecordedRequest{
		ID:        requestID,
		Timestamp: time.Now(),
		Method:    r.Method,
		URL:       r.URL.String(),
		Headers:   p.extractHeaders(r.Header),
	}

	// Read body
	if r.Body != nil {
		body, _ := io.ReadAll(r.Body)
		recorded.Body = string(body)
		r.Body = io.NopCloser(bytes.NewBuffer(body))
	}

	// Use response recorder
	recorder := &responseRecorder{
		ResponseWriter: w,
		status:         200,
		body:           &bytes.Buffer{},
	}

	// Proxy the request
	proxy.ServeHTTP(recorder, r)

	// Record response
	recorded.Response = &RecordedResponse{
		Status:  recorder.status,
		Headers: p.extractHeaders(recorder.Header()),
		Body:    recorder.body.String(),
	}
	recorded.Duration = time.Since(start).Milliseconds()

	if p.config.RecordRequests {
		p.mu.Lock()
		p.recordings = append(p.recordings, recorded)
		p.mu.Unlock()
	}
}

func (p *MockProxy) serveMock(w http.ResponseWriter, r *http.Request, mock *MockResponse, requestID string, start time.Time) {
	// Apply delay
	if mock.Delay != "" {
		if delay, err := time.ParseDuration(mock.Delay); err == nil {
			time.Sleep(delay)
		}
	}

	// Set headers
	for k, v := range mock.Headers {
		w.Header().Set(k, v)
	}

	// Write status
	status := mock.Status
	if status == 0 {
		status = 200
	}
	w.WriteHeader(status)

	// Write body
	if mock.Body != nil {
		var bodyBytes []byte
		switch body := mock.Body.(type) {
		case string:
			bodyBytes = []byte(body)
		case []byte:
			bodyBytes = body
		default:
			bodyBytes, _ = json.Marshal(body)
			if w.Header().Get("Content-Type") == "" {
				w.Header().Set("Content-Type", "application/json")
			}
		}
		w.Write(bodyBytes)
	}

	// Record mocked request
	if p.config.RecordRequests {
		recorded := RecordedRequest{
			ID:        requestID,
			Timestamp: time.Now(),
			Method:    r.Method,
			URL:       r.URL.String(),
			Headers:   p.extractHeaders(r.Header),
			Response: &RecordedResponse{
				Status: status,
			},
			Duration: time.Since(start).Milliseconds(),
		}
		p.mu.Lock()
		p.recordings = append(p.recordings, recorded)
		p.mu.Unlock()
	}
}

func (p *MockProxy) getMockKey(r *http.Request) string {
	return fmt.Sprintf("%s:%s", r.Method, r.URL.Path)
}

func (p *MockProxy) extractHeaders(h http.Header) map[string]string {
	headers := make(map[string]string)
	for k, v := range h {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	return headers
}

// SetMock sets a mock response for a path
func (p *MockProxy) SetMock(method, path string, mock *MockResponse) {
	key := fmt.Sprintf("%s:%s", method, path)
	p.mu.Lock()
	p.mocks[key] = mock
	p.mu.Unlock()
}

// RemoveMock removes a mock
func (p *MockProxy) RemoveMock(method, path string) {
	key := fmt.Sprintf("%s:%s", method, path)
	p.mu.Lock()
	delete(p.mocks, key)
	p.mu.Unlock()
}

// ClearMocks clears all mocks
func (p *MockProxy) ClearMocks() {
	p.mu.Lock()
	p.mocks = make(map[string]*MockResponse)
	p.mu.Unlock()
}

// GetRecordings returns all recordings
func (p *MockProxy) GetRecordings() []RecordedRequest {
	p.mu.RLock()
	defer p.mu.RUnlock()
	recordings := make([]RecordedRequest, len(p.recordings))
	copy(recordings, p.recordings)
	return recordings
}

// ClearRecordings clears all recordings
func (p *MockProxy) ClearRecordings() {
	p.mu.Lock()
	p.recordings = make([]RecordedRequest, 0)
	p.mu.Unlock()
}

// ExportRecordings exports recordings as HAR
func (p *MockProxy) ExportRecordings() ([]byte, error) {
	p.mu.RLock()
	recordings := p.recordings
	p.mu.RUnlock()

	// Convert to HAR format (simplified)
	har := map[string]interface{}{
		"log": map[string]interface{}{
			"version": "1.2",
			"creator": map[string]string{
				"name":    "TestMesh Proxy",
				"version": "1.0.0",
			},
			"entries": p.recordingsToHAREntries(recordings),
		},
	}

	return json.MarshalIndent(har, "", "  ")
}

func (p *MockProxy) recordingsToHAREntries(recordings []RecordedRequest) []map[string]interface{} {
	entries := make([]map[string]interface{}, len(recordings))

	for i, rec := range recordings {
		entry := map[string]interface{}{
			"startedDateTime": rec.Timestamp.Format(time.RFC3339),
			"time":            rec.Duration,
			"request": map[string]interface{}{
				"method":  rec.Method,
				"url":     rec.URL,
				"headers": p.headersToHAR(rec.Headers),
			},
		}

		if rec.Body != "" {
			entry["request"].(map[string]interface{})["postData"] = map[string]string{
				"text": rec.Body,
			}
		}

		if rec.Response != nil {
			entry["response"] = map[string]interface{}{
				"status":  rec.Response.Status,
				"headers": p.headersToHAR(rec.Response.Headers),
				"content": map[string]interface{}{
					"text": rec.Response.Body,
				},
			}
		}

		entries[i] = entry
	}

	return entries
}

func (p *MockProxy) headersToHAR(headers map[string]string) []map[string]string {
	harHeaders := make([]map[string]string, 0, len(headers))
	for k, v := range headers {
		harHeaders = append(harHeaders, map[string]string{
			"name":  k,
			"value": v,
		})
	}
	return harHeaders
}

// responseRecorder wraps ResponseWriter to capture response
type responseRecorder struct {
	http.ResponseWriter
	status int
	body   *bytes.Buffer
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}
