#!/usr/bin/env bash
set -euo pipefail

# ── PR Reviewer — Contabo deployment script ──────────────────────────────────
# Usage: bash scripts/deploy.sh
# Run from the project root on your VPS.

COMPOSE_FILE="docker-compose.yml"

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Building and restarting containers..."
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "==> Waiting for health check..."
sleep 5
if docker compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
  echo "ERROR: app container is unhealthy. Showing logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 app
  exit 1
fi

echo "==> Pruning unused images..."
docker image prune -f

echo "==> Done. Services:"
docker compose -f "$COMPOSE_FILE" ps
