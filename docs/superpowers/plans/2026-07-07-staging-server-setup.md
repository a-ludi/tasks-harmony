# Staging Server Setup Runbook

One-time manual setup on the production server. Work through each checkbox in order. The deploy script (`scripts/deploy-staging.sh`) assumes all of these are complete before it is first run.

---

## Before you start — information to gather

Fill these in before SSHing in. You'll need them in several steps.

| Variable | Value |
|----------|-------|
| `SSH_USER` | the deploy user on the server |
| `SSH_HOST` | the server hostname / IP |
| `STAGING_DOMAIN` | the staging subdomain (e.g. `staging.tasks-harmony.example.com`) |
| `PROD_DOMAIN` | the existing production domain |
| `STAGING_SERVER_DIR` | absolute path for the staging docker-compose directory (e.g. `/home/$SSH_USER/tasks-harmony-staging`) |
| `STAGING_WEB_ROOT` | absolute path for static frontend files (e.g. `/var/www/tasks-harmony-staging`) |
| `STAGING_SOCKET_DIR` | absolute path for the Unix socket (e.g. `/run/tasks-harmony-staging`) |
| SSL cert path | copy from the production vhost (e.g. `/etc/letsencrypt/live/$PROD_DOMAIN/fullchain.pem`) |
| SSL key path | copy from the production vhost (e.g. `/etc/letsencrypt/live/$PROD_DOMAIN/privkey.pem`) |

---

## Step 1 — DNS record

Do this at your DNS provider before touching the server. nginx configuration only works once the subdomain resolves.

- [ ] Add an A record (or CNAME pointing to `$PROD_DOMAIN`) for `$STAGING_DOMAIN` pointing to the same server IP as production.
- [ ] Verify it resolves: `dig +short $STAGING_DOMAIN`

---

## Step 2 — SSL certificate

The staging subdomain needs a certificate. The simplest approach is to expand the existing Let's Encrypt certificate.

- [ ] SSH into the server: `ssh $SSH_USER@$SSH_HOST`
- [ ] Expand the existing cert to cover the staging subdomain:

```bash
sudo certbot certonly --nginx \
  -d $PROD_DOMAIN \
  -d $STAGING_DOMAIN
```

If you use a wildcard cert (`*.example.com`) this step is already done — skip it.

---

## Step 3 — Install prerequisites

- [ ] Check `apache2-utils` is installed (needed for `htpasswd`):

```bash
which htpasswd || sudo apt-get install -y apache2-utils
```

- [ ] Verify Docker Compose plugin is available:

```bash
docker compose version
```

Expected: `Docker Compose version v2.x.x`. If missing: `sudo apt-get install -y docker-compose-plugin`.

---

## Step 4 — Verify nginx rate-limiting zones

The sync location config uses **four** rate-limiting zones. Three are documented in `nginx/sync-location.conf.template`; `sync_catchall` is used but not listed there. All four must be present in the nginx `http` block (they were added for production).

- [ ] Check all four zones exist:

```bash
grep -r "limit_req_zone" /etc/nginx/
```

Expected output must contain all four zone names:

```
zone=sync_challenge
zone=sync_session
zone=sync_write
zone=sync_catchall
```

If `sync_catchall` is missing, add it to the same file as the other three:

```nginx
limit_req_zone $binary_remote_addr zone=sync_catchall:10m rate=60r/m;
```

Then run `sudo nginx -t && sudo nginx -s reload`.

---

## Step 5 — Create directories

Run these on the server:

```bash
# Static frontend files
sudo mkdir -p $STAGING_WEB_ROOT
sudo chown $USER:$USER $STAGING_WEB_ROOT

# Docker Compose directory for the staging sync server
mkdir -p $STAGING_SERVER_DIR

# nginx include directory for the rendered sync location block
sudo mkdir -p /etc/nginx/includes/staging

# Socket directory — lives in /run (tmpfs), so declare it via tmpfiles.d
# so it is recreated automatically after every reboot
echo "d $STAGING_SOCKET_DIR 0755 $USER $USER -" \
  | sudo tee /etc/tmpfiles.d/tasks-harmony-staging.conf
sudo systemd-tmpfiles --create

# Verify the socket dir exists
ls -ld $STAGING_SOCKET_DIR
```

---

## Step 6 — Create the systemd service

- [ ] Create the service file. Replace `$STAGING_SERVER_DIR` with the actual absolute path:

```bash
sudo tee /etc/systemd/system/tasks-harmony-sync-staging.service > /dev/null <<EOF
[Unit]
Description=Tasks Harmony Sync Server (Staging)
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=$STAGING_SERVER_DIR
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
```

- [ ] Reload systemd and enable the service (do **not** start it yet — the first deploy does that):

```bash
sudo systemctl daemon-reload
sudo systemctl enable tasks-harmony-sync-staging
```

- [ ] Verify it is enabled but not yet running:

```bash
sudo systemctl status tasks-harmony-sync-staging
```

Expected: `enabled; preset: …` and `inactive (dead)`.

---

## Step 7 — Create the nginx vhost

- [ ] Create the vhost file. Replace all placeholder values with the real ones:

```bash
sudo tee /etc/nginx/sites-available/tasks-harmony-staging > /dev/null <<'EOF'
server {
    listen 80;
    server_name $STAGING_DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name $STAGING_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$PROD_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PROD_DOMAIN/privkey.pem;

    # Inherit any other SSL directives from your production vhost
    # (session cache, protocols, ciphers, HSTS, etc.)

    auth_basic "Tasks Harmony Staging";
    auth_basic_user_file /etc/nginx/.htpasswd-staging;

    root $STAGING_WEB_ROOT;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    include /etc/nginx/includes/staging/sync-location.conf;
}
EOF
```

> **Note:** The `include` line references `sync-location.conf`, which does not exist yet — it is written by the first deploy. Do **not** reload nginx until after the first deploy.

- [ ] Enable the vhost:

```bash
sudo ln -s /etc/nginx/sites-available/tasks-harmony-staging \
           /etc/nginx/sites-enabled/tasks-harmony-staging
```

- [ ] Syntax-check nginx (**do not reload yet**):

```bash
sudo nginx -t
```

Expected: `syntax is ok` and `test is successful`. If it fails with "cannot open include", that is expected — the include file will be created by the first deploy.

If nginx fails for any other reason, fix it before continuing.

---

## Step 8 — Store basic auth password in Gnome Keyring

Run this on your **local machine** (not the server):

- [ ] Choose a strong password for the staging subdomain.
- [ ] Store it in the Gnome Keyring:

```bash
secret-tool store --label="Tasks Harmony Staging basic auth" \
  service tasks-harmony-staging key basic-auth-password
```

Enter the password when prompted.

- [ ] Verify it was stored:

```bash
secret-tool lookup service tasks-harmony-staging key basic-auth-password
```

Expected: the password is printed.

---

## Step 9 — Create `.env.staging` on your local machine

- [ ] Copy the example file:

```bash
cp env.staging.example .env.staging
```

- [ ] Fill in all values. The file is git-ignored so it stays local:

```bash
SSH_USER=<value>
SSH_HOST=<value>
STAGING_SYNC_URL=https://$STAGING_DOMAIN/sync
STAGING_WEB_ROOT=<value>
STAGING_SERVER_DIR=<value>
STAGING_SOCKET_DIR=<value>
STAGING_NGINX_INCLUDE_DIR=/etc/nginx/includes/staging
STAGING_BASIC_AUTH_FILE=/etc/nginx/.htpasswd-staging
PROD_BLOB_DIR=<path to production blob directory on the server>
```

---

## Step 10 — Run the first deploy

Once the implementation is merged and `scripts/deploy-staging.sh` exists:

- [ ] Run the first deploy with a clean slate:

```bash
./scripts/deploy-staging.sh --fresh
```

This will:
1. Build the frontend with `VITE_SYNC_URL` pointing to the staging endpoint
2. rsync the frontend and sync server to the server
3. Write the server `.env` and render the nginx config
4. Create the `.htpasswd-staging` file
5. Start the staging sync service
6. Reload nginx

- [ ] Verify nginx reloaded without errors (check output of the script and `sudo nginx -t` on the server).
- [ ] Open `https://$STAGING_DOMAIN` in a browser — you should see the Basic Auth prompt.

---

## Verification checklist

After the first deploy completes:

- [ ] `https://$STAGING_DOMAIN` shows a Basic Auth prompt
- [ ] Correct credentials grant access to the app
- [ ] Wrong credentials return 401
- [ ] The app loads and the sync endpoint responds: `curl -u staging:<password> https://$STAGING_DOMAIN/sync/challenge`
- [ ] `sudo systemctl status tasks-harmony-sync-staging` shows `active (running)`
- [ ] Production at `https://$PROD_DOMAIN` is unaffected
