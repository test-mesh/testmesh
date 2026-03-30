// metrics/metrics.go
package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	requestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	}, []string{"service", "method", "route", "status"})

	requestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"service", "method", "route"})

	requestsInFlight = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "http_requests_in_flight",
		Help: "Current number of in-flight HTTP requests.",
	}, []string{"service"})
)

// Middleware returns a Gin middleware that records Prometheus metrics.
func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}

		requestsInFlight.WithLabelValues(serviceName).Inc()
		start := time.Now()

		c.Next()

		requestsInFlight.WithLabelValues(serviceName).Dec()
		status := strconv.Itoa(c.Writer.Status())
		requestsTotal.WithLabelValues(serviceName, c.Request.Method, route, status).Inc()
		requestDuration.WithLabelValues(serviceName, c.Request.Method, route).Observe(time.Since(start).Seconds())
	}
}

// Handler returns a Gin handler that exposes Prometheus metrics.
func Handler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
