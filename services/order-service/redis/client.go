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

func (c *Client) SetOrder(ctx context.Context, orderID string, orderData interface{}) error {
	data, err := json.Marshal(orderData)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("order:%s", orderID)
	return c.client.Set(ctx, key, data, 30*time.Minute).Err()
}

func (c *Client) GetOrder(ctx context.Context, orderID string) ([]byte, error) {
	key := fmt.Sprintf("order:%s", orderID)
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	return data, err
}

func (c *Client) Close() error {
	return c.client.Close()
}
