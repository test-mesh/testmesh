package models

import (
	"encoding/json"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestEventuallyConfig_YAMLForms(t *testing.T) {
	var scalar Step
	if err := yaml.Unmarshal([]byte("id: a\neventually: 15s\n"), &scalar); err != nil {
		t.Fatal(err)
	}
	if scalar.Eventually == nil || scalar.Eventually.Timeout != "15s" || scalar.Eventually.Interval != "" {
		t.Fatalf("scalar form: got %+v", scalar.Eventually)
	}

	var mapping Step
	if err := yaml.Unmarshal([]byte("id: a\neventually:\n  timeout: 10s\n  interval: 250ms\n"), &mapping); err != nil {
		t.Fatal(err)
	}
	if mapping.Eventually == nil || mapping.Eventually.Timeout != "10s" || mapping.Eventually.Interval != "250ms" {
		t.Fatalf("mapping form: got %+v", mapping.Eventually)
	}

	var none Step
	if err := yaml.Unmarshal([]byte("id: a\n"), &none); err != nil {
		t.Fatal(err)
	}
	if none.Eventually != nil {
		t.Fatalf("expected nil eventually, got %+v", none.Eventually)
	}
}

func TestEventuallyConfig_JSONForms(t *testing.T) {
	var s Step
	if err := json.Unmarshal([]byte(`{"id":"a","eventually":"5s"}`), &s); err != nil {
		t.Fatal(err)
	}
	if s.Eventually.Timeout != "5s" {
		t.Fatalf("string form: got %+v", s.Eventually)
	}

	if err := json.Unmarshal([]byte(`{"id":"a","eventually":{"timeout":"3s","interval":"1s"}}`), &s); err != nil {
		t.Fatal(err)
	}
	if s.Eventually.Timeout != "3s" || s.Eventually.Interval != "1s" {
		t.Fatalf("object form: got %+v", s.Eventually)
	}

	// Round-trips through the JSONB column.
	b, _ := json.Marshal(s)
	var back Step
	if err := json.Unmarshal(b, &back); err != nil || back.Eventually.Timeout != "3s" {
		t.Fatalf("round trip: %v %+v", err, back.Eventually)
	}
}

func TestEventuallyConfig_Durations(t *testing.T) {
	timeout, interval, err := (&EventuallyConfig{Timeout: "2s"}).Durations()
	if err != nil || timeout != 2*time.Second || interval != DefaultEventuallyInterval {
		t.Fatalf("got %v %v %v", timeout, interval, err)
	}
	for _, bad := range []EventuallyConfig{{}, {Timeout: "soon"}, {Timeout: "1s", Interval: "x"}, {Timeout: "-1s"}} {
		if _, _, err := bad.Durations(); err == nil {
			t.Errorf("expected error for %+v", bad)
		}
	}
}
