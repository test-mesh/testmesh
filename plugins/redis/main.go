// Redis Plugin for TestMesh
//
// This is an example of a Go plugin that runs as a standalone HTTP server.
// It demonstrates how to create plugins in Go that can be installed from
// the marketplace.
//
// Usage in a flow:
//
//	steps:
//	  - name: Set cache value
//	    action: redis.set
//	    config:
//	      addr: "localhost:6379"
//	      key: "user:123"
//	      value: '{"name": "John"}'
//	      ttl: 3600
//
//	  - name: Get cache value
//	    action: redis.get
//	    config:
//	      addr: "localhost:6379"
//	      key: "user:123"
//	    output:
//	      user: "{{ value }}"
//
// Build: go build -o redis-plugin .
// Run: PLUGIN_PORT=9000 ./redis-plugin

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Plugin manifest info
var manifest = map[string]interface{}{
	"id":          "redis",
	"name":        "Redis Plugin",
	"version":     "1.0.0",
	"description": "Redis integration - strings, hashes, lists, sets, pub/sub",
}

// Action handlers
var handlers = map[string]func(context.Context, map[string]interface{}) (map[string]interface{}, error){
	"redis.get":       handleGet,
	"redis.set":       handleSet,
	"redis.del":       handleDel,
	"redis.exists":    handleExists,
	"redis.keys":      handleKeys,
	"redis.hget":      handleHGet,
	"redis.hset":      handleHSet,
	"redis.hgetall":   handleHGetAll,
	"redis.lpush":     handleLPush,
	"redis.rpush":     handleRPush,
	"redis.lpop":      handleLPop,
	"redis.rpop":      handleRPop,
	"redis.lrange":    handleLRange,
	"redis.sadd":      handleSAdd,
	"redis.smembers":  handleSMembers,
	"redis.sismember": handleSIsMember,
	"redis.publish":   handlePublish,
	"redis.incr":      handleIncr,
	"redis.decr":      handleDecr,
	"redis.expire":    handleExpire,
	"redis.ttl":       handleTTL,
	"redis.flushdb":   handleFlushDB,
}

func main() {
	port := os.Getenv("PLUGIN_PORT")
	if port == "" {
		port = "0"
	}

	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/info", handleInfo)
	http.HandleFunc("/execute", handleExecute)
	http.HandleFunc("/shutdown", handleShutdown)

	addr := fmt.Sprintf("127.0.0.1:%s", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	log.Printf("Plugin redis listening on %s", listener.Addr().String())

	if err := http.Serve(listener, nil); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "healthy",
		"version":        manifest["version"],
		"uptime_seconds": 0,
	})
}

func handleInfo(w http.ResponseWriter, r *http.Request) {
	actions := make([]map[string]string, 0)
	for name := range handlers {
		actions = append(actions, map[string]string{
			"id":          name,
			"name":        name,
			"description": fmt.Sprintf("Action: %s", name),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":          manifest["id"],
		"name":        manifest["name"],
		"version":     manifest["version"],
		"description": manifest["description"],
		"actions":     actions,
	})
}

func handleExecute(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var req struct {
		Action  string                 `json:"action"`
		Config  map[string]interface{} `json:"config"`
		Context map[string]interface{} `json:"context"`
	}
	json.Unmarshal(body, &req)

	handler, ok := handlers[req.Action]
	if !ok {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   map[string]string{"code": "UNKNOWN_ACTION", "message": fmt.Sprintf("Unknown action: %s", req.Action)},
		})
		return
	}

	start := time.Now()
	ctx := context.Background()

	result, err := handler(ctx, req.Config)

	response := map[string]interface{}{
		"metrics": map[string]int64{"duration_ms": time.Since(start).Milliseconds()},
	}

	if err != nil {
		response["success"] = false
		response["error"] = map[string]string{"code": "EXECUTION_ERROR", "message": err.Error()}
	} else {
		response["success"] = true
		response["output"] = result
	}

	json.NewEncoder(w).Encode(response)
}

func handleShutdown(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "shutting_down"})
	go func() {
		time.Sleep(100 * time.Millisecond)
		os.Exit(0)
	}()
}

// ============================================
// Redis Client Helper
// ============================================

func getClient(config map[string]interface{}) *redis.Client {
	addr := "localhost:6379"
	if a, ok := config["addr"].(string); ok {
		addr = a
	} else if host, ok := config["host"].(string); ok {
		port := "6379"
		if p, ok := config["port"].(float64); ok {
			port = strconv.Itoa(int(p))
		}
		addr = fmt.Sprintf("%s:%s", host, port)
	}

	password := ""
	if pw, ok := config["password"].(string); ok {
		password = pw
	}

	db := 0
	if d, ok := config["db"].(float64); ok {
		db = int(d)
	}

	return redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
}

// ============================================
// String Operations
// ============================================

func handleGet(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	val, err := client.Get(ctx, key).Result()
	if err == redis.Nil {
		return map[string]interface{}{"key": key, "value": nil, "exists": false}, nil
	}
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "value": val, "exists": true}, nil
}

func handleSet(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	value := config["value"]

	var expiration time.Duration
	if ttl, ok := config["ttl"].(float64); ok {
		expiration = time.Duration(ttl) * time.Second
	}

	err := client.Set(ctx, key, value, expiration).Err()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "ok": true}, nil
}

func handleDel(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	var keys []string
	if key, ok := config["key"].(string); ok {
		keys = []string{key}
	} else if keyList, ok := config["keys"].([]interface{}); ok {
		for _, k := range keyList {
			if s, ok := k.(string); ok {
				keys = append(keys, s)
			}
		}
	}

	if len(keys) == 0 {
		return nil, fmt.Errorf("key or keys is required")
	}

	deleted, err := client.Del(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"deleted": deleted}, nil
}

func handleExists(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	count, err := client.Exists(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "exists": count > 0}, nil
}

func handleKeys(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	pattern := "*"
	if p, ok := config["pattern"].(string); ok {
		pattern = p
	}

	keys, err := client.Keys(ctx, pattern).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"keys": keys, "count": len(keys)}, nil
}

// ============================================
// Hash Operations
// ============================================

func handleHGet(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	field, _ := config["field"].(string)
	if key == "" || field == "" {
		return nil, fmt.Errorf("key and field are required")
	}

	val, err := client.HGet(ctx, key, field).Result()
	if err == redis.Nil {
		return map[string]interface{}{"key": key, "field": field, "value": nil, "exists": false}, nil
	}
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "field": field, "value": val, "exists": true}, nil
}

func handleHSet(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var values []interface{}
	if field, ok := config["field"].(string); ok {
		values = append(values, field, config["value"])
	}
	if fields, ok := config["fields"].(map[string]interface{}); ok {
		for k, v := range fields {
			values = append(values, k, v)
		}
	}

	if len(values) == 0 {
		return nil, fmt.Errorf("field/value or fields is required")
	}

	added, err := client.HSet(ctx, key, values...).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "added": added}, nil
}

func handleHGetAll(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	val, err := client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "fields": val, "count": len(val)}, nil
}

// ============================================
// List Operations
// ============================================

func handleLPush(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var values []interface{}
	if v, ok := config["value"]; ok {
		values = append(values, v)
	}
	if vals, ok := config["values"].([]interface{}); ok {
		values = append(values, vals...)
	}

	length, err := client.LPush(ctx, key, values...).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "length": length}, nil
}

func handleRPush(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var values []interface{}
	if v, ok := config["value"]; ok {
		values = append(values, v)
	}
	if vals, ok := config["values"].([]interface{}); ok {
		values = append(values, vals...)
	}

	length, err := client.RPush(ctx, key, values...).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "length": length}, nil
}

func handleLPop(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	val, err := client.LPop(ctx, key).Result()
	if err == redis.Nil {
		return map[string]interface{}{"key": key, "value": nil, "empty": true}, nil
	}
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "value": val, "empty": false}, nil
}

func handleRPop(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	val, err := client.RPop(ctx, key).Result()
	if err == redis.Nil {
		return map[string]interface{}{"key": key, "value": nil, "empty": true}, nil
	}
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "value": val, "empty": false}, nil
}

func handleLRange(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	start := int64(0)
	stop := int64(-1)
	if s, ok := config["start"].(float64); ok {
		start = int64(s)
	}
	if s, ok := config["stop"].(float64); ok {
		stop = int64(s)
	}

	values, err := client.LRange(ctx, key, start, stop).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "values": values, "count": len(values)}, nil
}

// ============================================
// Set Operations
// ============================================

func handleSAdd(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var members []interface{}
	if m, ok := config["member"]; ok {
		members = append(members, m)
	}
	if mems, ok := config["members"].([]interface{}); ok {
		members = append(members, mems...)
	}

	added, err := client.SAdd(ctx, key, members...).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "added": added}, nil
}

func handleSMembers(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	members, err := client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "members": members, "count": len(members)}, nil
}

func handleSIsMember(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	member := config["member"]
	if key == "" || member == nil {
		return nil, fmt.Errorf("key and member are required")
	}

	isMember, err := client.SIsMember(ctx, key, member).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "isMember": isMember}, nil
}

// ============================================
// Pub/Sub Operations
// ============================================

func handlePublish(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	channel, _ := config["channel"].(string)
	message := config["message"]
	if channel == "" {
		return nil, fmt.Errorf("channel is required")
	}

	receivers, err := client.Publish(ctx, channel, message).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"channel": channel, "receivers": receivers}, nil
}

// ============================================
// Numeric Operations
// ============================================

func handleIncr(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var val int64
	var err error

	if by, ok := config["by"].(float64); ok {
		val, err = client.IncrBy(ctx, key, int64(by)).Result()
	} else {
		val, err = client.Incr(ctx, key).Result()
	}

	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "value": val}, nil
}

func handleDecr(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	var val int64
	var err error

	if by, ok := config["by"].(float64); ok {
		val, err = client.DecrBy(ctx, key, int64(by)).Result()
	} else {
		val, err = client.Decr(ctx, key).Result()
	}

	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "value": val}, nil
}

// ============================================
// Key Expiration
// ============================================

func handleExpire(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	ttl, ok := config["ttl"].(float64)
	if key == "" || !ok {
		return nil, fmt.Errorf("key and ttl are required")
	}

	set, err := client.Expire(ctx, key, time.Duration(ttl)*time.Second).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"key": key, "set": set}, nil
}

func handleTTL(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	key, _ := config["key"].(string)
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	duration, err := client.TTL(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"key":       key,
		"ttl":       int64(duration.Seconds()),
		"hasExpiry": duration >= 0,
	}, nil
}

func handleFlushDB(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	client := getClient(config)
	defer client.Close()

	err := client.FlushDB(ctx).Err()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{"flushed": true}, nil
}
