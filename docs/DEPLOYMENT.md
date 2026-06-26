# Deployment

This document covers the one-time server setup and the GitHub configuration required before the CD pipeline can deploy the sync server.

## Architecture

```
nginx (existing, any user)
  rate limiting zones in http block  ← one-time manual addition
  location /sync/*  →  unix:$SOCKET_DIR/sync.sock

Docker Compose  (isolated bridge network)
  sync   — Bun HTTP server  (reads SYNC_APP_SECRET, SYNC_BLOB_DIR from env)
  redis  — no exposed ports, AOF persistence

Volumes
  sync-data   /data in sync container  (encrypted blobs)
  redis-data                            (Redis AOF)
```

The sync container and nginx share the Unix socket via a bind mount. The socket is created by the Bun server on startup with mode `0666` so nginx can write to it without a shared group.

---

## Prerequisites

- Docker and docker-compose ≥ 1.17.1 installed on the server
- A `deploy` user with SSH access and the narrow sudoers entries below
- An existing nginx installation serving the app

---

## One-time server setup

Run these steps once on the server before triggering the first CD deploy. Set the three path variables to match what you will configure in GitHub (see [GitHub configuration](#github-configuration) below).

```bash
SERVER_DIR=/opt/tasks-harmony
SOCKET_DIR=/var/run/tasks-harmony
NGINX_INCLUDE_DIR=/etc/nginx/tasks-harmony

# 1. Create deployment directories
sudo mkdir -p "$SERVER_DIR"
sudo chown deploy:deploy "$SERVER_DIR"
sudo mkdir -p "$SOCKET_DIR"

# 2. Render and install the systemd unit
#    (replaces __SERVER_DIR__ placeholder with the actual path)
perl -pe 's|__SERVER_DIR__|$ENV{SERVER_DIR}|g' sync-server/tasks-harmony-sync.service \
  | sudo tee /etc/systemd/system/tasks-harmony-sync.service
sudo systemctl daemon-reload
sudo systemctl enable tasks-harmony-sync

# 3. Create the nginx include directory
sudo mkdir -p "$NGINX_INCLUDE_DIR"
```

### nginx — rate limiting zones

Add these two lines to the `http {}` block in your main nginx config (e.g. `/etc/nginx/nginx.conf`). They must live in the `http` block, not inside a `server` block.

```nginx
limit_req_zone $binary_remote_addr zone=sync_challenge:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=sync_write:10m rate=30r/m;
```

Then add an `include` directive inside your `server {}` block so nginx picks up the rendered location config written by CD:

```nginx
include /etc/nginx/tasks-harmony/*.conf;
```

Reload nginx after making these changes:

```bash
sudo nginx -s reload
```

The CD pipeline renders `nginx/sync-location.conf.template` (substituting `__SOCKET_DIR__`) and writes the result to `$NGINX_INCLUDE_DIR/sync-location.conf` on each deploy.

### Sudoers

Grant the `deploy` user the narrow privileges the CD pipeline needs:

```
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart tasks-harmony-sync
deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
```

Add via `sudo visudo`.

---

## GitHub configuration

### Variables (`vars.*`)

| Variable | Example | Purpose |
|---|---|---|
| `SSH_PATH` | `/var/www/tasks-harmony` | nginx document root — where the static `dist/` files are served from |
| `SERVER_DIR` | `/opt/tasks-harmony` | Sync server deployment directory — **must not be inside `SSH_PATH`** (see note below) |
| `SOCKET_DIR` | `/var/run/tasks-harmony` | Directory holding the Unix socket |
| `NGINX_INCLUDE_DIR` | `/etc/nginx/tasks-harmony` | Directory for nginx include files |
| `SYNC_URL` | `https://tasks-harmony.example.com` | Public base URL — baked into the client bundle as `VITE_SYNC_URL` |
| `SSH_HOST` | `tasks-harmony.example.com` | Server hostname for SSH/rsync |
| `SSH_USER` | `deploy` | SSH user on the server |

> **`SERVER_DIR` must not be inside `SSH_PATH`.** CD writes `.env` (containing `SYNC_APP_SECRET`) to `$SERVER_DIR/.env`. If `SERVER_DIR` were inside the web root, that file would be publicly accessible.

### Secrets (`secrets.*`)

| Secret | How to generate | Purpose |
|---|---|---|
| `SYNC_APP_SECRET` | `openssl rand -base64 32` | Pre-shared secret for HMAC challenge-response; written to server `.env` and baked into the client bundle |

---

## What CD does automatically

After the one-time setup above, each push to `main` triggers the CD pipeline, which:

1. Writes `.env` to `$SERVER_DIR` on the server:
   ```
   SYNC_APP_SECRET=<secret>
   SOCKET_DIR=<socket-dir>
   ```
2. Rsyncs `docker-compose.yml` and `sync-server/` to `$SERVER_DIR`.
3. Renders `nginx/sync-location.conf.template` → `$NGINX_INCLUDE_DIR/sync-location.conf`.
4. Runs `sudo systemctl restart tasks-harmony-sync && sudo nginx -s reload`.

Docker Compose reads `.env` from its working directory automatically, so no extra wiring is needed.

---

## Verifying the deployment

After the first successful CD run:

```bash
# Check the service is running
sudo systemctl status tasks-harmony-sync

# Check the socket exists and is writable
ls -la /var/run/tasks-harmony/sync.sock

# Hit the challenge endpoint through nginx
curl https://tasks-harmony.example.com/sync/challenge
# Expected: {"nonce":"<64-char hex>"}
```
