package actions

import (
	"strings"
	"testing"
	"time"

	"github.com/test-mesh/testmesh/internal/runner/actions/async"
)

func TestParseKafkaConsumerConfig_MatchAndFilter(t *testing.T) {
	cfg, err := parseKafkaConsumerConfig(map[string]interface{}{
		"brokers": "localhost:9092",
		"topic":   "order.placed",
		"match":   map[string]interface{}{"order_id": "abc", "items.0.quantity": 2},
		"filter": map[string]interface{}{
			"key":     "abc",
			"headers": map[string]interface{}{"event-type": "OrderPlaced"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	f := cfg.Filter
	if f == nil || f.Key != "abc" || f.Headers["event-type"] != "OrderPlaced" || f.Match["order_id"] != "abc" {
		t.Fatalf("unexpected filter: %+v", f)
	}
	if cfg.GroupID != "" {
		t.Errorf("group_id should default to empty (direct mode), got %q", cfg.GroupID)
	}
	if cfg.StartFrom != async.StartFromLatest {
		t.Errorf("start without since = %q, want latest", cfg.StartFrom)
	}
}

func TestParseKafkaConsumerConfig_Since(t *testing.T) {
	cfg, err := parseKafkaConsumerConfig(map[string]interface{}{"since": "2026-10-21T10:00:00.5Z"})
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 10, 21, 10, 0, 0, 500_000_000, time.UTC)
	if cfg.StartFrom != async.StartFromTimestamp || !cfg.Since.Equal(want) {
		t.Errorf("got %s %v", cfg.StartFrom, cfg.Since)
	}

	// An explicit from_beginning wins over the injected since.
	cfg, _ = parseKafkaConsumerConfig(map[string]interface{}{"since": "2026-10-21T10:00:00Z", "from_beginning": true})
	if cfg.StartFrom != async.StartFromEarliest {
		t.Errorf("from_beginning: got %s", cfg.StartFrom)
	}

	if _, err := parseKafkaConsumerConfig(map[string]interface{}{"since": "yesterday"}); err == nil {
		t.Error("expected error for invalid since")
	}
}

func TestParseSince(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	cases := map[string]struct {
		start string
		since time.Time
	}{
		"earliest":             {async.StartFromEarliest, time.Time{}},
		"beginning":            {async.StartFromEarliest, time.Time{}},
		"latest":               {async.StartFromLatest, time.Time{}},
		"NOW":                  {async.StartFromLatest, time.Time{}},
		"5m":                   {async.StartFromTimestamp, now.Add(-5 * time.Minute)},
		"2026-01-01T11:00:00Z": {async.StartFromTimestamp, now.Add(-time.Hour)},
	}
	for in, want := range cases {
		start, since, err := parseSince(in, now)
		if err != nil || start != want.start || !since.Equal(want.since) {
			t.Errorf("parseSince(%q) = %s %v %v; want %s %v", in, start, since, err, want.start, want.since)
		}
	}
}

func TestParseMessageFilter_Errors(t *testing.T) {
	if _, err := parseMessageFilter(map[string]interface{}{"match": "order_id=1"}); err == nil {
		t.Error("expected error for non-mapping match")
	}
	if _, err := parseMessageFilter(map[string]interface{}{"filter": map[string]interface{}{"key_pattern": "("}}); err == nil {
		t.Error("expected error for invalid key_pattern")
	}
	if f, err := parseMessageFilter(map[string]interface{}{}); err != nil || f != nil {
		t.Errorf("empty config should yield nil filter, got %+v %v", f, err)
	}
}

func TestFailOnTimeoutDefaults(t *testing.T) {
	withMatch := &async.KafkaConsumerConfig{Filter: &async.MessageFilter{Match: map[string]interface{}{"id": 1}}}
	plain := &async.KafkaConsumerConfig{}

	if !failOnTimeout(map[string]interface{}{}, withMatch) {
		t.Error("waiting for a specific event should fail on timeout by default")
	}
	if failOnTimeout(map[string]interface{}{}, plain) {
		t.Error("unfiltered consumers keep the lenient legacy behaviour")
	}
	if failOnTimeout(map[string]interface{}{"fail_on_timeout": false}, withMatch) {
		t.Error("explicit fail_on_timeout: false must win")
	}
}

func TestTimeoutErrorExplainsWhatWasSeen(t *testing.T) {
	cfg := &async.KafkaConsumerConfig{
		Topic:   "order.placed",
		Timeout: "10s",
		Count:   1,
		Filter:  &async.MessageFilter{Match: map[string]interface{}{"order_id": "abc"}},
	}

	err := timeoutError(cfg, &async.KafkaConsumerResult{
		Scanned:   2,
		Unmatched: []async.KafkaMessage{{Key: "xyz", Value: `{"order_id":"xyz"}`}},
	})
	msg := err.Error()
	for _, want := range []string{`topic "order.placed"`, "order_id=abc", "2 message(s) read, 0 matched", `{"order_id":"xyz"}`} {
		if !strings.Contains(msg, want) {
			t.Errorf("error %q missing %q", msg, want)
		}
	}

	empty := timeoutError(cfg, &async.KafkaConsumerResult{}).Error()
	if !strings.Contains(empty, "no messages were published") {
		t.Errorf("empty-topic error = %q", empty)
	}
}
