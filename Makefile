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

# The middle step below clears containers left renamed by a half-finished
# recreate. Compose's recreate flow renames the outgoing container to
# <shortid>_<name>, starts the replacement, then removes the renamed one.
# If a deploy dies between those steps the renamed container survives, and
# every later recreate of that service fails with "Conflict. The container
# name ... is already in use" — so the deploy is wedged permanently, not
# just for the run that died. That is what broke the deploy on the
# DSP-overhaul merge (Actions run 31): build-check was fully green and the
# SSH step died on python-service alone.
#
# `docker compose up` can't clear these itself. Compose tracks containers
# by label and a renamed leftover keeps all of its labels, so it reads as a
# live container of that service rather than an orphan — which is why
# --remove-orphans is not the fix here either. The <hex>_ name prefix is
# the one thing that marks them, and no compose-managed container is ever
# named that way, so matching on it cannot catch a container we still want.
#
# Comments live out here rather than inside the recipe because Make echoes
# every recipe line, comments included, into the deploy log.
deploy: ## Pull latest git + full rebuild + restart — the one command for "ship it"
	git pull
	docker ps -a --format '{{.Names}}' | grep -E '^[0-9a-f]{8,}_' | xargs -r docker rm -f || true
	docker compose up -d --build
	# Caddy's config is a bind-mounted file (./Caddyfile), not part of its
	# image — `docker compose up -d` only recreates a container when the
	# compose service definition itself changes, so editing just the
	# Caddyfile's *content* (same mount, same image) leaves Caddy running
	# on its old in-memory config until something explicitly tells it to
	# reload. Restart is instant and safe here: certs live in the
	# caddy_data volume, not in the container, so this never re-triggers
	# Let's Encrypt issuance.
	docker compose restart caddy

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
