# Cloud Execution & Deployment

## Overview

TestMesh supports multiple deployment models for running tests in the cloud with secure access to your infrastructure (APIs, databases, Kafka brokers, internal services).

## Deployment Architectures

### 1. Single Cluster Deployment (Simple)

**Best for**: Small teams, single environment

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐ │
│  │ Web Dashboard│◄──┤  API Gateway │◄──┤ PostgreSQL │ │
│  └──────────────┘   └──────────────┘   └────────────┘ │
│         │                   │                           │
│         ├───────────────────┘                           │
│         ▼                                                │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐ │
│  │ Test Runner  │◄──┤  Scheduler   │◄──┤ Redis Streams   │ │
│  │  (3 replicas)│   └──────────────┘   └────────────┘ │
│  └──────────────┘                                       │
│         │                                                │
│         │ Direct access to internal services            │
│         ▼                                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Internal Network / VPC                     │  │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐       │  │
│  │  │   API   │  │ Database │  │   Kafka   │       │  │
│  │  └─────────┘  └──────────┘  └───────────┘       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2. Distributed Agent Architecture (Recommended)

**Best for**: Multi-environment, multi-region, hybrid cloud

```
┌─────────────────────────────────────────────────────────┐
│              TestMesh Cloud (Control Plane)             │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐ │
│  │ Web Dashboard│◄──┤  API Gateway │◄──┤ PostgreSQL │ │
│  └──────────────┘   └──────────────┘   └────────────┘ │
│         │                   │                           │
│         │                   │                           │
│         ▼                   ▼                           │
│  ┌──────────────┐   ┌──────────────┐                  │
│  │  Scheduler   │◄──┤ Job Queue    │                  │
│  └──────────────┘   └──────────────┘                  │
└─────────────┬────────────────────────────────────────────┘
              │
              │ Secure connection (TLS + mTLS)
              │
    ┌─────────┼─────────────┬─────────────────┐
    │         │             │                 │
    ▼         ▼             ▼                 ▼
┌────────┐ ┌────────┐  ┌────────┐      ┌────────┐
│ Agent  │ │ Agent  │  │ Agent  │      │ Agent  │
│  Dev   │ │Staging │  │  Prod  │      │  AWS   │
└────────┘ └────────┘  └────────┘      └────────┘
    │         │             │                │
    ▼         ▼             ▼                ▼
┌────────┐ ┌────────┐  ┌────────┐      ┌────────┐
│ Dev    │ │Staging │  │  Prod  │      │  AWS   │
│Services│ │Services│  │Services│      │Services│
└────────┘ └────────┘  └────────┘      └────────┘
```

---

## 1. Kubernetes Deployment

### Namespace Setup

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: testmesh
  labels:
    name: testmesh
    environment: production
```

### Core Services Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-api
  namespace: testmesh
spec:
  replicas: 3
  selector:
    matchLabels:
      app: testmesh-api
  template:
    metadata:
      labels:
        app: testmesh-api
    spec:
      serviceAccountName: testmesh-api
      containers:
      - name: api
        image: testmesh/api:1.0.0
        ports:
        - containerPort: 5016
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: database-url
        - name: REDIS_URL
          value: "redis://redis:6379"
        - name: REDIS_STREAMS_URL
          value: "redis://redis:6379"
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 5016
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 5016
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-runner
  namespace: testmesh
spec:
  replicas: 5  # Scale based on load
  selector:
    matchLabels:
      app: testmesh-runner
  template:
    metadata:
      labels:
        app: testmesh-runner
    spec:
      serviceAccountName: testmesh-runner
      containers:
      - name: runner
        image: testmesh/runner:1.0.0
        env:
        - name: API_GATEWAY_URL
          value: "http://testmesh-api:5016"
        - name: WORKER_CONCURRENCY
          value: "10"
        - name: MAX_EXECUTION_TIME
          value: "600"  # 10 minutes
        # Network access configuration
        - name: ALLOWED_NETWORKS
          value: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"

---
apiVersion: v1
kind: Service
metadata:
  name: testmesh-api
  namespace: testmesh
spec:
  selector:
    app: testmesh-api
  ports:
  - port: 5016
    targetPort: 5016
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: testmesh-ingress
  namespace: testmesh
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - testmesh.company.com
    secretName: testmesh-tls
  rules:
  - host: testmesh.company.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: testmesh-api
            port:
              number: 5016
```

### Network Policies

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: testmesh-runner-policy
  namespace: testmesh
spec:
  podSelector:
    matchLabels:
      app: testmesh-runner
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: testmesh-api
  egress:
  # Allow DNS
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
  # Allow access to internal services
  - to:
    - namespaceSelector:
        matchLabels:
          environment: production
  # Allow access to external services
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 80
  # Allow database access
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  # Allow Kafka access
  - to:
    - podSelector:
        matchLabels:
          app: kafka
    ports:
    - protocol: TCP
      port: 9092
```

### RBAC Configuration

```yaml
# k8s/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: testmesh-runner
  namespace: testmesh

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: testmesh-runner
  namespace: testmesh
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: testmesh-runner
  namespace: testmesh
subjects:
- kind: ServiceAccount
  name: testmesh-runner
  namespace: testmesh
roleRef:
  kind: Role
  name: testmesh-runner
  apiGroup: rbac.authorization.k8s.io
```

---

## 2. Distributed Agent Architecture

### Agent Deployment

Agents run in your private networks with access to internal services.

```yaml
# k8s/agent-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-agent
  namespace: testmesh-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: testmesh-agent
  template:
    metadata:
      labels:
        app: testmesh-agent
        environment: staging
    spec:
      containers:
      - name: agent
        image: testmesh/agent:1.0.0
        env:
        # Control plane connection
        - name: CONTROL_PLANE_URL
          value: "https://testmesh.company.com"
        - name: AGENT_TOKEN
          valueFrom:
            secretKeyRef:
              name: agent-credentials
              key: token
        - name: AGENT_NAME
          value: "staging-agent"
        - name: AGENT_TAGS
          value: "environment:staging,region:us-east-1"

        # Network configuration
        - name: ALLOWED_HOSTS
          value: "*.internal.company.com,10.0.0.0/8"

        # Service discovery
        - name: DATABASE_HOST
          value: "staging-postgres.internal.company.com"
        - name: KAFKA_BROKERS
          value: "kafka-1.internal:9092,kafka-2.internal:9092"
        - name: API_BASE_URL
          value: "https://staging-api.internal.company.com"

        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

### Agent Configuration

```yaml
# agent-config.yaml
agent:
  name: staging-agent

  # Control plane connection
  control_plane:
    url: https://testmesh.company.com
    tls:
      verify: true
      ca_cert: /etc/testmesh/ca.crt
      client_cert: /etc/testmesh/client.crt
      client_key: /etc/testmesh/client.key

    # Reconnection settings
    reconnect:
      max_attempts: 10
      backoff: exponential
      initial_delay: 1s
      max_delay: 60s

  # Agent tags for routing
  tags:
    environment: staging
    region: us-east-1
    datacenter: dc1
    capabilities:
      - http
      - database
      - kafka
      - browser

  # Execution settings
  execution:
    max_concurrent: 10
    timeout: 600  # 10 minutes

  # Resource limits
  resources:
    memory_limit: 2Gi
    cpu_limit: 2
    disk_limit: 10Gi

  # Network access control
  network:
    allowed_hosts:
      - "*.internal.company.com"
      - "10.0.0.0/8"
      - "172.16.0.0/12"
    blocked_hosts:
      - "admin.internal.company.com"
      - "*.prod-critical.internal.company.com"

    allowed_ports:
      - 80
      - 443
      - 5432   # PostgreSQL
      - 9092   # Kafka
      - 27017  # MongoDB

  # Service connections
  services:
    postgres:
      host: staging-postgres.internal.company.com
      port: 5432
      max_connections: 10

    kafka:
      brokers:
        - kafka-1.internal:9092
        - kafka-2.internal:9092
      security_protocol: SASL_SSL

    redis:
      host: staging-redis.internal.company.com
      port: 6379
```

### Agent Registration

```bash
# On-premise or private cloud
docker run -d \
  --name testmesh-agent \
  --restart unless-stopped \
  -e CONTROL_PLANE_URL=https://testmesh.company.com \
  -e AGENT_TOKEN=<your-agent-token> \
  -e AGENT_NAME=staging-agent \
  -e AGENT_TAGS=environment:staging,region:us-east-1 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  testmesh/agent:latest

# Verify agent is connected
testmesh agents list
```

```
NAME             STATUS    TAGS                              LAST_SEEN
staging-agent    online    environment:staging,region:us-e   2s ago
prod-agent       online    environment:prod,region:us-west   5s ago
dev-agent        online    environment:dev,region:eu-west    10s ago
```

---

## 3. Network Connectivity Options

### Option 1: Same VPC/Network (Simplest)

```
┌─────────────────────────────────────────────┐
│              AWS VPC (10.0.0.0/16)          │
│                                              │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │ TestMesh Cluster │  │  Your Services  │ │
│  │   (10.0.1.0/24)  │──│  (10.0.2.0/24)  │ │
│  └──────────────────┘  └─────────────────┘ │
│                                              │
│  Security Groups:                            │
│  - Allow 10.0.1.0/24 → 10.0.2.0/24          │
└─────────────────────────────────────────────┘
```

**Configuration**:
```yaml
# Flows can access services directly
- id: query_db
  action: database_query
  config:
    host: 10.0.2.50  # Private IP
    port: 5432
```

### Option 2: VPC Peering

```
┌────────────────────┐       ┌────────────────────┐
│  TestMesh VPC      │       │  Services VPC      │
│  (10.0.0.0/16)     │◄─────►│  (10.1.0.0/16)     │
│                    │ Peer  │                    │
│  ┌──────────────┐ │       │ ┌──────────────┐  │
│  │   TestMesh   │ │       │ │   Database   │  │
│  └──────────────┘ │       │ └──────────────┘  │
└────────────────────┘       └────────────────────┘
```

**AWS VPC Peering**:
```bash
# Create peering connection
aws ec2 create-vpc-peering-connection \
  --vpc-id vpc-testmesh \
  --peer-vpc-id vpc-services

# Update route tables
aws ec2 create-route \
  --route-table-id rtb-testmesh \
  --destination-cidr-block 10.1.0.0/16 \
  --vpc-peering-connection-id pcx-12345
```

### Option 3: Private Link / Service Endpoint

```
┌────────────────────┐       ┌────────────────────┐
│  TestMesh VPC      │       │  Services VPC      │
│                    │       │                    │
│  ┌──────────────┐ │       │ ┌──────────────┐  │
│  │   TestMesh   │─┼───────┼→│ NLB Endpoint │  │
│  └──────────────┘ │PrivateLink │            │  │
└────────────────────┘       │ └──────┬───────┘  │
                              │        │          │
                              │    ┌───▼──────┐  │
                              │    │ Services │  │
                              │    └──────────┘  │
                              └────────────────────┘
```

**AWS PrivateLink**:
```yaml
# Service exposure
apiVersion: v1
kind: Service
metadata:
  name: internal-api
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-internal: "true"
spec:
  type: LoadBalancer
  ports:
  - port: 443
```

### Option 4: VPN Connection

```
┌────────────────────┐       ┌────────────────────┐
│  Cloud (TestMesh)  │       │  On-Premise        │
│                    │       │                    │
│  ┌──────────────┐ │       │ ┌──────────────┐  │
│  │   TestMesh   │─┼───────┼→│  VPN Gateway │  │
│  └──────────────┘ │  VPN  │ └──────┬───────┘  │
└────────────────────┘       │        │          │
                              │    ┌───▼──────┐  │
                              │    │ Database │  │
                              │    │  Kafka   │  │
                              │    └──────────┘  │
                              └────────────────────┘
```

**Site-to-Site VPN**:
```bash
# AWS VPN
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --customer-gateway-id cgw-12345 \
  --vpn-gateway-id vgw-67890
```

### Option 5: Service Mesh (Advanced)

```
┌─────────────────────────────────────────────┐
│           Istio Service Mesh                 │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ TestMesh │──│  Envoy   │──│ Internal │  │
│  │  Pods    │  │  Proxy   │  │ Services │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  mTLS + Policy + Observability              │
└─────────────────────────────────────────────┘
```

---

## 4. Service Access Configuration

### Database Access

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-credentials
  namespace: testmesh
type: Opaque
stringData:
  staging-postgres: |
    host: staging-db.internal.company.com
    port: 5432
    database: app_db
    username: testmesh_user
    password: <encrypted>
    ssl_mode: require

  prod-postgres: |
    host: prod-db.internal.company.com
    port: 5432
    database: app_db
    username: testmesh_readonly
    password: <encrypted>
    ssl_mode: require
    read_only: true
```

**Flow Configuration**:
```yaml
# flows/staging/db-test.yaml
name: Database Test
environment: staging

steps:
  - id: query_users
    action: database_query
    config:
      connection: "${env.DATABASE_URL}"  # Injected by agent
      query: |
        SELECT id, email, created_at
        FROM users
        WHERE created_at > NOW() - INTERVAL '1 day'
    output:
      user_count: result.rows.length
```

### Kafka Access

```yaml
# Agent configuration
services:
  kafka:
    brokers:
      - kafka-1.internal:9092
      - kafka-2.internal:9092
    security_protocol: SASL_SSL
    sasl_mechanism: PLAIN
    sasl_username: testmesh
    sasl_password: <from-secret>
    ssl_ca_location: /etc/kafka/ca-cert.pem
```

**Flow Configuration**:
```yaml
- id: produce_message
  action: kafka_produce
  config:
    broker: "${env.KAFKA_BROKERS}"  # Resolved by agent
    topic: test.events
    key: "test-key"
    value:
      event_type: test
      timestamp: "${timestamp}"
```

### Internal API Access

```yaml
# Service Discovery via Kubernetes DNS
- id: call_internal_api
  action: http_request
  config:
    url: "http://user-service.production.svc.cluster.local/api/users"
    headers:
      Authorization: "Bearer ${env.INTERNAL_API_TOKEN}"
```

---

## 5. Multi-Environment Setup

### Environment-Specific Agents

```yaml
# environments/dev.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-config
  namespace: testmesh-dev
data:
  config.yaml: |
    agent:
      name: dev-agent
      tags:
        environment: dev
      services:
        postgres:
          host: dev-postgres.internal
          port: 5432
        kafka:
          brokers: [dev-kafka:9092]
        api_base_url: http://dev-api.internal

---
# environments/staging.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-config
  namespace: testmesh-staging
data:
  config.yaml: |
    agent:
      name: staging-agent
      tags:
        environment: staging
      services:
        postgres:
          host: staging-postgres.internal
          port: 5432
        kafka:
          brokers: [staging-kafka-1:9092, staging-kafka-2:9092]
        api_base_url: https://staging-api.internal

---
# environments/prod.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-config
  namespace: testmesh-prod
data:
  config.yaml: |
    agent:
      name: prod-agent
      tags:
        environment: prod
      services:
        postgres:
          host: prod-postgres.internal
          port: 5432
          read_only: true  # Safety measure
        kafka:
          brokers: [prod-kafka-1:9092, prod-kafka-2:9092, prod-kafka-3:9092]
        api_base_url: https://api.company.com
```

### Flow Targeting

```yaml
# flows/user-registration.yaml
name: User Registration Test

# Target specific environment
target:
  agent_tags:
    environment: staging  # Run on staging agent

steps:
  - id: create_user
    action: http_request
    config:
      url: "${env.API_BASE_URL}/users"  # Resolved to staging URL
```

```bash
# CLI: Run on specific environment
testmesh run flows/user-registration.yaml --agent-tag environment:staging

# CLI: Run on specific agent
testmesh run flows/user-registration.yaml --agent staging-agent

# CLI: Run on multiple environments in parallel
testmesh run flows/smoke-test.yaml --agent-tag environment:staging,prod
```

---

## 6. Scheduled Execution

### Cron-based Scheduling

```yaml
# schedules/nightly-tests.yaml
apiVersion: testmesh.io/v1
kind: Schedule
metadata:
  name: nightly-regression
spec:
  # Cron expression (UTC)
  schedule: "0 2 * * *"  # 2 AM daily

  # Target flows
  flows:
    - tag: regression

  # Target agents
  agent_tags:
    environment: staging

  # Execution settings
  parallel: 5
  timeout: 3600  # 1 hour
  retry_failed: true

  # Notifications
  notifications:
    on_failure:
      - type: slack
        channel: "#test-failures"
      - type: email
        recipients: ["team@company.com"]
    on_success:
      - type: slack
        channel: "#test-results"
```

```bash
# CLI: Create schedule
testmesh schedule create nightly-tests.yaml

# CLI: List schedules
testmesh schedule list

# CLI: Manual trigger
testmesh schedule trigger nightly-regression
```

### Kubernetes CronJob

```yaml
# k8s/cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: testmesh-nightly-tests
  namespace: testmesh
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: testmesh-cli
            image: testmesh/cli:1.0.0
            command:
            - testmesh
            - run
            - --tag
            - regression
            - --env
            - staging
            env:
            - name: TESTMESH_API_URL
              value: "http://testmesh-api:5016"
            - name: TESTMESH_API_KEY
              valueFrom:
                secretKeyRef:
                  name: testmesh-api-key
                  key: key
          restartPolicy: OnFailure
```

---

## 7. CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run E2E Tests on TestMesh Cloud
        env:
          TESTMESH_API_URL: ${{ secrets.TESTMESH_API_URL }}
          TESTMESH_API_KEY: ${{ secrets.TESTMESH_API_KEY }}
        run: |
          # Install CLI
          curl -sSL https://get.testmesh.io | bash

          # Push flows to cloud
          testmesh push flows/

          # Trigger execution on cloud agents
          testmesh run \
            --tag smoke \
            --agent-tag environment:staging \
            --wait \
            --reporter github

      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: .testmesh/results/
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test

e2e-tests:
  stage: test
  image: testmesh/cli:1.0.0
  script:
    - testmesh push flows/
    - testmesh run --tag smoke --agent-tag environment:staging --wait
  artifacts:
    when: always
    paths:
      - .testmesh/results/
    reports:
      junit: .testmesh/results/junit.xml
  only:
    - branches
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        TESTMESH_API_URL = credentials('testmesh-api-url')
        TESTMESH_API_KEY = credentials('testmesh-api-key')
    }

    stages {
        stage('Run E2E Tests') {
            steps {
                sh '''
                    testmesh push flows/
                    testmesh run \
                        --tag regression \
                        --agent-tag environment:staging \
                        --wait \
                        --reporter junit > results.xml
                '''
            }
        }
    }

    post {
        always {
            junit 'results.xml'
            archiveArtifacts artifacts: '.testmesh/results/**'
        }
    }
}
```

---

## 8. Cloud Provider Examples

### AWS Deployment

```bash
# Create EKS cluster
eksctl create cluster \
  --name testmesh \
  --region us-east-1 \
  --nodegroup-name standard \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 5 \
  --managed

# Deploy TestMesh
helm repo add testmesh https://charts.testmesh.io
helm install testmesh testmesh/testmesh \
  --namespace testmesh \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.hostname=testmesh.company.com \
  --set postgresql.enabled=true \
  --set redis.enabled=true

# Configure VPC access
aws ec2 authorize-security-group-ingress \
  --group-id sg-testmesh \
  --source-group sg-internal-services \
  --protocol all
```

### GCP Deployment

```bash
# Create GKE cluster
gcloud container clusters create testmesh \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type n1-standard-2 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 5

# Deploy TestMesh
helm install testmesh testmesh/testmesh \
  --namespace testmesh \
  --create-namespace \
  --set cloud.provider=gcp

# Configure VPC peering
gcloud compute networks peerings create testmesh-to-services \
  --network testmesh-vpc \
  --peer-network services-vpc
```

### Azure Deployment

```bash
# Create AKS cluster
az aks create \
  --resource-group testmesh \
  --name testmesh \
  --node-count 3 \
  --node-vm-size Standard_D2s_v3 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 5

# Deploy TestMesh
helm install testmesh testmesh/testmesh \
  --namespace testmesh \
  --create-namespace \
  --set cloud.provider=azure

# Configure VNet peering
az network vnet peering create \
  --name testmesh-to-services \
  --resource-group testmesh \
  --vnet-name testmesh-vnet \
  --remote-vnet services-vnet \
  --allow-vnet-access
```

---

## 9. Security Best Practices

### 1. Network Segmentation

```yaml
# Restrict runner network access
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: testmesh-runner-egress
spec:
  podSelector:
    matchLabels:
      app: testmesh-runner
  policyTypes:
  - Egress
  egress:
  # Allow only specific services
  - to:
    - podSelector:
        matchLabels:
          access: testmesh-allowed
  # Deny all other traffic
  - to: []
```

### 2. Secret Management

```bash
# Use external secrets operator
kubectl apply -f https://raw.githubusercontent.com/external-secrets/external-secrets/main/deploy/crds/bundle.yaml

# AWS Secrets Manager integration
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
spec:
  secretStoreRef:
    name: aws-secrets-manager
  target:
    name: database-credentials
  data:
  - secretKey: password
    remoteRef:
      key: testmesh/database/password
```

### 3. Read-Only Database Access

```sql
-- Create read-only user for production tests
CREATE USER testmesh_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE production_db TO testmesh_readonly;
GRANT USAGE ON SCHEMA public TO testmesh_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO testmesh_readonly;

-- Ensure read-only
ALTER USER testmesh_readonly SET default_transaction_read_only = on;
```

### 4. Rate Limiting

```yaml
# Agent rate limiting
agent:
  rate_limits:
    requests_per_second: 100
    concurrent_connections: 50

    per_action:
      http_request: 100/s
      database_query: 50/s
      kafka_produce: 1000/s
```

### 5. Audit Logging

```yaml
# Enable comprehensive audit logs
logging:
  audit:
    enabled: true
    log_all_requests: true
    log_request_bodies: true  # Be careful with sensitive data
    log_response_bodies: false
    retention_days: 90

    # Send to external logging
    destinations:
      - type: elasticsearch
        endpoint: https://logs.company.com
      - type: s3
        bucket: testmesh-audit-logs
```

---

## 10. Monitoring & Observability

### Prometheus Metrics

```yaml
# ServiceMonitor for Prometheus
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: testmesh
spec:
  selector:
    matchLabels:
      app: testmesh-api
  endpoints:
  - port: metrics
    interval: 30s
```

**Key Metrics**:
```promql
# Execution success rate
rate(testmesh_executions_total{status="success"}[5m])
/ rate(testmesh_executions_total[5m])

# Average execution time
rate(testmesh_execution_duration_seconds_sum[5m])
/ rate(testmesh_execution_duration_seconds_count[5m])

# Agent health
up{job="testmesh-agent"}
```

### Distributed Tracing

```yaml
# Jaeger integration
tracing:
  enabled: true
  provider: jaeger
  endpoint: http://jaeger-collector:14268/api/traces
  sample_rate: 0.1  # 10% sampling
```

---

## 11. Deployment with Helm

```bash
# Add Helm repository
helm repo add testmesh https://charts.testmesh.io
helm repo update

# Install with custom values
helm install testmesh testmesh/testmesh \
  --namespace testmesh \
  --create-namespace \
  --values values.yaml
```

```yaml
# values.yaml
global:
  domain: testmesh.company.com

api:
  replicas: 3
  resources:
    requests:
      memory: 256Mi
      cpu: 200m
    limits:
      memory: 512Mi
      cpu: 500m

runner:
  replicas: 5
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70

postgresql:
  enabled: true
  primary:
    persistence:
      size: 100Gi

redis:
  enabled: true
  master:
    persistence:
      size: 10Gi

# Redis Streams uses same Redis instance as caching
# No separate deployment needed

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - hosts:
      - testmesh.company.com
      secretName: testmesh-tls

# Agent configuration
agents:
  - name: staging-agent
    environment: staging
    tags:
      region: us-east-1
    resources:
      memory: 2Gi
      cpu: 2

  - name: prod-agent
    environment: production
    tags:
      region: us-west-2
    resources:
      memory: 4Gi
      cpu: 4
```

---

## Summary

### Deployment Options

1. **Single Cluster**: TestMesh + Services in same cluster (simplest)
2. **Distributed Agents**: Control plane + agents in private networks (most flexible)
3. **Hybrid**: Control plane in cloud + on-premise agents

### Network Access

1. **Same VPC**: Direct access via private IPs
2. **VPC Peering**: Connect different VPCs
3. **PrivateLink**: Secure service exposure
4. **VPN**: Connect cloud to on-premise
5. **Service Mesh**: Advanced traffic management

### Best Practices

✅ Deploy agents close to services being tested
✅ Use environment-specific configurations
✅ Implement network policies and security groups
✅ Use read-only database users for production
✅ Enable audit logging and monitoring
✅ Rotate credentials regularly
✅ Use secrets management (Vault, AWS Secrets Manager)
✅ Implement rate limiting
✅ Set up alerting for failed tests
✅ Use CI/CD for automated test execution

## Next Steps

1. **Deploy control plane**: `helm install testmesh testmesh/testmesh`
2. **Deploy agents**: In each environment/network
3. **Configure networking**: VPC peering, security groups
4. **Set up secrets**: Database credentials, API keys
5. **Create schedules**: Automated test execution
6. **Integrate CI/CD**: Run tests on every deployment
