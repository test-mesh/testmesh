package minio

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const bucket = "product-images"

// Client wraps minio.Client with product-image operations.
type Client struct {
	mc *minio.Client
}

// NewClient creates a MinIO client from env vars.
// MINIO_ENDPOINT defaults to minio:9000
// MINIO_ACCESS_KEY defaults to minioadmin
// MINIO_SECRET_KEY defaults to minioadmin
func NewClient(ctx context.Context) (*Client, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "minio:9000"
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "minioadmin"
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	// Ensure bucket exists
	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	return &Client{mc: mc}, nil
}

// objectKey returns the MinIO object key for a product image.
func objectKey(productID string) string {
	return fmt.Sprintf("products/%s/image", productID)
}

// UploadImage stores image data for a product.
func (c *Client) UploadImage(ctx context.Context, productID string, data []byte, contentType string) error {
	_, err := c.mc.PutObject(ctx, bucket, objectKey(productID),
		bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType},
	)
	return err
}

// PresignedDownloadURL returns a 24h presigned URL for the product image.
// Returns ("", false, nil) if the image does not exist.
func (c *Client) PresignedDownloadURL(ctx context.Context, productID string) (string, bool, error) {
	key := objectKey(productID)
	// Check existence
	_, err := c.mc.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" {
			return "", false, nil
		}
		return "", false, err
	}

	url, err := c.mc.PresignedGetObject(ctx, bucket, key, 24*time.Hour, nil)
	if err != nil {
		return "", false, err
	}
	return url.String(), true, nil
}

// GetImage returns the raw image bytes for a product.
// Returns (nil, "", false, nil) if the image does not exist.
func (c *Client) GetImage(ctx context.Context, productID string) ([]byte, string, bool, error) {
	key := objectKey(productID)
	obj, err := c.mc.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, "", false, err
	}
	defer obj.Close()

	info, err := obj.Stat()
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, "", false, err
	}
	return data, info.ContentType, true, nil
}
