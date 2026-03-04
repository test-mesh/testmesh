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

func (c *Client) SetProduct(ctx context.Context, productID string, productData interface{}) error {
	data, err := json.Marshal(productData)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("product:%s", productID)
	return c.client.Set(ctx, key, data, 10*time.Minute).Err()
}

func (c *Client) GetProduct(ctx context.Context, productID string) ([]byte, error) {
	key := fmt.Sprintf("product:%s", productID)
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	return data, err
}

func (c *Client) DeleteProduct(ctx context.Context, productID string) error {
	key := fmt.Sprintf("product:%s", productID)
	return c.client.Del(ctx, key).Err()
}

// AcquireLock attempts to acquire a distributed lock for inventory updates
func (c *Client) AcquireLock(ctx context.Context, productID string) (bool, error) {
	key := fmt.Sprintf("lock:inventory:%s", productID)
	// SETNX with TTL for distributed locking
	result, err := c.client.SetNX(ctx, key, "locked", 5*time.Second).Result()
	return result, err
}

// ReleaseLock releases the distributed lock
func (c *Client) ReleaseLock(ctx context.Context, productID string) error {
	key := fmt.Sprintf("lock:inventory:%s", productID)
	return c.client.Del(ctx, key).Err()
}

func (c *Client) Close() error {
	return c.client.Close()
}
