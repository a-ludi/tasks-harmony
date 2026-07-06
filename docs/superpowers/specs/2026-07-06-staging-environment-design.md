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

## Server-Side Layout (one-time manual setup)

Three additions to the existing server:

**Staging server directory** (e.g. `~/tasks-harmony-staging/`): holds `docker-compose.yml` and `.env`. Uses different Docker volume names (`sync-data-staging`, `redis-data-staging`) and a different socket path than production.

**Staging web root** (e.g. `/var/www/tasks-harmony-staging/`): static frontend files rsync'd here on each deploy.

**Staging systemd service** `tasks-harmony-sync-staging`: mirrors `tasks-harmony-sync` but points at the staging server directory and staging socket.

**nginx vhost** for the staging subdomain:
- HTTP Basic Auth protecting the entire vhost
- Static files served from the staging web root
- Sync location block rendered from the same `nginx/sync-location.conf.template`, substituting the staging `SOCKET_DIR`
- Rate limiting zones shared with production (already defined in the http block)

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
5. **Write server `.env`** — pipe `SOCKET_DIR=$STAGING_SOCKET_DIR` to `$STAGING_SERVER_DIR/.env` over SSH
6. **Render nginx config** — same perl substitution used in CD; pipe to `$STAGING_NGINX_INCLUDE_DIR/sync-location.conf`
7. **Update basic auth** — regenerate `.htpasswd-staging` on the server via `htpasswd -cb` piped over SSH
8. **Seed data** (conditional on flag):
   - `--fresh`: stop service → remove `sync-data-staging` Docker volume → restart service
   - `--from-prod`: stop service → remove `sync-data-staging` volume → repopulate it by running a temporary Alpine container that bind-mounts `$PROD_BLOB_DIR` and copies it in → restart service
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

## Out of Scope

Server-side one-time setup (creating the systemd service, nginx vhost, web root directory) is manual and not scripted. The deploy script assumes this setup is already in place.
