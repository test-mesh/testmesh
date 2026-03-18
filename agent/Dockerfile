FROM golang:1.24-alpine AS builder

WORKDIR /build

# Copy agent source
COPY agent/ ./agent/

# Copy OSS API source (agent depends on it via replace directive)
COPY api/ ./api/

WORKDIR /build/agent
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /testmesh-agent .

# ── runtime image ─────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /testmesh-agent /usr/local/bin/testmesh-agent

# Agent needs no persistent storage — stateless by design
ENTRYPOINT ["testmesh-agent", "start"]
