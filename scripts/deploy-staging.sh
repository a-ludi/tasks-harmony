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

echo "Config loaded. (Deploy logic not yet implemented.)"
