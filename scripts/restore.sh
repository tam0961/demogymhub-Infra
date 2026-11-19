#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f "${1:-}" || { echo "usage: scripts/restore.sh <file.dump>" >&2; exit 1; }
set -a; . ./.env; set +a
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
read -r -p "Overwrite database $POSTGRES_DB from $1? type yes: " ok
test "$ok" = yes
docker compose -f "$COMPOSE_FILE" --env-file .env exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$1"
echo "restore ok"
