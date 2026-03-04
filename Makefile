.PHONY: help dev up down build clean logs test api-test web-test api-shell web-shell db-shell

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
NC     := \033[0m # No Color

help: ## Show this help message
	@echo '$(GREEN)TestMesh Development Commands$(NC)'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'

dev: up ## Start development environment (alias for up)

up: ## Start all services
	@echo "$(GREEN)Starting TestMesh development environment...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "  Web:  http://localhost:3000"
	@echo "  API:  http://localhost:5016"
	@echo "  DB:   localhost:5432"

down: ## Stop all services
	@echo "$(YELLOW)Stopping TestMesh services...$(NC)"
	docker-compose down

build: ## Rebuild all services
	@echo "$(GREEN)Building TestMesh services...$(NC)"
	docker-compose build

clean: ## Stop services and remove volumes
	@echo "$(YELLOW)Cleaning up TestMesh environment...$(NC)"
	docker-compose down -v
	rm -rf api/tmp api/bin

logs: ## Tail logs from all services
	docker-compose logs -f

logs-api: ## Tail API logs
	docker-compose logs -f api

logs-web: ## Tail Web logs
	docker-compose logs -f web

test: api-test web-test ## Run all tests

api-test: ## Run API tests
	@echo "$(GREEN)Running API tests...$(NC)"
	cd api && go test ./... -v

web-test: ## Run Web tests
	@echo "$(GREEN)Running Web tests...$(NC)"
	cd web && npm test

api-shell: ## Open shell in API container
	docker-compose exec api sh

web-shell: ## Open shell in Web container
	docker-compose exec web sh

db-shell: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U testmesh -d testmesh

db-migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	cd api && go run cmd/migrate/main.go up

db-reset: ## Reset database
	@echo "$(YELLOW)Resetting database...$(NC)"
	docker-compose exec postgres psql -U testmesh -c "DROP DATABASE IF EXISTS testmesh;"
	docker-compose exec postgres psql -U testmesh -c "CREATE DATABASE testmesh;"
	@make db-migrate

restart: down up ## Restart all services

status: ## Show status of services
	docker-compose ps

docs-dev: ## Start documentation site
	@echo "$(GREEN)Starting documentation site on http://localhost:3001$(NC)"
	cd docs-site && npm run dev

docs-build: ## Build documentation site
	@echo "$(GREEN)Building documentation site...$(NC)"
	cd docs-site && npm run build

docs-install: ## Install documentation dependencies
	@echo "$(GREEN)Installing documentation dependencies...$(NC)"
	cd docs-site && npm install
