package patterns

import "regexp"

// Common regex patterns used across language scanners for fallback detection.

var (
	// URL patterns
	HTTPURLLiteral = regexp.MustCompile(`"(https?://[^"]+)"`)
	WSURLLiteral   = regexp.MustCompile(`"(wss?://[^"]+)"`)

	// Connection strings
	PostgresConn = regexp.MustCompile(`"postgres(?:ql)?://[^"]+"`)
	MySQLConn    = regexp.MustCompile(`"mysql://[^"]+"`)
	MongoConn    = regexp.MustCompile(`"mongodb(?:\+srv)?://[^"]+"`)
	RedisConn    = regexp.MustCompile(`"redis://[^"]+"`)
	AMQPConn     = regexp.MustCompile(`"amqp://[^"]+"`)

	// Topic names — common patterns for Kafka/messaging
	TopicLiteral = regexp.MustCompile(`(?:topic|queue|channel|subject)\s*[:=]\s*"([^"]+)"`)

	// SQL table references
	SQLTableRef = regexp.MustCompile(`(?i)(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+([a-zA-Z_][\w.]*)`)

	// Generic HTTP method patterns
	HTTPMethodCall = regexp.MustCompile(`\.(Get|Post|Put|Delete|Patch|Options|Head)\s*\(`)
)

// IsExternalURL checks if a URL points to an external (non-internal) service.
func IsExternalURL(url string) bool {
	// Internal patterns
	internal := []string{
		"localhost", "127.0.0.1", "0.0.0.0",
		".local", ".internal", ".svc.cluster",
		"host.docker.internal",
	}
	for _, pattern := range internal {
		if regexp.MustCompile(regexp.QuoteMeta(pattern)).MatchString(url) {
			return false
		}
	}
	return true
}
