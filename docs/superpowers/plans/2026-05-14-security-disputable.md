# Security Fixes — Disputable Items

These findings from the security audit require a design decision or involve trade-offs that
need your input before implementation. They are ordered roughly by severity × effort.

---

## 1. Move docker-compose secrets to `.env` (High)

**Finding:** `docker-compose.yml` commits `SECRET_KEY: changeme-in-production` and
`POSTGRES_PASSWORD: tasks_harmony` in plaintext. Anyone who clones the repo and runs
`docker compose up` gets a known secret key.

**Current state:** settings.py now raises `ImproperlyConfigured` if `SECRET_KEY` equals the
dev default when `DEBUG=False`, so a production deploy with the default will fail loudly.
The risk is limited to dev environments.

**Proposed fix:** Create a `.env` file (gitignored) and switch docker-compose.yml to
`${SECRET_KEY}` / `${POSTGRES_PASSWORD}`. Provide `.env.example` with placeholders.

**Trade-off:** Every developer needs to create their own `.env` file from `.env.example`
after cloning. This is standard practice but adds a setup step.

**Your call:** Yes

---

## 2. Service worker caches authenticated pages across users (Medium)

**Finding:** The fetch handler in `static/js/service-worker.js` caches every successful
GET response unconditionally, including the dashboard (`/`) and profile page. If a
different user logs in on the same browser, they could see the previous user's cached
content when offline.

**Proposed fix:** Skip caching for navigation requests (HTML responses) and only cache
static assets (JS, CSS, images). Clear the cache on logout.

**Trade-off:** Reduces offline capability — the dashboard won't be available offline.
That was a design goal of the PWA.

**Alternative:** Cache navigation requests keyed by user (e.g., include a user ID in
the cache key via a custom response header). More complex.

**Your call:** accept the risk for now but keep the finding documented.

---

## 3. No Content Security Policy (Medium)

**Finding:** No CSP header is set. All pages include inline `<script>` blocks and
`hx-on::` event attributes, which are vectors if an XSS is ever found. CDN resources
now have SRI but no CSP enforcement.

**Proposed fix:** Add a CSP header via Django middleware or web server config. Inline
scripts require `'unsafe-inline'` or nonce-based CSP (complex with HTMX's `hx-on`).

**Trade-off:** Nonce-based CSP with HTMX is non-trivial; `'unsafe-inline'` weakens the
benefit. The practical gain is limited unless a real XSS vector exists.

**Your call:** defer but keep documented

---

## 4. ReDoS via user-supplied `regex_pattern` on Question model (Medium)

**Finding:** `Question.regex_pattern` is stored verbatim and fed to `re.fullmatch`
at completion time. A chore creator can store a catastrophic-backtracking pattern.
Self-DOS only in the current single-user model.

**Proposed fix:** Validate the pattern on save using `re.compile()` with a timeout
(Python 3.11+ `re` doesn't have built-in timeout; requires `regex` package or
running in a subprocess). Simpler: reject patterns with known catastrophic constructs,
or add a max-length and max-complexity check.

**Your call:** Add validation with thread-based timeout

---

## 5. Missing password validators (Medium) — partially fixed

**Already implemented:** Added `CommonPasswordValidator` and `NumericPasswordValidator`.

**Remaining:** Django's default minimum length is 8. Increasing to 12 is recommended by
NIST SP 800-63B. The `MinimumLengthValidator` accepts an `OPTIONS` dict:

```python
{"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
 "OPTIONS": {"min_length": 12}}
```

**Trade-off:** Breaks existing short passwords at next change. New registrations only.

**Your call:** Raise minimum to 12. Also integrate protection against known weak passwords.

---

## 6. Django admin at default `/admin/` path (Low)

**Finding:** Admin is accessible at the well-known `/admin/` URL, making it a trivial
brute-force target.

**Proposed fix:** Move admin to a non-guessable path (e.g., `/staff-panel/`).

**Your call:** add rate limiting instead

---

## 7. Dockerfile runs as root (Medium)

**Finding:** No `USER` directive — the gunicorn process runs as root inside the
container. Also includes Playwright/Chromium in the runtime image (dev tooling).

**Proposed fix:** Add a non-root user, split into build/runtime stages, exclude
Playwright from production image.

**Trade-off:** Multi-stage Dockerfile is more complex; may need to adjust file
permissions.

**Your call:** Harden Dockerfile but move to the end of queue because it requires my attention.

---

## 8. Email change without re-authentication (Low)

**Finding:** `PersonalInfoForm` lets any logged-in user change their email address
without re-entering their password. If the app ever sends password-reset links by email,
a session hijacker can change the email and lock out the real user.

**Proposed fix:** Require password confirmation to change email, or send a verification
link to the new address.

**Trade-off:** Friction for legitimate users. Risk is currently zero (no password-reset
by email exists).

**Your call:** defer until password reset is needed

---

## 9. Rate limiting on login and registration (Low)

**Finding:** No rate limiting on `/accounts/login/` or `/accounts/register/`. Brute
force and username enumeration are possible.

**Proposed fix:** Install `django-axes` or `django-ratelimit` and configure thresholds.

**Your call:** Implement rate limiting

---

## 10. docker-compose.override.yml enables DEBUG by default (Medium)

**Finding:** `docker-compose.override.yml` is auto-merged by Docker Compose, setting
`DEBUG=True`. An operator running `docker compose up` in production would silently get
debug mode and source code bind-mounted.

**Proposed fix:** Rename to `docker-compose.dev.yml` (requires `-f` flag) or add a
prominent README note. Remove the bind-mount from override and make it explicit.

**Your call:** leave as-is and revisit when deployment is integrated

---

_Implemented (non-disputable) fixes are in commit `b66261d`:_
- _SECRET_KEY: raises ImproperlyConfigured if dev default used in production_
- _ALLOWED_HOSTS: defaults to `[]` in production, `["*"]` in dev_
- _HTTPS settings: SESSION_COOKIE_SECURE, CSRF_COOKIE_SECURE, HSTS, etc. (prod only)_
- _Password validators: added CommonPasswordValidator and NumericPasswordValidator_
- _CDN SRI hashes: all four CDN resources now have integrity= attributes_
- _Alpine.js: pinned from @3.x.x to @3.15.12_
- _.gitignore: added .env, .env.*, staticfiles/, media/_
