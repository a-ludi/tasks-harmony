#!/usr/bin/env bash
# scripts/deploy-staging.sh
#
# Manual staging deploy — mirrors deploy and deploy-sync jobs in .github/workflows/cd.yml.
# NOTE: Keep this file in sync with .github/workflows/cd.yml when changing deploy logic.
#
# Usage: ./scripts/deploy-staging.sh [--fresh | --from-prod]
#   --fresh      Reset staging to empty data before deploying
#   --from-prod  Seed staging with production blob data before deploying
#   (no flag)    Deploy code, preserve existing staging data

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Overridable in tests
ENV_FILE="${DEPLOY_STAGING_ENV_FILE:-$PROJECT_ROOT/.env.staging}"

# --- Parse arguments ---
SEED_MODE=""
for arg in "$@"; do
  case "$arg" in
    --fresh)     SEED_MODE="fresh" ;;
    --from-prod) SEED_MODE="from-prod" ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

# --- Load config ---
if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Error: %s not found.\nCopy env.staging.example to .env.staging and fill in the values.\n' \
    "$ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

# --- Read secret from keyring ---
if ! command -v secret-tool &>/dev/null; then
  printf 'Error: secret-tool is not installed. Install libsecret-tools (Debian/Ubuntu) or libsecret (Fedora).\n' >&2
  exit 1
fi
BASIC_AUTH_PASSWORD=$(secret-tool lookup service tasks-harmony-staging key basic-auth-password 2>/dev/null || true)
if [[ -z "$BASIC_AUTH_PASSWORD" ]]; then
  printf 'Error: basic auth password not found in keyring.\nRun: secret-tool store --label='"'"'Tasks Harmony Staging basic auth'"'"' service tasks-harmony-staging key basic-auth-password\n' >&2
  exit 1
fi

ssh_exec() {
  ssh "$SSH_USER@$SSH_HOST" "$@"
}

# --- 1. Build frontend ---
echo "==> Building frontend..."
cd "$PROJECT_ROOT"
VITE_SYNC_URL="$STAGING_SYNC_URL" bun run build

# --- 2. Deploy frontend ---
echo "==> Deploying frontend..."
rsync -avz --delete \
  -e ssh \
  dist/ \
  "$SSH_USER@$SSH_HOST:$STAGING_WEB_ROOT/"

# --- 3. Deploy sync server ---
echo "==> Deploying sync server..."
rsync -avz -e ssh docker-compose.yml \
  "$SSH_USER@$SSH_HOST:$STAGING_SERVER_DIR/"
rsync -avz -e ssh sync-server/ \
  "$SSH_USER@$SSH_HOST:$STAGING_SERVER_DIR/sync-server/"

# --- 4. Write server .env ---
echo "==> Writing server .env..."
printf 'COMPOSE_PROJECT_NAME=tasks-harmony-staging\nSOCKET_DIR=%s\n' \
  "$STAGING_SOCKET_DIR" \
  | ssh_exec "cat > $STAGING_SERVER_DIR/.env"

# --- 5. Render nginx config ---
echo "==> Rendering nginx config..."
perl -pe "s|__SOCKET_DIR__|$STAGING_SOCKET_DIR|g" \
  "$PROJECT_ROOT/nginx/sync-location.conf.template" \
  | ssh_exec "cat > $STAGING_NGINX_INCLUDE_DIR/sync-location.conf"

# --- 6. Update basic auth ---
echo "==> Updating basic auth..."
printf '%s' "$BASIC_AUTH_PASSWORD" \
  | ssh_exec "htpasswd -ci $STAGING_BASIC_AUTH_FILE staging"

# --- 7. Seed data ---
if [[ "$SEED_MODE" == "fresh" ]]; then
  echo "==> Resetting staging data (fresh)..."
  ssh_exec "sudo systemctl stop tasks-harmony-sync-staging || true"
  ssh_exec "docker volume rm tasks-harmony-staging_sync-data 2>/dev/null || true"
  ssh_exec "sudo systemctl start tasks-harmony-sync-staging"
elif [[ "$SEED_MODE" == "from-prod" ]]; then
  echo "==> Seeding staging data from production..."
  local_prod_blob_dir_q=$(printf '%q' "$PROD_BLOB_DIR")
  ssh_exec "sudo systemctl stop tasks-harmony-sync-staging || true"
  ssh_exec "docker volume rm tasks-harmony-staging_sync-data 2>/dev/null || true"
  ssh_exec "docker run --rm -v tasks-harmony-staging_sync-data:/data -v ${local_prod_blob_dir_q}:/source:ro alpine sh -c 'cp -r /source/. /data/'"
  ssh_exec "sudo systemctl start tasks-harmony-sync-staging"
fi

# --- 8. Restart service (code-only deploy) + reload nginx ---
if [[ -z "$SEED_MODE" ]]; then
  echo "==> Restarting sync service..."
  ssh_exec "sudo systemctl restart tasks-harmony-sync-staging"
fi

echo "==> Reloading nginx..."
ssh_exec "sudo nginx -s reload"

echo ""
echo "Staging deploy complete."
