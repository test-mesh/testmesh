package redis

import (
	"context"
	"encoding/json"
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

func (c *Client) SetUser(ctx context.Context, userID string, userData interface{}) error {
	data, err := json.Marshal(userData)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("user:%s", userID)
	return c.client.Set(ctx, key, data, 5*time.Minute).Err()
}

func (c *Client) GetUser(ctx context.Context, userID string) ([]byte, error) {
	key := fmt.Sprintf("user:%s", userID)
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	return data, err
}

func (c *Client) SetSession(ctx context.Context, token, userID string) error {
	key := fmt.Sprintf("session:%s", token)
	return c.client.Set(ctx, key, userID, 24*time.Hour).Err()
}

func (c *Client) GetSession(ctx context.Context, token string) (string, error) {
	key := fmt.Sprintf("session:%s", token)
	userID, err := c.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil // Session not found
	}
	return userID, err
}

func (c *Client) DeleteSession(ctx context.Context, token string) error {
	key := fmt.Sprintf("session:%s", token)
	return c.client.Del(ctx, key).Err()
}

func (c *Client) Close() error {
	return c.client.Close()
}
