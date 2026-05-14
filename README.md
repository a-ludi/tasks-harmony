# Tasks Harmony

A Django web app where users earn XP for completing recurring chores. Chores are defined with RRULE recurrence schedules; completing them on time builds streaks that boost XP rewards. The UI updates in-place via HTMX without full page reloads, and a service worker caches the dashboard for offline viewing.

## Features

- **Recurring chores** — define any recurrence via RRULE (daily, weekly, custom)
- **Four card states** — Overdue / Due / Completed / Upcoming, sorted by urgency
- **XP & streaks** — earn XP per completion; consecutive on-time completions multiply rewards, missed windows decay the bonus
- **Completion questions** — attach optional per-chore questions (text, integer, boolean, enum) answered at completion time
- **HTMX card updates** — completing a chore swaps only the card HTML; no page reload
- **Offline support** — service worker caches the dashboard; Complete buttons disable automatically when offline

## Tech stack

- Python 3.12, Django 5, PostgreSQL 16
- HTMX 1.9, Bootstrap 5, Alpine.js
- django-recurrence + python-dateutil for RRULE handling
- WhiteNoise for static files
- pytest + pytest-django + Playwright for unit, integration, and E2E tests

## Running locally

**Prerequisites:** Docker and Docker Compose.

```bash
# Start the database
docker compose up -d db

# Apply migrations and start the dev server
docker compose run --rm web python manage.py migrate
docker compose up web
```

The app is available at `http://localhost:8000`.

To create a superuser:

```bash
docker compose run --rm web python manage.py createsuperuser
```

## Running tests

```bash
# All tests (unit + integration + E2E)
docker compose run --rm web pytest tests/ -v

# E2E only
docker compose run --rm web pytest tests/e2e/ -v

# Unit + integration only
docker compose run --rm web pytest tests/unit/ tests/integration/ -v
```

## Project structure

```
accounts/   — user registration, login, profile (XP total)
chores/     — chore definitions, instances, completions, recurrence logic
xp/         — XP formula and settings model
config/     — Django settings, URL routing
templates/  — HTML templates (base, dashboard, chore form, modal)
static/     — service worker, PWA manifest
tests/
  unit/         — pure logic (XP formula, recurrence status, answer validation)
  integration/  — view + DB tests via Django test client
  e2e/          — full browser tests via Playwright
```

## License

MIT — see [LICENSE](LICENSE).
