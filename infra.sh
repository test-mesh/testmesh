#!/usr/bin/env bash
# Local shared infrastructure — PostgreSQL, Redis, Kafka
# Safe to run multiple times; skips containers that are already running.
# Usage: ./infra.sh [up|down|status]

set -e

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

case "$ACTION" in
  up)
    create_network
    start_postgres
    start_redis
    start_kafka
    echo ""
    echo "PostgreSQL  postgresql://root:admin@localhost:5432/postgres"
    echo "Redis       redis://localhost:6379"
    echo "Kafka       localhost:9092"
    ;;
  down)
    echo "Stopping containers (data volumes preserved)"
    docker stop postgres redis kafka 2>/dev/null || true
    ;;
  destroy)
    echo "Removing containers and volumes"
    docker rm -f postgres redis kafka 2>/dev/null || true
    docker volume rm postgres-data redis-data 2>/dev/null || true
    ;;
  status)
    docker ps --filter name=postgres --filter name=redis --filter name=kafka \
      --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
  *)
    echo "Usage: $0 [up|down|destroy|status]"
    exit 1
    ;;
esac
