.PHONY: help up down restart ps logs build rebuild deploy \
        logs-python logs-node logs-frontend logs-caddy \
        rebuild-python rebuild-node rebuild-frontend \
        shell-python shell-node \
        dev-python dev-node dev-frontend

help: ## Show this list
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Start everything (no rebuild)
	docker compose up -d

down: ## Stop everything
	docker compose down

restart: ## Restart everything (no rebuild)
	docker compose restart

ps: ## Show container status
	docker compose ps

logs: ## Follow logs for everything
	docker compose logs -f -t

logs-python: ## Follow just the Python DSP service's logs
	docker compose logs -f -t python-service

logs-node: ## Follow just the Node API's logs
	docker compose logs -f -t node-api

logs-frontend: ## Follow just the frontend's logs
	docker compose logs -f -t frontend

logs-caddy: ## Follow just Caddy's logs (cert issuance, routing)
	docker compose logs -f -t caddy

build: ## Rebuild every image, then start (normal deploy — picks up code + .env changes)
	docker compose up -d --build

deploy: ## Pull latest git + full rebuild + restart — the one command for "ship it"
	git pull
	docker compose up -d --build

rebuild-python: ## Force a clean rebuild of just the Python service (no cache — use after Dockerfile/requirements changes)
	docker compose build --no-cache python-service
	docker compose up -d

rebuild-node: ## Force a clean rebuild of just the Node API
	docker compose build --no-cache node-api
	docker compose up -d

rebuild-frontend: ## Force a clean rebuild of just the frontend (needed after .env NEXT_PUBLIC_* changes)
	docker compose build --no-cache frontend
	docker compose up -d

shell-python: ## Open a shell inside the running Python container
	docker compose exec python-service bash

shell-node: ## Open a shell inside the running Node container
	docker compose exec node-api sh

# --- Local dev (no Docker) — one terminal tab each -------------------------
# The Python service MUST be on 8001, never bare `uvicorn app.main:app`
# (which defaults to 8000 and silently collides with Node — that collision
# has caused every "downloads html" / "Not Found" / "Cannot GET" bug this
# project has hit locally). These targets hardcode the right port so
# there's nothing to remember or get wrong.

dev-python: ## Run the Python DSP service locally on the correct port (8001)
	cd backend && venv312/bin/python -m uvicorn app.main:app --port 8001 --reload

dev-node: ## Run the Node API locally (port 8000, auto-restarts on file changes)
	cd backend-node && npm run dev

dev-frontend: ## Run the Next.js frontend locally (port 3000)
	cd frontend && npm run dev
