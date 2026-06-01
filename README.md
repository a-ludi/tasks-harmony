# Tasks Harmony

A Django web app where users earn XP for completing recurring chores.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Background

Tasks Harmony is a personal chore tracker built around the idea that completing routine tasks consistently deserves recognition. Each chore is defined with an RRULE recurrence schedule (daily, weekly, or any custom pattern). Completing a chore on time builds a streak that multiplies the XP reward; missing a window lets the bonus decay.

The UI uses HTMX to swap individual chore cards in place without full page reloads. A service worker caches the dashboard for offline viewing, and all action buttons are automatically disabled when the browser goes offline.

**Tech stack:** Python 3.12, Django 5, PostgreSQL 16, HTMX 1.9, Bootstrap 5, Alpine.js, django-recurrence, WhiteNoise, pytest + Playwright.

## Install

**Prerequisites:** Docker and Docker Compose.

```bash
docker compose up -d db
docker compose run --rm web python manage.py migrate
docker compose up web
```

The app is available at `http://localhost:8000`.

To create an admin account:

```bash
docker compose run --rm web python manage.py createsuperuser
```

## Usage

Register an account, then use **+ New Chore** on the dashboard to create a chore. Each chore requires a name, an XP size (XS–XL), and a recurrence rule in RRULE format, for example:

```
DTSTART:20260101T000000Z
RRULE:FREQ=DAILY
```

Chore cards are sorted by urgency — Overdue → Due → Completed → Upcoming. Click **Complete** to record a completion; chores with attached questions open a modal first. XP is credited immediately and your streak counter updates.

### Running tests

```bash
# All tests (unit + integration + E2E)
docker compose run --rm web pytest tests/ -v

# E2E only
docker compose run --rm web pytest tests/e2e/ -v
```

## Contributing

Open an issue to report a bug or propose a feature. Pull requests are welcome — please include tests for any new behaviour and ensure the full suite passes (`pytest tests/ -v`) before submitting.

## License

[MIT](LICENSE) © Arne Ludwig
