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
	Logger      LoggerConfig
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
	viper.SetDefault("database.user", "testmesh")
	viper.SetDefault("database.password", "testmesh")
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
		Logger: LoggerConfig{
			Level:      viper.GetString("logger.level"),
			OutputPath: viper.GetString("logger.output_path"),
		},
	}

	return cfg, nil
}
