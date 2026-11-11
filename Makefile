DEV  = docker compose -f docker-compose.dev.yml --env-file .env
PROD = docker compose -f docker-compose.prod.yml --env-file .env
WEB_PORT ?= 3002

.PHONY: web dev prod health down-dev down-prod logs-dev logs-prod check-env

check-env:
	@test -f .env || (echo ".env missing: cp .env.example .env" && exit 1)

web:
	docker run --rm -v "$(CURDIR)/../demogymhub-Frontend:/app" -w /app node:22-alpine sh -c "npm ci && npm run build"

dev: check-env web
	$(DEV) up -d --build
	@echo "dev up: web http://localhost:$(WEB_PORT)  api http://localhost:8082/api/health"

prod: check-env web
	$(PROD) pull --ignore-buildable || true
	$(PROD) build api
	$(PROD) run --rm migrate
	$(PROD) up -d
	@$(PROD) exec -T api sh -c 'test "$$APP_ENV" = production' || (echo "APP_ENV is not production" && exit 1)

health:
	@curl -fsS http://localhost:$(WEB_PORT)/api/health | grep -q '"status":"ok"' && echo "health ok" || (echo "health FAILED" && exit 1)

down-dev:
	$(DEV) down

down-prod:
	$(PROD) down

logs-dev:
	$(DEV) logs -f --tail=100 api

logs-prod:
	$(PROD) logs -f --tail=100 api
