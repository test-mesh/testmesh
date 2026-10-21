package async

import (
	"testing"
)

func msg(key, value string) KafkaMessage {
	return KafkaMessage{Key: key, Value: value, Headers: map[string]string{"event-type": "OrderPlaced"}}
}

func TestMessageFilter_Match(t *testing.T) {
	m := msg("o-1", `{"order_id":"o-1","total":42,"paid":true,"items":[{"sku":"A","quantity":2}],"note":null}`)

	cases := []struct {
		name   string
		filter *MessageFilter
		want   bool
	}{
		{"nil filter", nil, true},
		{"string field", &MessageFilter{Match: map[string]interface{}{"order_id": "o-1"}}, true},
		{"wrong value", &MessageFilter{Match: map[string]interface{}{"order_id": "o-2"}}, false},
		{"number vs int", &MessageFilter{Match: map[string]interface{}{"total": 42}}, true},
		{"number vs templated string", &MessageFilter{Match: map[string]interface{}{"total": "42"}}, true},
		{"bool", &MessageFilter{Match: map[string]interface{}{"paid": true}}, true},
		{"nested array path", &MessageFilter{Match: map[string]interface{}{"items.0.quantity": 2}}, true},
		{"jsonpath prefix", &MessageFilter{Match: map[string]interface{}{"$.items.0.sku": "A"}}, true},
		{"missing field", &MessageFilter{Match: map[string]interface{}{"customer": "x"}}, false},
		{"explicit null", &MessageFilter{Match: map[string]interface{}{"note": nil}}, true},
		{"all must match", &MessageFilter{Match: map[string]interface{}{"order_id": "o-1", "total": 1}}, false},
		{"legacy json_path", &MessageFilter{JSONPath: "$.order_id", JSONValue: "o-1"}, true},
		{"key", &MessageFilter{Key: "o-1"}, true},
		{"key mismatch", &MessageFilter{Key: "o-2"}, false},
		{"key pattern", &MessageFilter{KeyPattern: "^o-\\d+$"}, true},
		{"header", &MessageFilter{Headers: map[string]string{"event-type": "OrderPlaced"}}, true},
		{"header mismatch", &MessageFilter{Headers: map[string]string{"event-type": "OrderCancelled"}}, false},
	}
	for _, tc := range cases {
		if got := tc.filter.Matches(m); got != tc.want {
			t.Errorf("%s: Matches = %v, want %v", tc.name, got, tc.want)
		}
	}

	notJSON := msg("k", "plain text")
	if (&MessageFilter{Match: map[string]interface{}{"order_id": "o-1"}}).Matches(notJSON) {
		t.Error("non-JSON payload must not satisfy a JSON match")
	}
}

func TestCollector_StopsAtCountAndKeepsDiagnostics(t *testing.T) {
	c := newCollector(&MessageFilter{Match: map[string]interface{}{"id": "want"}}, 1)

	for i := 0; i < 5; i++ {
		if c.offer(msg("noise", `{"id":"other"}`)) {
			t.Fatal("collector finished on a non-matching message")
		}
	}
	if !c.offer(msg("hit", `{"id":"want"}`)) {
		t.Fatal("collector did not finish on the matching message")
	}
	select {
	case <-c.done:
	default:
		t.Fatal("done channel not closed")
	}
	// Extra messages after completion are ignored.
	c.offer(msg("late", `{"id":"want"}`))

	var r KafkaConsumerResult
	c.fill(&r)
	if r.Count != 1 || r.Scanned != 6 || r.TimedOut {
		t.Fatalf("unexpected result: count=%d scanned=%d timed_out=%v", r.Count, r.Scanned, r.TimedOut)
	}
	if len(r.Unmatched) != maxUnmatchedSamples {
		t.Fatalf("expected %d unmatched samples, got %d", maxUnmatchedSamples, len(r.Unmatched))
	}
}

func TestCollector_TimedOut(t *testing.T) {
	c := newCollector(nil, 2)
	c.offer(msg("a", "{}"))
	var r KafkaConsumerResult
	c.fill(&r)
	if !r.TimedOut || r.Count != 1 {
		t.Fatalf("expected timed out with 1 message, got %+v", r)
	}
}
