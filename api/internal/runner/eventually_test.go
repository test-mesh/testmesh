package runner

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// statusServer reports "pending" until it has been called `readyAfter` times.
func statusServer(t *testing.T, readyAfter int32) (*httptest.Server, *int32) {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		status := "pending"
		if atomic.AddInt32(&calls, 1) >= readyAfter {
			status = "confirmed"
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"` + status + `"}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func pollStep(url string, eventually *models.EventuallyConfig) models.Step {
	return models.Step{
		ID:         "order_confirmed",
		Action:     "http_request",
		Config:     map[string]interface{}{"method": "GET", "url": url},
		Assert:     []string{`body.status == "confirmed"`},
		Eventually: eventually,
	}
}

func TestEventually_RetriesUntilAssertionsPass(t *testing.T) {
	srv, calls := statusServer(t, 3)
	exec := NewExecutor(nil, zap.NewNop(), nil, nil)

	result, err := exec.ExecuteInline(&models.FlowDefinition{
		Name:  "eventually",
		Steps: []models.Step{pollStep(srv.URL, &models.EventuallyConfig{Timeout: "5s", Interval: "10ms"})},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "passed" {
		t.Fatalf("expected passed, got %s: %s", result.Status, result.Error)
	}
	if got := atomic.LoadInt32(calls); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
}

func TestEventually_ReportsLastFailureOnTimeout(t *testing.T) {
	srv, _ := statusServer(t, 1_000_000)
	exec := NewExecutor(nil, zap.NewNop(), nil, nil)

	start := time.Now()
	result, err := exec.ExecuteInline(&models.FlowDefinition{
		Name:  "eventually",
		Steps: []models.Step{pollStep(srv.URL, &models.EventuallyConfig{Timeout: "150ms", Interval: "20ms"})},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "failed" {
		t.Fatalf("expected failed, got %s", result.Status)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("eventually did not respect its timeout: %s", elapsed)
	}
	for _, want := range []string{"still failing after 150ms", `body.status == "confirmed"`} {
		if !strings.Contains(result.Error, want) {
			t.Errorf("error %q does not mention %q", result.Error, want)
		}
	}
}

func TestWithoutEventually_FailsOnFirstAttempt(t *testing.T) {
	srv, calls := statusServer(t, 2)
	exec := NewExecutor(nil, zap.NewNop(), nil, nil)

	result, _ := exec.ExecuteInline(&models.FlowDefinition{
		Name:  "no-eventually",
		Steps: []models.Step{pollStep(srv.URL, nil)},
	}, nil)
	if result.Status != "failed" || atomic.LoadInt32(calls) != 1 {
		t.Fatalf("expected a single failing attempt, got status=%s calls=%d", result.Status, *calls)
	}
}

func TestApplyConnectionDefaults(t *testing.T) {
	ctx := NewContext(nil, map[string]interface{}{
		"DATABASE_URL":  "postgres://localhost/app",
		"KAFKA_BROKERS": "localhost:9092",
	})

	db := map[string]interface{}{"query": "SELECT 1"}
	applyConnectionDefaults("database_query", db, ctx)
	if db["connection"] != "postgres://localhost/app" {
		t.Errorf("database_query connection = %v", db["connection"])
	}

	explicit := map[string]interface{}{"connection": "postgres://other/db"}
	applyConnectionDefaults("db_poll", explicit, ctx)
	if explicit["connection"] != "postgres://other/db" {
		t.Errorf("explicit connection was overridden: %v", explicit["connection"])
	}

	consumer := map[string]interface{}{"topic": "orders"}
	applyConnectionDefaults("kafka_consumer", consumer, ctx)
	if consumer["brokers"] != "localhost:9092" {
		t.Errorf("kafka_consumer brokers = %v", consumer["brokers"])
	}
	since, err := time.Parse(time.RFC3339Nano, consumer["since"].(string))
	if err != nil || !since.Equal(ctx.StartedAt()) {
		t.Errorf("kafka_consumer since = %v (%v), want flow start %v", consumer["since"], err, ctx.StartedAt())
	}

	group := map[string]interface{}{"topic": "orders", "group_id": "svc"}
	applyConnectionDefaults("kafka_consumer", group, ctx)
	if _, ok := group["since"]; ok {
		t.Errorf("since must not be injected in consumer-group mode")
	}

	producer := map[string]interface{}{"topic": "orders"}
	applyConnectionDefaults("kafka_producer", producer, ctx)
	if producer["brokers"] != "localhost:9092" {
		t.Errorf("kafka_producer brokers = %v", producer["brokers"])
	}
	if _, ok := producer["since"]; ok {
		t.Errorf("since must only be injected for consumers")
	}
}
