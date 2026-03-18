package mcpserver

import (
	"fmt"
	"testing"
)

func TestGenerateE2EAnalysisReport(t *testing.T) {
	ws, err := AnalyzeWorkspace("/Users/ggeorgiev/Dev/testmesh/demo-services")
	if err != nil {
		t.Fatal(err)
	}
	opts := AnalysisReportOptions{
		DBConnection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable",
		KafkaBrokers: "localhost:9092",
		RedisAddr:    "localhost:6379",
		ServiceURLs: map[string]string{
			"user-service":         "http://localhost:5001",
			"product-service":      "http://localhost:5002",
			"order-service":        "http://localhost:5003",
			"notification-service": "http://localhost:5004",
		},
		OutputPath: "./my-e2e-flow.yaml",
	}
	report := GenerateE2EAnalysisReport(ws, opts)
	fmt.Print(report)

	// Verify key things are present in the report
	checks := []string{
		"CreateUserRequest",      // request schema extracted
		"CreateOrderRequest",     // order request schema
		"user_id",                // field from order request
		"product_id",             // field in order items
		"user-service",           // inter-service call
		"product-service",        // inter-service call
		"order.placed",           // kafka topic
		"notification_service.notifications", // DB table
		"my-e2e-flow.yaml",       // output path instruction
	}
	for _, check := range checks {
		if !contains(report, check) {
			t.Errorf("report missing: %s", check)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
