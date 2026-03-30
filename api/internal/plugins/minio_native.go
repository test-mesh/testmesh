// api/internal/plugins/minio_native.go
package plugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// MinioNativePlugin provides native MinIO/S3 integration.
// Actions: minio.put, minio.get, minio.delete, minio.assert
type MinioNativePlugin struct {
	logger *zap.Logger
}

func NewMinioNativePlugin(logger *zap.Logger) *MinioNativePlugin {
	return &MinioNativePlugin{logger: logger}
}

func (p *MinioNativePlugin) Name() string { return "minio" }

func (p *MinioNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "minio.put":
		return p.put(ctx, config)
	case "minio.get":
		return p.get(ctx, config)
	case "minio.delete":
		return p.delete(ctx, config)
	case "minio.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown minio action: %s", action)
	}
}

func (p *MinioNativePlugin) client(config map[string]interface{}) (*minio.Client, error) {
	endpoint, _ := config["endpoint"].(string)
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	accessKey, _ := config["access_key"].(string)
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey, _ := config["secret_key"].(string)
	if secretKey == "" {
		secretKey = "minioadmin"
	}
	useSSL, _ := config["use_ssl"].(bool)

	return minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
}

func (p *MinioNativePlugin) put(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.put: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.put: object is required")
	}
	dataRaw, ok := config["data"]
	if !ok {
		return nil, fmt.Errorf("minio.put: data is required")
	}

	dataStr := fmt.Sprintf("%v", dataRaw)
	contentType, _ := config["content_type"].(string)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Try base64 decode; if it fails treat as plain string
	var reader io.Reader
	var size int64
	if decoded, err := base64.StdEncoding.DecodeString(dataStr); err == nil && !strings.ContainsAny(dataStr, " \n\t") {
		reader = bytes.NewReader(decoded)
		size = int64(len(decoded))
	} else {
		b := []byte(dataStr)
		reader = bytes.NewReader(b)
		size = int64(len(b))
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.put: client: %w", err)
	}

	info, err := mc.PutObject(ctx, bucket, object, reader, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return nil, fmt.Errorf("minio.put: upload: %w", err)
	}

	p.logger.Info("minio.put", zap.String("bucket", bucket), zap.String("object", object), zap.Int64("size", info.Size))
	return map[string]interface{}{
		"etag":   strings.Trim(info.ETag, "\""),
		"size":   info.Size,
		"bucket": info.Bucket,
		"object": info.Key,
	}, nil
}

func (p *MinioNativePlugin) get(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.get: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.get: object is required")
	}
	as, _ := config["as"].(string)
	if as == "" {
		as = "text"
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.get: client: %w", err)
	}

	obj, err := mc.GetObject(ctx, bucket, object, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio.get: get: %w", err)
	}
	defer obj.Close()

	stat, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("minio.get: stat: %w", err)
	}

	rawBytes, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("minio.get: read: %w", err)
	}

	var body interface{}
	switch as {
	case "json":
		var parsed interface{}
		if err := json.Unmarshal(rawBytes, &parsed); err != nil {
			return nil, fmt.Errorf("minio.get: parse json: %w", err)
		}
		body = parsed
	case "base64":
		body = base64.StdEncoding.EncodeToString(rawBytes)
	default:
		body = string(rawBytes)
	}

	p.logger.Info("minio.get", zap.String("bucket", bucket), zap.String("object", object))
	return map[string]interface{}{
		"body":         body,
		"content_type": stat.ContentType,
		"size":         stat.Size,
		"etag":         strings.Trim(stat.ETag, "\""),
	}, nil
}

func (p *MinioNativePlugin) delete(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.delete: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.delete: object is required")
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.delete: client: %w", err)
	}

	if err := mc.RemoveObject(ctx, bucket, object, minio.RemoveObjectOptions{}); err != nil {
		return nil, fmt.Errorf("minio.delete: remove: %w", err)
	}

	p.logger.Info("minio.delete", zap.String("bucket", bucket), zap.String("object", object))
	return map[string]interface{}{"deleted": true}, nil
}

func (p *MinioNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.assert: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.assert: object is required")
	}
	existsWanted, ok := config["exists"]
	if !ok {
		return nil, fmt.Errorf("minio.assert: exists is required")
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.assert: client: %w", err)
	}

	stat, statErr := mc.StatObject(ctx, bucket, object, minio.StatObjectOptions{})
	exists := statErr == nil

	wantExists, _ := existsWanted.(bool)
	if exists != wantExists {
		if wantExists {
			return nil, fmt.Errorf("minio.assert: object %s/%s does not exist", bucket, object)
		}
		return nil, fmt.Errorf("minio.assert: object %s/%s exists but expected not to", bucket, object)
	}

	result := map[string]interface{}{"exists": exists}
	if exists {
		result["content_type"] = stat.ContentType
		result["size"] = stat.Size

		if expected, ok := config["content_type"].(string); ok && expected != "" {
			if stat.ContentType != expected {
				return nil, fmt.Errorf("minio.assert: content_type: got %q, want %q", stat.ContentType, expected)
			}
		}
		if sizeGte, ok := config["size_gte"].(float64); ok {
			if float64(stat.Size) < sizeGte {
				return nil, fmt.Errorf("minio.assert: size %d < size_gte %d", stat.Size, int64(sizeGte))
			}
		}
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}
	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("minio.assert: %w", err)
		}
	}

	return result, nil
}
