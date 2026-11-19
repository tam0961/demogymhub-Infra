#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DIR="${BACKUP_DIR:-$HOME/gymhub-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
OUT="$DIR/gymhub-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f "$COMPOSE_FILE" --env-file .env exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$OUT.tmp"
test -s "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
find "$DIR" -name 'gymhub-*.dump' -mtime +"$KEEP_DAYS" -delete
if [ -n "${BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null || { echo "BACKUP_REMOTE set but rclone not installed" >&2; exit 1; }
  rclone copy "$OUT" "$BACKUP_REMOTE"
fi
echo "backup ok: $OUT"
