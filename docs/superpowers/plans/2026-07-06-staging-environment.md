# Staging Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scripts/deploy-staging.sh` script that builds the frontend and deploys it plus the sync server to a staging subdomain on the production server, with HTTP Basic Auth, isolated data volumes, and optional data seeding from production.

**Architecture:** A self-contained bash script mirrors the deploy steps in `.github/workflows/cd.yml`, reading non-secret config from a git-ignored `.env.staging` file and the basic auth password from Gnome Keyring via `secret-tool`. The staging sync server runs as a separate systemd service with its own Docker volumes (isolated by `COMPOSE_PROJECT_NAME`). The `VITE_SYNC_URL` build-time variable is set from `.env.staging` so the staged frontend points at the staging sync endpoint.

**Tech Stack:** bash, rsync, ssh, perl (template rendering — already used in cd.yml), Docker Compose, systemd, htpasswd, secret-tool (libsecret), bun

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `scripts/deploy-staging.sh` | Create | The deploy script |
| `scripts/deploy-staging.test.ts` | Create | Tests for startup validation (env file, keyring, flags) |
| `env.staging.example` | Create | Committed template documenting all required variables |
| `.github/workflows/cd.yml` | Modify | Add sync-reminder comment to deploy and deploy-sync jobs |

**Note:** `.gitignore` already contains `.env.*` which covers `.env.staging` — no change needed.

---

## Task 1: Committed config template and CD sync-reminder

**Files:**
- Create: `env.staging.example`
- Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Create `env.staging.example`**

```bash
# env.staging.example
# Copy to .env.staging, fill in all values, and keep it out of git (.env.* is gitignored).

SSH_USER=
SSH_HOST=

# URL the frontend will call for sync — typically https://staging.DOMAIN/sync
STAGING_SYNC_URL=

# Paths on the server
STAGING_WEB_ROOT=/var/www/tasks-harmony-staging
STAGING_SERVER_DIR=/home/USER/tasks-harmony-staging
STAGING_SOCKET_DIR=/run/tasks-harmony-staging
STAGING_NGINX_INCLUDE_DIR=/etc/nginx/includes/staging
STAGING_BASIC_AUTH_FILE=/etc/nginx/.htpasswd-staging

# Path to the production blob directory — only needed for --from-prod
PROD_BLOB_DIR=/home/USER/tasks-harmony/data
```

- [ ] **Step 2: Add sync-reminder comment to the two deploy jobs in `.github/workflows/cd.yml`**

In `cd.yml`, add a comment to the `deploy` job (around line 34) and to the `deploy-sync` job (around line 60). Each comment should read:

```yaml
    # NOTE: This job's deploy logic is mirrored in scripts/deploy-staging.sh.
    # Keep both files in sync when changing deploy steps.
```

Insert the comment as the first line inside each job's `steps:` block, before the first step.

- [ ] **Step 3: Commit**

```bash
git add env.staging.example .github/workflows/cd.yml
git commit -m "feat(staging): add env template and CD sync-reminder"
```

---

## Task 2: Deploy script — startup validation

**Files:**
- Create: `scripts/deploy-staging.sh` (validation + arg parsing only)
- Create: `scripts/deploy-staging.test.ts`

- [ ] **Step 1: Write failing tests**

Create `scripts/deploy-staging.test.ts`:

```typescript
import { test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

let tmpDir: string;
const projectRoot = join(import.meta.dir, "..");

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "deploy-staging-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

function run(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("bash", ["scripts/deploy-staging.sh", ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function validEnvFile(): string {
  const path = join(tmpDir, ".env.staging");
  writeFileSync(
    path,
    [
      "SSH_USER=test",
      "SSH_HOST=test.example.com",
      "STAGING_SYNC_URL=https://staging.example.com/sync",
      "STAGING_WEB_ROOT=/var/www/tasks-harmony-staging",
      "STAGING_SERVER_DIR=/home/test/tasks-harmony-staging",
      "STAGING_SOCKET_DIR=/run/tasks-harmony-staging",
      "STAGING_NGINX_INCLUDE_DIR=/etc/nginx/includes/staging",
      "STAGING_BASIC_AUTH_FILE=/etc/nginx/.htpasswd-staging",
    ].join("\n")
  );
  return path;
}

function fakeSecretTool(output: string): string {
  const binDir = join(tmpDir, "bin");
  mkdirSync(binDir);
  const tool = join(binDir, "secret-tool");
  writeFileSync(tool, `#!/bin/bash\necho '${output}'\n`);
  chmodSync(tool, 0o755);
  return binDir;
}

test("exits 1 with helpful message when .env.staging is missing", () => {
  const result = run([], {
    DEPLOY_STAGING_ENV_FILE: join(tmpDir, ".env.staging"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(".env.staging");
});

test("exits 1 with helpful message when keyring entry is missing", () => {
  const envFile = validEnvFile();
  const binDir = fakeSecretTool("");

  const result = run([], {
    DEPLOY_STAGING_ENV_FILE: envFile,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("basic auth password not found");
});

test("exits 1 with helpful message on unknown argument", () => {
  const result = run(["--unknown-flag"], {
    DEPLOY_STAGING_ENV_FILE: join(tmpDir, ".env.staging"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unknown argument");
});
```

- [ ] **Step 2: Run tests — expect all three to fail**

```bash
bun test scripts/deploy-staging.test.ts
```

Expected: 3 tests fail because `scripts/deploy-staging.sh` does not exist yet.

- [ ] **Step 3: Create `scripts/deploy-staging.sh` with validation only**

```bash
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
BASIC_AUTH_PASSWORD=$(secret-tool lookup service tasks-harmony-staging key basic-auth-password 2>/dev/null || true)
if [[ -z "$BASIC_AUTH_PASSWORD" ]]; then
  printf 'Error: basic auth password not found in keyring.\nRun: secret-tool store --label='"'"'Tasks Harmony Staging basic auth'"'"' service tasks-harmony-staging key basic-auth-password\n' >&2
  exit 1
fi

echo "Config loaded. (Deploy logic not yet implemented.)"
```

Then make it executable:

```bash
chmod +x scripts/deploy-staging.sh
```

- [ ] **Step 4: Run tests — expect all three to pass**

```bash
bun test scripts/deploy-staging.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy-staging.sh scripts/deploy-staging.test.ts
git commit -m "feat(staging): add deploy script validation and tests"
```

---

## Task 3: Deploy script — complete deployment logic

**Files:**
- Modify: `scripts/deploy-staging.sh`

Replace the `echo "Config loaded..."` placeholder line at the bottom with the full deployment pipeline. The complete file should be:

- [ ] **Step 1: Replace the placeholder with the deployment body**

Open `scripts/deploy-staging.sh`. Remove the last line (`echo "Config loaded..."`) and append:

```bash
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
  ssh_exec "sudo systemctl stop tasks-harmony-sync-staging || true \
    && docker volume rm tasks-harmony-staging_sync-data 2>/dev/null || true \
    && sudo systemctl start tasks-harmony-sync-staging"
elif [[ "$SEED_MODE" == "from-prod" ]]; then
  echo "==> Seeding staging data from production..."
  ssh_exec "sudo systemctl stop tasks-harmony-sync-staging || true \
    && docker volume rm tasks-harmony-staging_sync-data 2>/dev/null || true \
    && docker run --rm \
         -v tasks-harmony-staging_sync-data:/data \
         -v $PROD_BLOB_DIR:/source:ro \
         alpine sh -c 'cp -r /source/. /data/' \
    && sudo systemctl start tasks-harmony-sync-staging"
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
```

- [ ] **Step 2: Run existing tests — expect all three still pass**

```bash
bun test scripts/deploy-staging.test.ts
```

Expected: all 3 tests pass (the new code only runs after the validation checks).

- [ ] **Step 3: Syntax check the script**

```bash
bash -n scripts/deploy-staging.sh
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-staging.sh
git commit -m "feat(staging): complete deploy script implementation"
```
