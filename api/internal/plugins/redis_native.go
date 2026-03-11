package plugins

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// RedisNativePlugin provides native Redis integration.
// Actions: redis.get, redis.set, redis.del, redis.exists
type RedisNativePlugin struct {
	logger *zap.Logger
}

// NewRedisNativePlugin creates a new Redis plugin.
func NewRedisNativePlugin(logger *zap.Logger) *RedisNativePlugin {
	return &RedisNativePlugin{logger: logger}
}

// Name returns the plugin name.
func (p *RedisNativePlugin) Name() string {
	return "redis"
}

// Execute dispatches to sub-actions.
func (p *RedisNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "redis.get":
		return p.get(ctx, config)
	case "redis.set":
		return p.set(ctx, config)
	case "redis.del":
		return p.del(ctx, config)
	case "redis.exists":
		return p.exists(ctx, config)
	default:
		return nil, fmt.Errorf("unknown redis action: %s", action)
	}
}

func (p *RedisNativePlugin) client(config map[string]interface{}) *goredis.Client {
	host, _ := config["host"].(string)
	port, _ := config["port"].(string)
	if host == "" {
		host = "localhost"
	}
	if port == "" {
		port = "6379"
	}
	return goredis.NewClient(&goredis.Options{Addr: host + ":" + port})
}

func (p *RedisNativePlugin) get(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("redis.get: key is required")
	}

	c := p.client(config)
	defer c.Close()

	p.logger.Info("Redis GET", zap.String("key", key))

	val, err := c.Get(ctx, key).Result()
	if err == goredis.Nil {
		return map[string]interface{}{"value": nil, "exists": false}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("redis GET %q: %w", key, err)
	}
	return map[string]interface{}{"value": val, "exists": true}, nil
}

func (p *RedisNativePlugin) set(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	key, _ := config["key"].(string)
	value := config["value"]
	if key == "" {
		return nil, fmt.Errorf("redis.set: key is required")
	}

	ttl := time.Duration(0)
	if t, ok := config["ttl"].(string); ok && t != "" {
		if d, err := time.ParseDuration(t); err == nil {
			ttl = d
		}
	}

	c := p.client(config)
	defer c.Close()

	p.logger.Info("Redis SET", zap.String("key", key))

	if err := c.Set(ctx, key, fmt.Sprintf("%v", value), ttl).Err(); err != nil {
		return nil, fmt.Errorf("redis SET %q: %w", key, err)
	}
	return map[string]interface{}{"ok": true}, nil
}

func (p *RedisNativePlugin) del(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("redis.del: key is required")
	}

	c := p.client(config)
	defer c.Close()

	p.logger.Info("Redis DEL", zap.String("key", key))

	n, err := c.Del(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("redis DEL %q: %w", key, err)
	}
	return map[string]interface{}{"deleted": n}, nil
}

func (p *RedisNativePlugin) exists(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("redis.exists: key is required")
	}

	c := p.client(config)
	defer c.Close()

	n, err := c.Exists(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("redis EXISTS %q: %w", key, err)
	}
	return map[string]interface{}{"exists": n > 0, "count": n}, nil
}
