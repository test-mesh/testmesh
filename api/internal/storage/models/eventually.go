package models

import (
	"encoding/json"
	"fmt"
	"time"

	"gopkg.in/yaml.v3"
)

// Default polling interval for steps marked with `eventually`.
const DefaultEventuallyInterval = 500 * time.Millisecond

// EventuallyConfig makes a step re-run its action and assertions until they
// pass or the timeout expires. It is the building block for verifying
// asynchronous side effects (a row written by a Kafka consumer, a status that
// flips after a background job, ...) without separate poll steps.
//
// It accepts either a bare duration or a mapping:
//
//	eventually: 15s
//
//	eventually:
//	  timeout: 15s
//	  interval: 250ms
type EventuallyConfig struct {
	Timeout  string `json:"timeout" yaml:"timeout"`
	Interval string `json:"interval,omitempty" yaml:"interval,omitempty"`
}

// UnmarshalYAML accepts both the scalar and mapping forms.
func (e *EventuallyConfig) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		e.Timeout = node.Value
		return nil
	}
	type plain EventuallyConfig
	var p plain
	if err := node.Decode(&p); err != nil {
		return err
	}
	*e = EventuallyConfig(p)
	return nil
}

// UnmarshalJSON accepts both the string and object forms.
func (e *EventuallyConfig) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		e.Timeout = s
		return nil
	}
	type plain EventuallyConfig
	var p plain
	if err := json.Unmarshal(data, &p); err != nil {
		return err
	}
	*e = EventuallyConfig(p)
	return nil
}

// Durations parses the timeout and interval, applying the default interval.
func (e *EventuallyConfig) Durations() (timeout, interval time.Duration, err error) {
	if e.Timeout == "" {
		return 0, 0, fmt.Errorf("eventually: timeout is required (e.g. eventually: 15s)")
	}
	timeout, err = time.ParseDuration(e.Timeout)
	if err != nil {
		return 0, 0, fmt.Errorf("eventually: invalid timeout %q: %w", e.Timeout, err)
	}
	interval = DefaultEventuallyInterval
	if e.Interval != "" {
		interval, err = time.ParseDuration(e.Interval)
		if err != nil {
			return 0, 0, fmt.Errorf("eventually: invalid interval %q: %w", e.Interval, err)
		}
	}
	if timeout <= 0 || interval <= 0 {
		return 0, 0, fmt.Errorf("eventually: timeout and interval must be positive")
	}
	return timeout, interval, nil
}
