# Staging environment: same server, subdomain, manual local deploy

A staging environment is introduced to allow testing pre-release code (particularly the security-fixes sprint) on real server infrastructure without risking the production deployment.

## Why staging is needed

The sprint/security-fixes branch replaces the entire sync authentication layer with a post-quantum scheme. This is a deep architectural change that may require several fix rounds. The production deployment is the only existing server environment; any breakage affects real user data.

A staging environment provides a place to validate the new code end-to-end before the PR is merged.

## Key decisions

### Same physical server, staging subdomain

Staging runs on the same host as production (`staging.DOMAIN` vs `DOMAIN`), behind a separate nginx vhost with HTTP Basic Auth. Benefits:

- No extra cost or infrastructure to maintain
- Real server conditions (OS, Docker version, Redis, nginx)
- Simple: one SSH host to manage

Risk is low because staging is protected by Basic Auth and runs entirely isolated Docker volumes.

### Separate Unix socket and Docker Compose project

The staging sync server listens on a different Unix socket (`/run/tasks-harmony-staging/`) and uses a separate Compose project name (`tasks-harmony-staging`). This gives independent volumes (`tasks-harmony-staging_sync-data`, `tasks-harmony-staging_redis-data`) and prevents the staging and production containers from interfering.

### Manual deploy triggered from the developer's local machine

There is no CI/CD involvement in staging deployments. The developer runs `./scripts/deploy-staging.sh` locally. This keeps staging simple and avoids the round-trip overhead of pushing to GitHub just to test pre-production code.

### Two seeding modes: fresh and from-prod

`--fresh`: stops the service, drops the sync-data volume, restarts clean. Good for testing a new installation flow.

`--from-prod`: copies production blobs into the staging volume before starting. Good for testing migrations against real data without risking production.

No flag (default): deploys new code, leaves existing staging data in place. Good for iterative code fixes without losing test state.

### Basic Auth password stored in Gnome Keyring

The staging subdomain is protected by HTTP Basic Auth. The password lives in the developer's local Gnome Keyring (via `secret-tool`) rather than in any file, so it is never committed or transmitted as plaintext. The deploy script reads it at deploy time and regenerates `.htpasswd-staging` on the server.

## Files

| File | Purpose |
|------|---------|
| `scripts/deploy-staging.sh` | Deploy script — builds frontend, rsyncs to server, restarts service |
| `.env.staging` | Non-secret config (git-ignored): SSH host/user, paths, staging sync URL |
| `nginx/sync-location.conf.template` | Reused as-is by staging nginx vhost |
| `docker-compose.yml` | Reused as-is by the staging server directory |

## Considered alternatives

**Separate staging server:** Higher cost, more infrastructure to maintain. Unnecessary given the workload is single-user.

**GitHub Actions staging deploy on push:** Would require a separate workflow, secrets for staging credentials, and a push to trigger it. The manual script is faster and more flexible for pre-PR work.

**Docker-in-Docker on a local machine:** Does not test the real server environment (OS packages, nginx, systemd, file permissions). The whole point is to run on the target infrastructure.
