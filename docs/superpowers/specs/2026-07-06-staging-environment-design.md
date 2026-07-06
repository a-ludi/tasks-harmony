# Staging Environment Design

**Date:** 2026-07-06
**Status:** Approved

## Background

The sprint/security-fixes branch introduces significant sync-layer changes that may require multiple fix rounds before production is stable. A staging environment allows testing pre-push code on the real server infrastructure without risking the production deployment.

## Goals

- Deploy and test pre-GitHub code on a real server
- Keep staging private (HTTP Basic Auth)
- Support two data-seeding modes: start fresh or copy production blobs
- Trigger manually from the developer's local machine
- Reuse the existing server (same host, staging subdomain, separate socket)

## Non-Goals

- Automated staging deploys on push
- GitHub Actions involvement in staging deploys
- Separate staging server hardware

## One-Time Server Setup

These steps are performed once by hand on the server. The deploy script assumes all of them are complete.

### Prerequisites

- `apache2-utils` installed (provides `htpasswd`)
- Docker + Docker Compose plugin installed
- nginx with SSL already configured for the production domain (the staging vhost mirrors it)
- The SSH user has `sudo` rights for `systemctl` and `nginx -s reload` (same requirement as production)

### 1. Create directories

```bash
sudo mkdir -p /var/www/tasks-harmony-staging
sudo chown $USER:$USER /var/www/tasks-harmony-staging

mkdir -p ~/tasks-harmony-staging

sudo mkdir -p /etc/nginx/includes/staging

# Socket dir — recreated on each service start; must exist before first start.
# Add to /etc/tmpfiles.d/ so it survives reboots:
echo "d /run/tasks-harmony-staging 0755 $USER $USER -" \
  | sudo tee /etc/tmpfiles.d/tasks-harmony-staging.conf
sudo systemd-tmpfiles --create
```

### 2. Note on the server `.env`

The deploy script writes the full `.env` content (both `COMPOSE_PROJECT_NAME` and `SOCKET_DIR`) on every deploy, so no manual pre-seeding is needed. Docker Compose will name the volumes `tasks-harmony-staging_sync-data` and `tasks-harmony-staging_redis-data`, keeping them isolated from production.

### 3. Create the systemd service

Create `/etc/systemd/system/tasks-harmony-sync-staging.service`:

```ini
[Unit]
Description=Tasks Harmony Sync Server (Staging)
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/home/USER/tasks-harmony-staging
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Replace `USER` with the actual username. Then enable (but do not start yet — the first deploy will start it):

```bash
sudo systemctl daemon-reload
sudo systemctl enable tasks-harmony-sync-staging
```

### 4. Create the nginx vhost

Create `/etc/nginx/sites-available/tasks-harmony-staging` (adapt SSL paths to match the production vhost):

```nginx
server {
    listen 80;
    server_name staging.DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name staging.DOMAIN;

    # Mirror SSL config from the production vhost
    ssl_certificate     /path/to/cert;
    ssl_certificate_key /path/to/key;

    auth_basic "Tasks Harmony Staging";
    auth_basic_user_file /etc/nginx/.htpasswd-staging;

    root /var/www/tasks-harmony-staging;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    include /etc/nginx/includes/staging/sync-location.conf;
}
```

Enable and do a syntax check. Do **not** reload yet — `sync-location.conf` does not exist until after the first deploy:

```bash
sudo ln -s /etc/nginx/sites-available/tasks-harmony-staging \
           /etc/nginx/sites-enabled/tasks-harmony-staging
```

### 5. Store the basic auth password in Gnome Keyring

On the developer's local machine (not the server):

```bash
secret-tool store --label="Tasks Harmony Staging basic auth" \
  service tasks-harmony-staging key basic-auth-password
```

Enter the password when prompted. This is the password that will protect the staging subdomain.

### 6. Run the first deploy

With all of the above in place, run:

```bash
./scripts/deploy-staging.sh --fresh
```

This writes the nginx include file, creates `.htpasswd-staging`, starts the service, and reloads nginx. After this, the staging subdomain should be live.

## Configuration

### `.env.staging` (git-ignored, lives in project root)

Non-secret server config:

```
SSH_USER=
SSH_HOST=
STAGING_WEB_ROOT=/var/www/tasks-harmony-staging
STAGING_SERVER_DIR=/home/.../tasks-harmony-staging
STAGING_SOCKET_DIR=/run/tasks-harmony-staging
STAGING_NGINX_INCLUDE_DIR=/etc/nginx/includes/staging
STAGING_BASIC_AUTH_FILE=/etc/nginx/.htpasswd-staging
PROD_BLOB_DIR=/home/.../tasks-harmony/data
```

`PROD_BLOB_DIR` is only used with `--from-prod`.

### Gnome Keyring

One secret stored under fixed attributes:

```
service=tasks-harmony-staging
key=basic-auth-password
```

Read by the script via:

```bash
secret-tool lookup service tasks-harmony-staging key basic-auth-password
```

The `.htpasswd-staging` file is regenerated on every deploy from this value, so rotating the password requires only a keyring update and a redeploy.

## Deploy Script: `scripts/deploy-staging.sh`

### Usage

```
./scripts/deploy-staging.sh [--fresh | --from-prod]
```

No flag: deploy new code, leave existing staging data untouched.

### Steps

1. **Load config** — source `.env.staging`; read basic auth password from Gnome Keyring via `secret-tool`
2. **Build frontend** — `bun run build`
3. **Deploy frontend** — rsync `dist/` to `$STAGING_WEB_ROOT` via SSH
4. **Deploy sync server** — rsync `sync-server/` and `docker-compose.yml` to `$STAGING_SERVER_DIR`
5. **Write server `.env`** — pipe both `COMPOSE_PROJECT_NAME=tasks-harmony-staging` and `SOCKET_DIR=$STAGING_SOCKET_DIR` to `$STAGING_SERVER_DIR/.env` over SSH (overwrites the whole file; no manual pre-seeding needed)
6. **Render nginx config** — same perl substitution used in CD; pipe to `$STAGING_NGINX_INCLUDE_DIR/sync-location.conf`
7. **Update basic auth** — regenerate `.htpasswd-staging` on the server via `htpasswd -cb` piped over SSH
8. **Seed data** (conditional on flag):
   - `--fresh`: stop service → remove `tasks-harmony-staging_sync-data` Docker volume → restart service
   - `--from-prod`: stop service → remove `tasks-harmony-staging_sync-data` volume → repopulate it by running a temporary Alpine container that bind-mounts `$PROD_BLOB_DIR` and copies it in → restart service
9. **Reload nginx** — `sudo nginx -s reload` (service restart already done in step 8 for seeded deploys; for code-only deploys, also run `sudo systemctl restart tasks-harmony-sync-staging`)

### Sync Reminder

Both `scripts/deploy-staging.sh` and `.github/workflows/cd.yml` carry a comment reminding maintainers that the two files mirror each other's deploy logic and must be kept in sync when either is changed.

## Files Changed

| File | Change |
|------|--------|
| `scripts/deploy-staging.sh` | New — the deploy script |
| `.env.staging` | New — git-ignored config file (add to `.gitignore`) |
| `.github/workflows/cd.yml` | Add sync-reminder comment to deploy jobs |
| `nginx/sync-location.conf.template` | No change — reused as-is |
| `docker-compose.yml` | No change — reused as-is by staging server dir |

