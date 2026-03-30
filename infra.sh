#!/usr/bin/env bash
# Local shared infrastructure — PostgreSQL, Redis, Kafka, Neo4j, MinIO, LGTM (OTel/Tempo/Loki/Prometheus/Grafana)
# Safe to run multiple times; skips containers that are already running.
# Usage: ./infra.sh [up|down|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK=local-infra
ACTION=${1:-up}

create_network() {
  if ! docker network inspect "$NETWORK" &>/dev/null; then
    echo "Creating network $NETWORK"
    docker network create "$NETWORK"
  fi
}

start_postgres() {
  if docker ps -q -f name=postgres | grep -q .; then
    echo "postgres  already running"
    return
  fi
  if docker ps -aq -f name=postgres | grep -q .; then
    echo "postgres  starting (stopped container)"
    docker start postgres
    return
  fi
  echo "postgres  creating"
  docker run -d \
    --name postgres \
    --network "$NETWORK" \
    -p 5432:5432 \
    -e POSTGRES_USER=root \
    -e POSTGRES_PASSWORD=admin \
    -e POSTGRES_DB=postgres \
    -v postgres-data:/var/lib/postgresql/data \
    timescale/timescaledb:latest-pg15
}

start_redis() {
  if docker ps -q -f name=redis | grep -q .; then
    echo "redis     already running"
    return
  fi
  if docker ps -aq -f name=redis | grep -q .; then
    echo "redis     starting (stopped container)"
    docker start redis
    return
  fi
  echo "redis     creating"
  docker run -d \
    --name redis \
    --network "$NETWORK" \
    -p 6379:6379 \
    -v redis-data:/data \
    redis:7-alpine
}

start_kafka() {
  if docker ps -q -f name=kafka | grep -q .; then
    echo "kafka     already running"
    return
  fi
  if docker ps -aq -f name=kafka | grep -q .; then
    echo "kafka     starting (stopped container)"
    docker start kafka
    return
  fi
  echo "kafka     creating"
  docker run -d \
    --name kafka \
    --network "$NETWORK" \
    -p 9092:9093 \
    -e CLUSTER_ID='MkU3OEVBNTcwNTJENDM2Qk' \
    -e KAFKA_NODE_ID=1 \
    -e KAFKA_PROCESS_ROLES=broker,controller \
    -e KAFKA_CONTROLLER_QUORUM_VOTERS='1@kafka:29093' \
    -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP='CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT' \
    -e KAFKA_LISTENERS='PLAINTEXT://kafka:9092,CONTROLLER://kafka:29093,PLAINTEXT_HOST://0.0.0.0:9093' \
    -e KAFKA_ADVERTISED_LISTENERS='PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:9092' \
    -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
    -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
    -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true \
    confluentinc/cp-kafka:7.5.0
}

start_neo4j() {
  if docker ps -q -f name=neo4j | grep -q .; then
    echo "neo4j     already running"
    return
  fi
  if docker ps -aq -f name=neo4j | grep -q .; then
    echo "neo4j     starting (stopped container)"
    docker start neo4j
    return
  fi
  echo "neo4j     creating"
  docker run -d \
    --name neo4j \
    --network "$NETWORK" \
    -p 7474:7474 \
    -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/testmesh \
    -e NEO4J_PLUGINS='["apoc"]' \
    -v neo4j-data:/data \
    neo4j:5-community
}

start_minio() {
  if docker ps -q -f name=minio | grep -q .; then
    echo "minio     already running"
    return
  fi
  if docker ps -aq -f name=minio | grep -q .; then
    echo "minio     starting (stopped container)"
    docker start minio
    return
  fi
  echo "minio     creating"
  docker run -d \
    --name minio \
    --network "$NETWORK" \
    -p 9000:9000 \
    -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    -v minio-data:/data \
    minio/minio:latest server /data --console-address ":9001"
}

start_otel_collector() {
  if docker ps -q -f name=otel-collector | grep -q .; then
    echo "otel-collector already running"
    return
  fi
  if docker ps -aq -f name=otel-collector | grep -q .; then
    echo "otel-collector starting (stopped container)"
    docker start otel-collector
    return
  fi
  echo "otel-collector creating"
  docker run -d \
    --name otel-collector \
    --network "$NETWORK" \
    -p 4317:4317 \
    -p 4318:4318 \
    -p 8888:8888 \
    -v "$SCRIPT_DIR/infra/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro" \
    otel/opentelemetry-collector-contrib:latest
}

start_tempo() {
  if docker ps -q -f name=tempo | grep -q .; then
    echo "tempo     already running"
    return
  fi
  if docker ps -aq -f name=tempo | grep -q .; then
    echo "tempo     starting (stopped container)"
    docker start tempo
    return
  fi
  echo "tempo     creating"
  docker run -d \
    --name tempo \
    --network "$NETWORK" \
    -p 3200:3200 \
    -v "$SCRIPT_DIR/infra/tempo.yaml:/etc/tempo.yaml:ro" \
    -v tempo-data:/tmp/tempo \
    grafana/tempo:latest \
    -config.file=/etc/tempo.yaml
}

start_loki() {
  if docker ps -q -f name=loki | grep -q .; then
    echo "loki      already running"
    return
  fi
  if docker ps -aq -f name=loki | grep -q .; then
    echo "loki      starting (stopped container)"
    docker start loki
    return
  fi
  echo "loki      creating"
  docker run -d \
    --name loki \
    --network "$NETWORK" \
    -p 3100:3100 \
    -v "$SCRIPT_DIR/infra/loki.yaml:/etc/loki/config.yaml:ro" \
    -v loki-data:/loki \
    grafana/loki:latest \
    -config.file=/etc/loki/config.yaml
}

start_prometheus() {
  if docker ps -q -f name=prometheus | grep -q .; then
    echo "prometheus already running"
    return
  fi
  if docker ps -aq -f name=prometheus | grep -q .; then
    echo "prometheus starting (stopped container)"
    docker start prometheus
    return
  fi
  echo "prometheus creating"
  docker run -d \
    --name prometheus \
    --network "$NETWORK" \
    -p 9090:9090 \
    -v "$SCRIPT_DIR/infra/prometheus.yaml:/etc/prometheus/prometheus.yml:ro" \
    -v prometheus-data:/prometheus \
    prom/prometheus:latest \
    --config.file=/etc/prometheus/prometheus.yml \
    --web.enable-remote-write-receiver
}

start_grafana() {
  if docker ps -q -f name=grafana | grep -q .; then
    echo "grafana   already running"
    return
  fi
  if docker ps -aq -f name=grafana | grep -q .; then
    echo "grafana   starting (stopped container)"
    docker start grafana
    return
  fi
  echo "grafana   creating"
  docker run -d \
    --name grafana \
    --network "$NETWORK" \
    -p 3002:3000 \
    -e GF_AUTH_ANONYMOUS_ENABLED=true \
    -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
    -v "$SCRIPT_DIR/infra/grafana:/etc/grafana/provisioning/datasources:ro" \
    -v grafana-data:/var/lib/grafana \
    grafana/grafana:latest
}

case "$ACTION" in
  up)
    create_network
    start_postgres
    start_redis
    start_kafka
    start_neo4j
    start_minio
    start_otel_collector
    start_tempo
    start_loki
    start_prometheus
    start_grafana
    echo ""
    echo "PostgreSQL   postgresql://root:admin@localhost:5432/postgres"
    echo "Redis        redis://localhost:6379"
    echo "Kafka        localhost:9092"
    echo "Neo4j        bolt://localhost:7687 (browser: http://localhost:7474)"
    echo "MinIO        http://localhost:9000 (console: http://localhost:9001)"
    echo "OTel         grpc://localhost:4317  http://localhost:4318"
    echo "Tempo        http://localhost:3200"
    echo "Loki         http://localhost:3100"
    echo "Prometheus   http://localhost:9090"
    echo "Grafana      http://localhost:3002  (anonymous admin)"
    ;;
  down)
    echo "Stopping containers (data volumes preserved)"
    docker stop postgres redis kafka neo4j minio otel-collector tempo loki prometheus grafana 2>/dev/null || true
    ;;
  destroy)
    echo "Removing containers and volumes"
    docker rm -f postgres redis kafka neo4j minio otel-collector tempo loki prometheus grafana 2>/dev/null || true
    docker volume rm postgres-data redis-data neo4j-data minio-data tempo-data loki-data prometheus-data grafana-data 2>/dev/null || true
    ;;
  status)
    docker ps \
      --filter name=postgres --filter name=redis --filter name=kafka \
      --filter name=neo4j --filter name=minio --filter name=otel-collector \
      --filter name=tempo --filter name=loki --filter name=prometheus --filter name=grafana \
      --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
  *)
    echo "Usage: $0 [up|down|destroy|status]"
    exit 1
    ;;
esac
