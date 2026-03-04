package redis

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	client *redis.Client
}

func NewClient() (*Client, error) {
	addr := fmt.Sprintf("%s:%s", os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT"))

	client := redis.NewClient(&redis.Options{
		Addr: addr,
		DB:   0,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &Client{client: client}, nil
}

// CacheRecentNotifications caches recent notification IDs for a user
func (c *Client) CacheRecentNotifications(ctx context.Context, userID string, notificationIDs []string) error {
	key := fmt.Sprintf("notifications:%s:recent", userID)

	// Store as a list
	pipe := c.client.Pipeline()
	pipe.Del(ctx, key)
	if len(notificationIDs) > 0 {
		pipe.RPush(ctx, key, notificationIDs)
	}
	pipe.Expire(ctx, key, 10*time.Minute)

	_, err := pipe.Exec(ctx)
	return err
}

// GetRecentNotifications retrieves cached notification IDs for a user
func (c *Client) GetRecentNotifications(ctx context.Context, userID string) ([]string, error) {
	key := fmt.Sprintf("notifications:%s:recent", userID)
	result, err := c.client.LRange(ctx, key, 0, -1).Result()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	return result, err
}

func (c *Client) Close() error {
	return c.client.Close()
}
