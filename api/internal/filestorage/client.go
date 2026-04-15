package filestorage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

// Config holds MinIO/S3 connection settings.
type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Bucket    string
	Region    string
}

// Client wraps the MinIO SDK and provides workspace-scoped object storage.
type Client struct {
	mc     *minio.Client
	bucket string
	logger *zap.Logger
}

// New creates a MinIO client and ensures the bucket exists.
func New(cfg Config, logger *zap.Logger) (*Client, error) {
	mc, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("minio connect: %w", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := mc.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, fmt.Errorf("minio create bucket: %w", err)
		}
		logger.Info("Created MinIO bucket", zap.String("bucket", cfg.Bucket))
	}

	return &Client{mc: mc, bucket: cfg.Bucket, logger: logger}, nil
}

// ObjectKey builds a workspace-scoped key: workspaces/{workspace_id}/datasets/{file_id}/{filename}
func ObjectKey(workspaceID, fileID, filename string) string {
	return fmt.Sprintf("workspaces/%s/datasets/%s/%s", workspaceID, fileID, filename)
}

// Upload stores an object in the bucket.
func (c *Client) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.bucket, key, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("minio upload: %w", err)
	}
	return nil
}

// Download retrieves an object from the bucket.
func (c *Client) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio download: %w", err)
	}
	return obj, nil
}

// Delete removes an object from the bucket.
func (c *Client) Delete(ctx context.Context, key string) error {
	if err := c.mc.RemoveObject(ctx, c.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("minio delete: %w", err)
	}
	return nil
}

// IsAvailable checks if the MinIO server is reachable.
func (c *Client) IsAvailable(ctx context.Context) bool {
	_, err := c.mc.BucketExists(ctx, c.bucket)
	return err == nil
}

// PresignedGetURL returns a time-limited URL for downloading an object directly from MinIO.
// expiry controls how long the URL is valid; 1 hour is typical for report downloads.
func (c *Client) PresignedGetURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, key, expiry, nil)
	if err != nil {
		return "", fmt.Errorf("minio presign: %w", err)
	}
	return u.String(), nil
}
