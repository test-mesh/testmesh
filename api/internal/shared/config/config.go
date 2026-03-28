package config

import (
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	Environment string
	Server      ServerConfig
	Database    DatabaseConfig
	Redis       RedisConfig
	Kafka       KafkaConfig
	Neo4j       Neo4jConfig
	Graph       GraphConfig
	Logger      LoggerConfig
}

// Neo4jConfig holds Neo4j graph database configuration
type Neo4jConfig struct {
	URI      string
	User     string
	Password string
	Database string // Neo4j database name (default: "neo4j")
	MaxConns int
}

// GraphConfig holds system graph feature configuration
type GraphConfig struct {
	Enabled            bool
	EmbeddingProvider  string // "openai", "ollama", "none"
	EmbeddingModel     string
	EmbeddingDimension int
	ScanTimeoutMinutes int
	MaxRepoSizeMB      int
	MaxFileCount       int
	MaxFileSizeMB      int
	RepoClonePath      string
	MaxConcurrentScans int
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
	MaxConns int
	MaxIdle  int
}

// RedisConfig holds Redis configuration
type RedisConfig struct {
	Host       string
	Port       int
	Password   string
	DB         int
	TLSEnabled bool
}

// KafkaConfig holds Kafka configuration
type KafkaConfig struct {
	Enabled        bool
	Brokers        []string
	SASLEnabled    bool
	SASLMechanism  string
	SASLUsername   string
	SASLPassword   string
	TLSEnabled     bool
	TLSSkipVerify  bool
}

// LoggerConfig holds logger configuration
type LoggerConfig struct {
	Level      string
	OutputPath string
}

// Load loads configuration from environment variables and config files
func Load() (*Config, error) {
	viper.SetDefault("environment", "development")
	viper.SetDefault("server.port", 5016)
	viper.SetDefault("server.read_timeout", "15s")
	viper.SetDefault("server.write_timeout", "15s")

	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 5432)
	viper.SetDefault("database.user", "root")
	viper.SetDefault("database.password", "admin")
	viper.SetDefault("database.dbname", "testmesh")
	viper.SetDefault("database.sslmode", "disable")
	viper.SetDefault("database.max_conns", 25)
	viper.SetDefault("database.max_idle", 5)

	viper.SetDefault("redis.host", "localhost")
	viper.SetDefault("redis.port", 6379)
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)
	viper.SetDefault("redis.tls_enabled", false)

	viper.SetDefault("kafka.enabled", false)
	viper.SetDefault("kafka.brokers", []string{"localhost:9092"})
	viper.SetDefault("kafka.sasl_enabled", false)
	viper.SetDefault("kafka.sasl_mechanism", "PLAIN")
	viper.SetDefault("kafka.sasl_username", "")
	viper.SetDefault("kafka.sasl_password", "")
	viper.SetDefault("kafka.tls_enabled", false)
	viper.SetDefault("kafka.tls_skip_verify", false)

	viper.SetDefault("neo4j.uri", "")
	viper.SetDefault("neo4j.user", "neo4j")
	viper.SetDefault("neo4j.password", "testmesh")
	viper.SetDefault("neo4j.database", "neo4j")
	viper.SetDefault("neo4j.max_conns", 25)

	viper.SetDefault("graph.enabled", true)
	viper.SetDefault("graph.embedding_provider", "none")
	viper.SetDefault("graph.embedding_model", "text-embedding-3-small")
	viper.SetDefault("graph.embedding_dimension", 1536)
	viper.SetDefault("graph.scan_timeout_minutes", 30)
	viper.SetDefault("graph.max_repo_size_mb", 2048)
	viper.SetDefault("graph.max_file_count", 100000)
	viper.SetDefault("graph.max_file_size_mb", 10)
	viper.SetDefault("graph.repo_clone_path", "/tmp/testmesh-repos")
	viper.SetDefault("graph.max_concurrent_scans", 2)

	viper.SetDefault("logger.level", "info")
	viper.SetDefault("logger.output_path", "stdout")

	// Auto-load environment variables (map DATABASE_HOST → database.host)
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Try to load config file (optional)
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	viper.ReadInConfig() // Ignore error if config file not found

	readTimeout, _ := time.ParseDuration(viper.GetString("server.read_timeout"))
	writeTimeout, _ := time.ParseDuration(viper.GetString("server.write_timeout"))

	cfg := &Config{
		Environment: viper.GetString("environment"),
		Server: ServerConfig{
			Port:         viper.GetInt("server.port"),
			ReadTimeout:  readTimeout,
			WriteTimeout: writeTimeout,
		},
		Database: DatabaseConfig{
			Host:     viper.GetString("database.host"),
			Port:     viper.GetInt("database.port"),
			User:     viper.GetString("database.user"),
			Password: viper.GetString("database.password"),
			DBName:   viper.GetString("database.dbname"),
			SSLMode:  viper.GetString("database.sslmode"),
			MaxConns: viper.GetInt("database.max_conns"),
			MaxIdle:  viper.GetInt("database.max_idle"),
		},
		Redis: RedisConfig{
			Host:       viper.GetString("redis.host"),
			Port:       viper.GetInt("redis.port"),
			Password:   viper.GetString("redis.password"),
			DB:         viper.GetInt("redis.db"),
			TLSEnabled: viper.GetBool("redis.tls_enabled"),
		},
		Kafka: KafkaConfig{
			Enabled:       viper.GetBool("kafka.enabled"),
			Brokers:       viper.GetStringSlice("kafka.brokers"),
			SASLEnabled:   viper.GetBool("kafka.sasl_enabled"),
			SASLMechanism: viper.GetString("kafka.sasl_mechanism"),
			SASLUsername:  viper.GetString("kafka.sasl_username"),
			SASLPassword:  viper.GetString("kafka.sasl_password"),
			TLSEnabled:    viper.GetBool("kafka.tls_enabled"),
			TLSSkipVerify: viper.GetBool("kafka.tls_skip_verify"),
		},
		Neo4j: Neo4jConfig{
			URI:      viper.GetString("neo4j.uri"),
			User:     viper.GetString("neo4j.user"),
			Password: viper.GetString("neo4j.password"),
			Database: viper.GetString("neo4j.database"),
			MaxConns: viper.GetInt("neo4j.max_conns"),
		},
		Graph: GraphConfig{
			Enabled:            viper.GetBool("graph.enabled"),
			EmbeddingProvider:  viper.GetString("graph.embedding_provider"),
			EmbeddingModel:     viper.GetString("graph.embedding_model"),
			EmbeddingDimension: viper.GetInt("graph.embedding_dimension"),
			ScanTimeoutMinutes: viper.GetInt("graph.scan_timeout_minutes"),
			MaxRepoSizeMB:      viper.GetInt("graph.max_repo_size_mb"),
			MaxFileCount:       viper.GetInt("graph.max_file_count"),
			MaxFileSizeMB:      viper.GetInt("graph.max_file_size_mb"),
			RepoClonePath:      viper.GetString("graph.repo_clone_path"),
			MaxConcurrentScans: viper.GetInt("graph.max_concurrent_scans"),
		},
		Logger: LoggerConfig{
			Level:      viper.GetString("logger.level"),
			OutputPath: viper.GetString("logger.output_path"),
		},
	}

	return cfg, nil
}
