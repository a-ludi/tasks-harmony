# Tasks Harmony — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Django web app where users earn XP for completing recurring chores, with HTMX card updates and Phase 1 offline (view-only) support.

**Architecture:** Django 5 + PostgreSQL 16 with three apps (`accounts`, `xp`, `chores`); HTMX for partial card swaps; Bootstrap 5 for styling; service worker for Phase 1 offline caching. Phase 2 offline (Alpine.js optimistic UI + IndexedDB sync) is a separate plan.

**Tech Stack:** Python 3.12, Django 5.x, PostgreSQL 16, django-recurrence, python-dateutil, HTMX 1.x, Bootstrap 5, Alpine.js (included but dormant in Phase 1), pytest + pytest-django, Playwright

---

## File Map

Files created or modified per task:

| Task | Creates / Modifies |
|------|--------------------|
| 1 | `Dockerfile`, `docker-compose.yml`, `docker-compose.override.yml`, `requirements.txt`, `pytest.ini`, `config/settings.py`, `config/urls.py`, `config/wsgi.py`, `manage.py` |
| 2 | `xp/formulas.py`, `tests/unit/test_xp.py` |
| 3 | `xp/models.py`, `xp/migrations/0001_initial.py`, `xp/migrations/0002_standard_xp_settings.py`, `xp/admin.py`, `accounts/models.py`, `accounts/migrations/0001_initial.py` |
| 4 | `accounts/views.py`, `accounts/urls.py`, `accounts/forms.py`, `templates/base.html`, `templates/accounts/login.html`, `templates/accounts/register.html` |
| 5 | `chores/models.py` (ChoreDefinition, ChoreInstance), `chores/migrations/0001_initial.py`, `tests/integration/test_models.py` |
| 6 | `chores/models.py` (Question, QuestionChoice, ChoreCompletion, CompletionAnswer), `chores/migrations/0002_questions_completions.py` |
| 7 | `chores/recurrence.py`, `tests/unit/test_recurrence.py` |
| 8 | `chores/views.py` (dashboard), `chores/urls.py`, `templates/chores/dashboard.html`, `templates/chores/_chore_card.html`, `tests/integration/test_dashboard.py` |
| 9 | `chores/views.py` (complete), `templates/chores/_chore_card.html` (update), `tests/integration/test_completion.py` |
| 10 | `chores/answer_validators.py`, `tests/unit/test_answer_validation.py` |
| 11 | `chores/views.py` (question modal), `chores/forms.py`, `templates/chores/_question_modal.html`, `tests/integration/test_completion_questions.py` |
| 12 | `chores/views.py` (create/edit/deactivate), `chores/forms.py` (chore + inline question builder), `templates/chores/chore_form.html`, `tests/integration/test_chore_management.py` |
| 13 | `static/js/service-worker.js`, `static/manifest.json`, `templates/base.html` (update) |
| 14 | `tests/e2e/conftest.py`, `tests/e2e/test_dashboard.py`, `tests/e2e/test_chore_management.py`, `tests/e2e/test_offline.py` |

---

## Task 1: Project Scaffold

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`
- Create: `requirements.txt`
- Create: `pytest.ini`
- Create: `manage.py`
- Create: `config/__init__.py`, `config/settings.py`, `config/urls.py`, `config/wsgi.py`
- Create: `accounts/__init__.py`, `xp/__init__.py`, `chores/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
Django>=5.0,<6.0
psycopg2-binary>=2.9
gunicorn>=21.2
whitenoise>=6.6
django-recurrence>=1.11
python-dateutil>=2.9
pytest>=8.0
pytest-django>=4.8
pytest-playwright>=0.5
playwright>=1.44
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: tasks_harmony
      POSTGRES_USER: tasks_harmony
      POSTGRES_PASSWORD: tasks_harmony
    volumes:
      - postgres_data:/var/lib/postgresql/data

  web:
    build: .
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000
    environment:
      DATABASE_URL: postgres://tasks_harmony:tasks_harmony@db:5432/tasks_harmony
      SECRET_KEY: changeme-in-production
      DEBUG: "False"
    depends_on:
      - db
    ports:
      - "8000:8000"

volumes:
  postgres_data:
```

- [ ] **Step 4: Create docker-compose.override.yml**

```yaml
services:
  web:
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - .:/app
    environment:
      DEBUG: "True"
    ports:
      - "8000:8000"
```

- [ ] **Step 5: Create config/settings.py**

```python
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-not-for-production")
DEBUG = os.environ.get("DEBUG", "False") == "True"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    "recurrence",
    "accounts",
    "xp",
    "chores",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://tasks_harmony:tasks_harmony@localhost:5432/tasks_harmony")

import re
_match = re.match(r"postgres://(\w+):(\w+)@([\w.]+):(\d+)/(\w+)", DATABASE_URL)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _match.group(5),
        "USER": _match.group(1),
        "PASSWORD": _match.group(2),
        "HOST": _match.group(3),
        "PORT": _match.group(4),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

COMPLETION_TIMESTAMP_MAX_AGE_HOURS = int(os.environ.get("COMPLETION_TIMESTAMP_MAX_AGE_HOURS", "48"))
```

- [ ] **Step 6: Create config/urls.py**

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path("", include("chores.urls")),
]
```

- [ ] **Step 7: Create config/wsgi.py**

```python
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()
```

- [ ] **Step 8: Create manage.py**

```python
#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
```

- [ ] **Step 9: Create pytest.ini**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings
python_files = tests/**/test_*.py
python_classes = Test*
python_functions = test_*
```

- [ ] **Step 10: Create app __init__.py files and stub directories**

```bash
mkdir -p config accounts xp chores templates/accounts templates/chores static/js tests/unit tests/integration tests/e2e
touch config/__init__.py accounts/__init__.py xp/__init__.py chores/__init__.py
touch tests/__init__.py tests/unit/__init__.py tests/integration/__init__.py tests/e2e/__init__.py
```

- [ ] **Step 11: Install dependencies and verify Django setup**

Run: `pip install -r requirements.txt`

Run: `python manage.py check --deploy 2>&1 | grep -v "WARNINGS"` (within Docker or local venv with DB running)

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 12: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.override.yml requirements.txt pytest.ini manage.py config/ accounts/ xp/ chores/ templates/ static/ tests/
git commit -m "feat: project scaffold — Django 5 + Docker + pytest setup"
```

---

## Task 2: XP Formula

**Files:**
- Create: `xp/formulas.py`
- Create: `tests/unit/test_xp.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/unit/test_xp.py
import pytest
from decimal import Decimal
from dataclasses import dataclass

@dataclass
class FakeSettings:
    max_streak_multiplier: float
    streak_approach_rate: float
    decay_approach_rate: float
    decay_floor: float

STANDARD = FakeSettings(
    max_streak_multiplier=2.0,
    streak_approach_rate=0.1,
    decay_approach_rate=0.05,
    decay_floor=0.5,
)

def test_streak_zero_returns_base_xp():
    from xp.formulas import calculate_xp
    assert calculate_xp(Decimal("5"), 0, STANDARD) == 5

def test_streak_zero_non_integer_base_rounds():
    from xp.formulas import calculate_xp
    # base_xp=0.5 (XXS), streak=0 → round(0.5 * 1.0 * 1.0) = round(0.5) = 0 or 1 depending on Python rounding
    # round(0.5) in Python 3 = 0 (banker's rounding). Spec says "rounded to nearest integer".
    result = calculate_xp(Decimal("0.5"), 0, STANDARD)
    assert result == round(0.5)  # 0

def test_rising_streak_never_exceeds_max_mult_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("10")
    for streak in range(1, 1000):
        result = calculate_xp(base, streak, STANDARD)
        assert result <= STANDARD.max_streak_multiplier * float(base) + 1  # +1 for rounding

def test_high_streak_never_below_decay_floor_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("10")
    # At high streak, decay_mult approaches floor; streak_mult approaches max
    # net floor approaches max_mult * decay_floor * base
    result_high = calculate_xp(base, 500, STANDARD)
    net_floor = STANDARD.max_streak_multiplier * STANDARD.decay_floor * float(base)
    assert result_high >= net_floor - 1  # -1 for rounding

def test_infinite_streak_converges_to_max_mult_times_decay_floor_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("100")
    result = calculate_xp(base, 1000, STANDARD)
    expected = round(STANDARD.max_streak_multiplier * STANDARD.decay_floor * float(base))
    assert result == expected

def test_custom_settings_are_respected():
    from xp.formulas import calculate_xp
    custom = FakeSettings(
        max_streak_multiplier=3.0,
        streak_approach_rate=1.0,
        decay_approach_rate=1.0,
        decay_floor=0.25,
    )
    base = Decimal("10")
    result = calculate_xp(base, 1000, custom)
    expected = round(3.0 * 0.25 * 10)
    assert result == expected
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_xp.py -v`

Expected: `ImportError: cannot import name 'calculate_xp' from 'xp.formulas'`

- [ ] **Step 3: Implement calculate_xp**

```python
# xp/formulas.py
import math
from decimal import Decimal


def calculate_xp(base_xp: Decimal, streak_count: int, settings) -> int:
    streak_mult = (
        settings.max_streak_multiplier
        - (settings.max_streak_multiplier - 1) * math.exp(-settings.streak_approach_rate * streak_count)
    )
    decay_mult = (
        settings.decay_floor
        + (1 - settings.decay_floor) * math.exp(-settings.decay_approach_rate * streak_count)
    )
    return round(float(base_xp) * streak_mult * decay_mult)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_xp.py -v`

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add xp/formulas.py tests/unit/test_xp.py
git commit -m "feat: XP formula — streak + decay multipliers"
```

---

## Task 3: XPSettings, Accounts Models, and Data Migration

**Files:**
- Create: `xp/models.py`
- Create: `xp/migrations/0001_initial.py` (generated)
- Create: `xp/migrations/0002_standard_xp_settings.py`
- Create: `xp/admin.py`
- Create: `accounts/models.py`
- Create: `accounts/migrations/0001_initial.py` (generated)
- Create: `accounts/admin.py`

- [ ] **Step 1: Write XPSettings model**

```python
# xp/models.py
from django.db import models


class XPSettings(models.Model):
    name = models.CharField(max_length=100, unique=True)
    max_streak_multiplier = models.FloatField(default=2.0)
    streak_approach_rate = models.FloatField(default=0.1)
    decay_approach_rate = models.FloatField(default=0.05)
    decay_floor = models.FloatField(default=0.5)

    class Meta:
        verbose_name = "XP Settings"
        verbose_name_plural = "XP Settings"

    def __str__(self):
        return self.name
```

- [ ] **Step 2: Write Profile model**

```python
# accounts/models.py
from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    total_xp = models.IntegerField(default=0)
    xp_settings = models.ForeignKey(
        "xp.XPSettings",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Profile({self.user.username})"


@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if created:
        from xp.models import XPSettings
        standard = XPSettings.objects.filter(name="Standard").first()
        Profile.objects.create(user=instance, xp_settings=standard)
```

- [ ] **Step 3: Generate and apply migrations**

Run: `python manage.py makemigrations xp accounts`

Expected: Creates `xp/migrations/0001_initial.py` and `accounts/migrations/0001_initial.py`

Run: `python manage.py migrate`

- [ ] **Step 4: Write data migration for Standard XPSettings**

```python
# xp/migrations/0002_standard_xp_settings.py
from django.db import migrations


def create_standard_settings(apps, schema_editor):
    XPSettings = apps.get_model("xp", "XPSettings")
    XPSettings.objects.get_or_create(
        name="Standard",
        defaults={
            "max_streak_multiplier": 2.0,
            "streak_approach_rate": 0.1,
            "decay_approach_rate": 0.05,
            "decay_floor": 0.5,
        },
    )


def delete_standard_settings(apps, schema_editor):
    XPSettings = apps.get_model("xp", "XPSettings")
    XPSettings.objects.filter(name="Standard").delete()


class Migration(migrations.Migration):
    dependencies = [("xp", "0001_initial")]
    operations = [migrations.RunPython(create_standard_settings, delete_standard_settings)]
```

Run: `python manage.py migrate`

Expected: Applies data migration; Standard row exists in `xp_xpsettings` table.

- [ ] **Step 5: Register models in admin**

```python
# xp/admin.py
from django.contrib import admin
from .models import XPSettings

admin.site.register(XPSettings)
```

```python
# accounts/admin.py
from django.contrib import admin
from .models import Profile

admin.site.register(Profile)
```

- [ ] **Step 6: Write integration test for Standard row and Profile creation**

```python
# tests/integration/test_models.py
import pytest
from django.contrib.auth.models import User
from xp.models import XPSettings
from accounts.models import Profile


@pytest.mark.django_db
def test_standard_xp_settings_exists():
    assert XPSettings.objects.filter(name="Standard").exists()


@pytest.mark.django_db
def test_creating_user_creates_profile_with_standard_settings():
    user = User.objects.create_user(username="alice", password="pw")
    assert hasattr(user, "profile")
    assert user.profile.xp_settings.name == "Standard"
    assert user.profile.total_xp == 0
```

- [ ] **Step 7: Run integration tests**

Run: `pytest tests/integration/test_models.py -v`

Expected: `2 passed`

- [ ] **Step 8: Commit**

```bash
git add xp/ accounts/ tests/integration/test_models.py
git commit -m "feat: XPSettings + Profile models, Standard data migration"
```

---

## Task 4: Auth Views and Base Template

**Files:**
- Create: `accounts/views.py`
- Create: `accounts/urls.py`
- Create: `accounts/forms.py`
- Create: `templates/base.html`
- Create: `templates/accounts/login.html`
- Create: `templates/accounts/register.html`

- [ ] **Step 1: Create accounts forms and views**

```python
# accounts/forms.py
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User


class RegisterForm(UserCreationForm):
    class Meta:
        model = User
        fields = ["username", "password1", "password2"]
```

```python
# accounts/views.py
from django.contrib.auth import login
from django.contrib.auth.views import LoginView, LogoutView
from django.urls import reverse_lazy
from django.views.generic import CreateView
from .forms import RegisterForm


class RegisterView(CreateView):
    form_class = RegisterForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("dashboard")

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response
```

```python
# accounts/urls.py
from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from .views import RegisterView

urlpatterns = [
    path("login/", LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
]
```

- [ ] **Step 2: Create base template**

```html
<!-- templates/base.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}Tasks Harmony{% endblock %}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <link rel="manifest" href="/static/manifest.json">
  {% block extra_head %}{% endblock %}
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
    <div class="container">
      <a class="navbar-brand" href="/">Tasks Harmony</a>
      {% if user.is_authenticated %}
      <span class="navbar-text text-light me-3">XP: {{ user.profile.total_xp }}</span>
      <form method="post" action="{% url 'logout' %}" class="d-inline">
        {% csrf_token %}
        <button class="btn btn-outline-light btn-sm" type="submit">Logout</button>
      </form>
      {% else %}
      <a class="btn btn-outline-light btn-sm" href="{% url 'login' %}">Login</a>
      {% endif %}
    </div>
  </nav>
  <div class="container">
    {% for message in messages %}
    <div class="alert alert-{{ message.tags }} alert-dismissible fade show">{{ message }}</div>
    {% endfor %}
    {% block content %}{% endblock %}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  {% if 'serviceWorker' in navigator %}
  <script>
    navigator.serviceWorker.register('/static/js/service-worker.js');
  </script>
  {% endif %}
</body>
</html>
```

- [ ] **Step 3: Create auth templates**

```html
<!-- templates/accounts/login.html -->
{% extends "base.html" %}
{% block title %}Login{% endblock %}
{% block content %}
<div class="row justify-content-center">
  <div class="col-md-4">
    <h2>Login</h2>
    <form method="post">
      {% csrf_token %}
      {{ form.as_p }}
      <button class="btn btn-primary w-100" type="submit">Login</button>
    </form>
    <p class="mt-2 text-center"><a href="{% url 'register' %}">Create account</a></p>
  </div>
</div>
{% endblock %}
```

```html
<!-- templates/accounts/register.html -->
{% extends "base.html" %}
{% block title %}Register{% endblock %}
{% block content %}
<div class="row justify-content-center">
  <div class="col-md-4">
    <h2>Register</h2>
    <form method="post">
      {% csrf_token %}
      {{ form.as_p }}
      <button class="btn btn-primary w-100" type="submit">Create Account</button>
    </form>
    <p class="mt-2 text-center"><a href="{% url 'login' %}">Already have an account?</a></p>
  </div>
</div>
{% endblock %}
```

- [ ] **Step 4: Commit**

```bash
git add accounts/ templates/
git commit -m "feat: auth views and base template"
```

---

## Task 5: Chores Core Models

**Files:**
- Create: `chores/models.py` (ChoreDefinition, ChoreInstance)
- Create: `chores/migrations/0001_initial.py` (generated)

- [ ] **Step 1: Write ChoreDefinition and ChoreInstance**

```python
# chores/models.py
from decimal import Decimal
from django.contrib.auth.models import User
from django.db import models
import recurrence.fields


XP_SIZE_CHOICES = [
    ("XXS", "XXS (0.5)"),
    ("XS",  "XS (1)"),
    ("S",   "S (2)"),
    ("M",   "M (3)"),
    ("L",   "L (5)"),
    ("XL",  "XL (8)"),
    ("XXL", "XXL (13)"),
    ("XXXL","XXXL (21)"),
]

XP_SIZE_VALUES: dict[str, Decimal] = {
    "XXS": Decimal("0.5"),
    "XS":  Decimal("1"),
    "S":   Decimal("2"),
    "M":   Decimal("3"),
    "L":   Decimal("5"),
    "XL":  Decimal("8"),
    "XXL": Decimal("13"),
    "XXXL":Decimal("21"),
}


class ChoreDefinition(models.Model):
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chore_definitions")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    xp_size = models.CharField(max_length=4, choices=XP_SIZE_CHOICES, default="M")
    recurrence = recurrence.fields.RecurrenceField()

    def __str__(self):
        return self.name

    @property
    def base_xp(self) -> Decimal:
        return XP_SIZE_VALUES[self.xp_size]


class ChoreInstance(models.Model):
    definition = models.ForeignKey(ChoreDefinition, on_delete=models.CASCADE, related_name="instances")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chore_instances")
    streak_count = models.IntegerField(default=0)
    last_completed_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("definition", "owner")]

    def __str__(self):
        return f"{self.owner.username} / {self.definition.name}"
```

- [ ] **Step 2: Generate and apply migrations**

Run: `python manage.py makemigrations chores`

Run: `python manage.py migrate`

Expected: `chores/migrations/0001_initial.py` created, migration applied.

- [ ] **Step 3: Write integration test — create chore creates both definition and instance atomically**

```python
# tests/integration/test_models.py  (append to existing file)
import pytest
from django.contrib.auth.models import User
from django.db import transaction
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db
def test_creating_chore_definition_and_instance_in_transaction(django_user_model):
    user = django_user_model.objects.create_user(username="bob", password="pw")
    with transaction.atomic():
        defn = ChoreDefinition.objects.create(
            creator=user,
            name="Dishes",
            xp_size="S",
            recurrence="RRULE:FREQ=DAILY",
        )
        inst = ChoreInstance.objects.create(definition=defn, owner=user)
    assert ChoreDefinition.objects.filter(name="Dishes").exists()
    assert ChoreInstance.objects.filter(owner=user, definition=defn).exists()


@pytest.mark.django_db
def test_deactivating_instance_excludes_from_active_query(django_user_model):
    user = django_user_model.objects.create_user(username="carol", password="pw")
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="XS", recurrence="RRULE:FREQ=WEEKLY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    inst.is_active = False
    inst.save()
    assert not ChoreInstance.objects.filter(owner=user, is_active=True).exists()
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/integration/test_models.py -v`

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add chores/ tests/integration/test_models.py
git commit -m "feat: ChoreDefinition + ChoreInstance models"
```

---

## Task 6: Question and Completion Models

**Files:**
- Modify: `chores/models.py` (add Question, QuestionChoice, ChoreCompletion, CompletionAnswer)
- Create: `chores/migrations/0002_questions_completions.py` (generated)

- [ ] **Step 1: Append models to chores/models.py**

```python
# append to chores/models.py

class Question(models.Model):
    class QuestionType(models.TextChoices):
        TEXT = "TEXT", "Text"
        INTEGER = "INTEGER", "Integer"
        BOOLEAN = "BOOLEAN", "Boolean"
        ENUM = "ENUM", "Enum"

    definition = models.ForeignKey(ChoreDefinition, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField(default=0)
    text = models.CharField(max_length=500)
    required = models.BooleanField(default=True)
    type = models.CharField(max_length=10, choices=QuestionType.choices, default=QuestionType.TEXT)
    regex_pattern = models.CharField(max_length=200, blank=True)
    min_value = models.IntegerField(null=True, blank=True)
    max_value = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.definition.name} Q{self.order}: {self.text[:40]}"


class QuestionChoice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    label = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.label


class ChoreCompletion(models.Model):
    instance = models.ForeignKey(ChoreInstance, on_delete=models.CASCADE, related_name="completions")
    completed_at = models.DateTimeField()
    xp_earned = models.IntegerField()

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.instance} @ {self.completed_at}"


class CompletionAnswer(models.Model):
    completion = models.ForeignKey(ChoreCompletion, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="answers")
    text_value = models.TextField(blank=True, null=True)
    integer_value = models.IntegerField(null=True, blank=True)
    boolean_value = models.BooleanField(null=True, blank=True)
    enum_value = models.ForeignKey(
        QuestionChoice, on_delete=models.PROTECT, null=True, blank=True, related_name="answers"
    )

    def __str__(self):
        return f"Answer to Q{self.question_id}"
```

- [ ] **Step 2: Generate and apply migrations**

Run: `python manage.py makemigrations chores`

Run: `python manage.py migrate`

Expected: `chores/migrations/0002_questions_completions.py` created and applied.

- [ ] **Step 3: Commit**

```bash
git add chores/models.py chores/migrations/
git commit -m "feat: Question, QuestionChoice, ChoreCompletion, CompletionAnswer models"
```

---

## Task 7: Recurrence Window Logic

**Files:**
- Create: `chores/recurrence.py`
- Create: `tests/unit/test_recurrence.py`

The window logic uses `dateutil.rrule.rrulestr()` to parse the stored RRULE string and find the surrounding occurrences.

- [ ] **Step 1: Write failing tests**

```python
# tests/unit/test_recurrence.py
import pytest
from datetime import datetime, timezone, timedelta
from chores.recurrence import ChoreStatus, get_chore_status

# Helpers
def dt(year, month, day, hour=12, tz=timezone.utc):
    return datetime(year, month, day, hour, tzinfo=tz)

# A daily RRULE starting 2026-01-01
DAILY = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
# A weekly RRULE starting 2026-01-01 (Thursdays)
WEEKLY = "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY"


def test_status_due_within_window_no_completion():
    # now = Jan 1 noon, window = [Jan 1 00:00, Jan 2 00:00), no completion
    result = get_chore_status(DAILY, last_completed_at=None, now=dt(2026, 1, 1))
    assert result == ChoreStatus.DUE


def test_status_completed_when_last_completed_within_current_window():
    # completed Jan 1 at 06:00, now = Jan 1 noon
    completed = dt(2026, 1, 1, hour=6)
    now = dt(2026, 1, 1, hour=12)
    result = get_chore_status(DAILY, last_completed_at=completed, now=now)
    assert result == ChoreStatus.COMPLETED


def test_status_overdue_when_window_closed_without_completion():
    # now = Jan 2 noon, last_completed_at = Dec 31 (before Jan 1 window)
    old = dt(2025, 12, 31)
    now = dt(2026, 1, 2)
    result = get_chore_status(DAILY, last_completed_at=old, now=now)
    assert result == ChoreStatus.OVERDUE


def test_status_overdue_when_never_completed():
    now = dt(2026, 1, 2)
    result = get_chore_status(DAILY, last_completed_at=None, now=now)
    assert result == ChoreStatus.OVERDUE


def test_status_upcoming_when_before_first_occurrence():
    # RRULE starts Jan 10; now = Jan 5
    future_rule = "DTSTART:20260110T000000Z\nRRULE:FREQ=DAILY"
    now = dt(2026, 1, 5)
    result = get_chore_status(future_rule, last_completed_at=None, now=now)
    assert result == ChoreStatus.UPCOMING


def test_status_upcoming_after_completing_current_window():
    # Weekly chore, window = [Jan 1, Jan 8). Completed Jan 1. Now = Jan 1 noon.
    # → COMPLETED (we're still inside the window)
    completed = dt(2026, 1, 1, hour=1)
    now = dt(2026, 1, 1, hour=12)
    result = get_chore_status(WEEKLY, last_completed_at=completed, now=now)
    assert result == ChoreStatus.COMPLETED


def test_streak_break_detection_missed_previous_window():
    # Window [Jan 8, Jan 15) is current. last_completed_at = Jan 6 (before Jan 8 window).
    # Previous window [Jan 1, Jan 8) was missed.
    from chores.recurrence import detect_streak_break
    completed = dt(2026, 1, 6)
    now = dt(2026, 1, 10)
    assert detect_streak_break(WEEKLY, last_completed_at=completed, now=now) is True


def test_no_streak_break_when_completed_in_previous_window():
    # Window [Jan 8, Jan 15) is current. last_completed_at = Jan 3 (inside [Jan 1, Jan 8)).
    from chores.recurrence import detect_streak_break
    completed = dt(2026, 1, 3)
    now = dt(2026, 1, 10)
    assert detect_streak_break(WEEKLY, last_completed_at=completed, now=now) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_recurrence.py -v`

Expected: `ImportError: cannot import name 'ChoreStatus'`

- [ ] **Step 3: Implement recurrence.py**

```python
# chores/recurrence.py
import datetime
from enum import Enum
from dateutil.rrule import rrulestr


class ChoreStatus(Enum):
    OVERDUE = "overdue"
    DUE = "due"
    COMPLETED = "completed"
    UPCOMING = "upcoming"


def _parse_rule(rrule_string: str):
    return rrulestr(rrule_string, ignoretz=False)


def get_chore_status(
    rrule_string: str,
    last_completed_at: datetime.datetime | None,
    now: datetime.datetime,
) -> ChoreStatus:
    rule = _parse_rule(rrule_string)

    # Most recent occurrence on or before now
    window_start = rule.before(now, inc=True)
    if window_start is None:
        return ChoreStatus.UPCOMING

    # Next occurrence strictly after window_start
    window_end = rule.after(window_start, inc=False)

    # Completed in the current window?
    if last_completed_at is not None and last_completed_at >= window_start:
        return ChoreStatus.COMPLETED

    # Are we still inside the current window?
    if window_end is None or now < window_end:
        return ChoreStatus.DUE

    # Window has closed without completion
    return ChoreStatus.OVERDUE


def detect_streak_break(
    rrule_string: str,
    last_completed_at: datetime.datetime | None,
    now: datetime.datetime,
) -> bool:
    """Return True if the previous window closed without a completion (streak broken)."""
    if last_completed_at is None:
        return True

    rule = _parse_rule(rrule_string)

    # Current window start = most recent occurrence on or before now
    current_window_start = rule.before(now, inc=True)
    if current_window_start is None:
        return False

    # Previous window start = occurrence before current_window_start
    prev_window_start = rule.before(current_window_start, inc=False)
    if prev_window_start is None:
        # No previous window; streak not broken (this is the first window)
        return False

    # The previous window was [prev_window_start, current_window_start)
    # Streak is broken if last_completed_at fell before prev_window_start
    return last_completed_at < prev_window_start
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_recurrence.py -v`

Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add chores/recurrence.py tests/unit/test_recurrence.py
git commit -m "feat: recurrence window logic and streak break detection"
```

---

## Task 8: Dashboard View

**Files:**
- Create: `chores/views.py`
- Create: `chores/urls.py`
- Create: `chores/admin.py`
- Create: `templates/chores/dashboard.html`
- Create: `templates/chores/_chore_card.html`
- Create: `tests/integration/test_dashboard.py`

- [ ] **Step 1: Write failing integration tests**

```python
# tests/integration/test_dashboard.py
import pytest
from datetime import datetime, timezone, timedelta
from django.contrib.auth.models import User
from django.test import Client
from chores.models import ChoreDefinition, ChoreInstance


def make_chore(user, name, rrule, xp_size="M"):
    defn = ChoreDefinition.objects.create(
        creator=user, name=name, xp_size=xp_size, recurrence=rrule
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    return inst


@pytest.mark.django_db
def test_dashboard_requires_login(client):
    response = client.get("/")
    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_dashboard_shows_active_chores(client, django_user_model):
    user = django_user_model.objects.create_user(username="dave", password="pw")
    client.force_login(user)
    make_chore(user, "Dishes", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    response = client.get("/")
    assert response.status_code == 200
    assert b"Dishes" in response.content


@pytest.mark.django_db
def test_dashboard_excludes_inactive_chores(client, django_user_model):
    user = django_user_model.objects.create_user(username="eve", password="pw")
    client.force_login(user)
    inst = make_chore(user, "Hidden Chore", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    inst.is_active = False
    inst.save()
    response = client.get("/")
    assert b"Hidden Chore" not in response.content


@pytest.mark.django_db
def test_dashboard_orders_overdue_before_due(client, django_user_model):
    user = django_user_model.objects.create_user(username="frank", password="pw")
    client.force_login(user)
    # due chore — starts today
    from django.utils import timezone as dj_tz
    now = dj_tz.now()
    today_rrule = f"DTSTART:{now.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    make_chore(user, "Due Chore", today_rrule)
    # overdue chore — started 2 days ago, not completed
    old_start = now - timedelta(days=2)
    old_rrule = f"DTSTART:{old_start.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    make_chore(user, "Overdue Chore", old_rrule)
    response = client.get("/")
    content = response.content.decode()
    assert content.index("Overdue Chore") < content.index("Due Chore")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/integration/test_dashboard.py -v`

Expected: `404 Not Found` or import errors.

- [ ] **Step 3: Create chores/views.py with dashboard**

```python
# chores/views.py
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone

from .models import ChoreDefinition, ChoreInstance
from .recurrence import ChoreStatus, get_chore_status

STATUS_ORDER = {
    ChoreStatus.OVERDUE: 0,
    ChoreStatus.DUE: 1,
    ChoreStatus.COMPLETED: 2,
    ChoreStatus.UPCOMING: 3,
}


def _annotate_status(instance: ChoreInstance, now) -> ChoreStatus:
    return get_chore_status(
        instance.definition.recurrence,
        instance.last_completed_at,
        now,
    )


@login_required
def dashboard(request):
    now = timezone.now()
    instances = (
        ChoreInstance.objects.filter(owner=request.user, is_active=True)
        .select_related("definition", "owner__profile__xp_settings")
    )
    annotated = []
    for inst in instances:
        status = _annotate_status(inst, now)
        annotated.append((inst, status))
    annotated.sort(key=lambda t: STATUS_ORDER[t[1]])
    return render(request, "chores/dashboard.html", {"annotated": annotated})
```

- [ ] **Step 4: Create chores/urls.py**

```python
# chores/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
]
```

- [ ] **Step 5: Create dashboard template**

```html
<!-- templates/chores/dashboard.html -->
{% extends "base.html" %}
{% block title %}Dashboard{% endblock %}
{% block content %}
<div class="d-flex justify-content-between align-items-center mb-3">
  <h1>My Chores</h1>
  <a class="btn btn-success" href="{% url 'chore_create' %}">+ New Chore</a>
</div>

{% if not annotated %}
  <p class="text-muted">No active chores. Add one to get started!</p>
{% else %}
  <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3" id="chore-grid">
    {% for instance, status in annotated %}
      {% include "chores/_chore_card.html" with instance=instance status=status %}
    {% endfor %}
  </div>
{% endif %}

<!-- Modal container for question forms -->
<div class="modal fade" id="question-modal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content" id="question-modal-content"></div>
  </div>
</div>
{% endblock %}
```

- [ ] **Step 6: Create chore card partial**

```html
<!-- templates/chores/_chore_card.html -->
{% load chore_tags %}
<div class="col" id="chore-{{ instance.pk }}">
  <div class="card h-100 {% if status.value == 'overdue' %}border-danger{% elif status.value == 'due' %}border-warning{% elif status.value == 'completed' %}border-success{% else %}border-secondary{% endif %}">
    <div class="card-header d-flex justify-content-between">
      <span>{{ instance.definition.name }}</span>
      <span class="badge {% if status.value == 'overdue' %}bg-danger{% elif status.value == 'due' %}bg-warning text-dark{% elif status.value == 'completed' %}bg-success{% else %}bg-secondary{% endif %}">
        {{ status.value|title }}
      </span>
    </div>
    <div class="card-body">
      <p class="card-text small text-muted">Streak: {{ instance.streak_count }} &nbsp;|&nbsp; XP: {% xp_preview instance %}</p>
      {% if status.value == 'overdue' or status.value == 'due' %}
        {% if instance.definition.questions.exists %}
          <button class="btn btn-primary btn-sm"
            hx-get="{% url 'chore_questions' instance.pk %}"
            hx-target="#question-modal-content"
            hx-on::after-request="new bootstrap.Modal(document.getElementById('question-modal')).show()">
            Complete
          </button>
        {% else %}
          <form hx-post="{% url 'chore_complete' instance.pk %}"
                hx-target="#chore-{{ instance.pk }}"
                hx-swap="outerHTML">
            {% csrf_token %}
            <input type="hidden" name="completed_at" class="js-now">
            <button class="btn btn-primary btn-sm" type="submit">Complete</button>
          </form>
        {% endif %}
      {% endif %}
    </div>
    <div class="card-footer text-muted small">{{ instance.definition.get_xp_size_display }}</div>
  </div>
</div>
<script>
  document.querySelectorAll('.js-now').forEach(el => el.value = new Date().toISOString());
</script>
```

- [ ] **Step 7: Create chore_tags templatetag for XP preview**

```python
# chores/templatetags/__init__.py  (empty)
# chores/templatetags/chore_tags.py
from django import template
from xp.formulas import calculate_xp

register = template.Library()

@register.simple_tag
def xp_preview(instance):
    settings = instance.owner.profile.xp_settings
    return calculate_xp(instance.definition.base_xp, instance.streak_count, settings)
```

- [ ] **Step 8: Run integration tests**

Run: `pytest tests/integration/test_dashboard.py -v`

Expected: `4 passed`

- [ ] **Step 9: Commit**

```bash
git add chores/ templates/chores/ tests/integration/test_dashboard.py
git commit -m "feat: dashboard view with status-sorted chore cards"
```

---

## Task 9: Completion Flow (No Questions)

**Files:**
- Modify: `chores/views.py` (add complete view)
- Modify: `chores/urls.py`
- Create: `tests/integration/test_completion.py`

- [ ] **Step 1: Write failing integration tests**

```python
# tests/integration/test_completion.py
import pytest
from datetime import datetime, timezone, timedelta
from django.utils import timezone as dj_tz
from django.contrib.auth.models import User
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion


def make_chore(user, rrule="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"):
    defn = ChoreDefinition.objects.create(
        creator=user, name="Test Chore", xp_size="M", recurrence=rrule
    )
    return ChoreInstance.objects.create(definition=defn, owner=user)


@pytest.mark.django_db
def test_complete_returns_html_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="g1", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/",
        {"completed_at": ts},
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert b"<!DOCTYPE" not in response.content  # fragment, not full page


@pytest.mark.django_db
def test_complete_creates_chore_completion(client, django_user_model):
    user = django_user_model.objects.create_user(username="g2", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts}, HTTP_HX_REQUEST="true")
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1


@pytest.mark.django_db
def test_complete_stores_client_submitted_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g3", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().replace(microsecond=0)
    client.post(
        f"/chores/{inst.pk}/complete/",
        {"completed_at": ts.isoformat()},
        HTTP_HX_REQUEST="true",
    )
    completion = ChoreCompletion.objects.get(instance=inst)
    assert abs((completion.completed_at - ts).total_seconds()) < 2


@pytest.mark.django_db
def test_complete_increments_streak_on_consecutive_completions(client, django_user_model):
    user = django_user_model.objects.create_user(username="g4", password="pw")
    client.force_login(user)
    # Weekly chore starting Jan 1 2026
    inst = make_chore(user, "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY")
    # First completion in window [Jan 1, Jan 8)
    ts1 = datetime(2026, 1, 3, 12, tzinfo=timezone.utc).isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts1}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1
    # Second completion in window [Jan 8, Jan 15)
    ts2 = datetime(2026, 1, 10, 12, tzinfo=timezone.utc).isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts2}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 2


@pytest.mark.django_db
def test_complete_resets_streak_after_missed_window(client, django_user_model):
    user = django_user_model.objects.create_user(username="g5", password="pw")
    client.force_login(user)
    inst = make_chore(user, "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY")
    # Complete Jan 3 (window 1)
    ts1 = datetime(2026, 1, 3, 12, tzinfo=timezone.utc).isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts1}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1
    # Skip week 2 entirely; complete Jan 17 (window 3)
    ts3 = datetime(2026, 1, 17, 12, tzinfo=timezone.utc).isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts3}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1  # reset


@pytest.mark.django_db
def test_complete_updates_total_xp_atomically(client, django_user_model):
    user = django_user_model.objects.create_user(username="g6", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    xp_before = user.profile.total_xp
    ts = dj_tz.now().isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts}, HTTP_HX_REQUEST="true")
    user.profile.refresh_from_db()
    completion = ChoreCompletion.objects.get(instance=inst)
    assert user.profile.total_xp == xp_before + completion.xp_earned


@pytest.mark.django_db
def test_complete_rejects_future_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g7", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    future = (dj_tz.now() + timedelta(hours=1)).isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/", {"completed_at": future}, HTTP_HX_REQUEST="true"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_complete_rejects_stale_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g8", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    stale = (dj_tz.now() - timedelta(hours=49)).isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/", {"completed_at": stale}, HTTP_HX_REQUEST="true"
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/integration/test_completion.py -v`

Expected: `404` errors.

- [ ] **Step 3: Add complete view to chores/views.py**

```python
# append to chores/views.py
from datetime import datetime
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from django.conf import settings as django_settings
from xp.formulas import calculate_xp
from .recurrence import detect_streak_break


@login_required
def complete_chore(request, instance_id):
    if request.method != "POST":
        return HttpResponseBadRequest()

    instance = get_object_or_404(ChoreInstance, pk=instance_id, owner=request.user, is_active=True)

    # Validate timestamp
    raw_ts = request.POST.get("completed_at", "")
    completed_at = parse_datetime(raw_ts)
    if completed_at is None:
        return HttpResponseBadRequest("Invalid completed_at")

    from django.utils import timezone as dj_tz
    now = dj_tz.now()
    max_age = timedelta(hours=django_settings.COMPLETION_TIMESTAMP_MAX_AGE_HOURS)
    if completed_at > now:
        return HttpResponseBadRequest("Timestamp is in the future")
    if now - completed_at > max_age:
        return HttpResponseBadRequest("Timestamp too old")

    # Streak logic + XP + save
    with transaction.atomic():
        broke = detect_streak_break(instance.definition.recurrence, instance.last_completed_at, now)
        instance.streak_count = 1 if broke else instance.streak_count + 1
        instance.last_completed_at = completed_at

        xp_settings = instance.owner.profile.xp_settings
        xp_earned = calculate_xp(instance.definition.base_xp, instance.streak_count, xp_settings)

        from .models import ChoreCompletion
        ChoreCompletion.objects.create(instance=instance, completed_at=completed_at, xp_earned=xp_earned)
        instance.save()

        from accounts.models import Profile
        Profile.objects.filter(user=request.user).update(total_xp=models.F("total_xp") + xp_earned)

    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    return render(request, "chores/_chore_card.html", {"instance": instance, "status": status})
```

Also add missing import at top of chores/views.py:
```python
from datetime import timedelta
from django.db import models
```

- [ ] **Step 4: Add URL to chores/urls.py**

```python
# chores/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("chores/<int:instance_id>/complete/", views.complete_chore, name="chore_complete"),
]
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/integration/test_completion.py -v`

Expected: `8 passed`

- [ ] **Step 6: Commit**

```bash
git add chores/views.py chores/urls.py tests/integration/test_completion.py
git commit -m "feat: complete chore endpoint with streak + XP update"
```

---

## Task 10: Answer Validation

**Files:**
- Create: `chores/answer_validators.py`
- Create: `tests/unit/test_answer_validation.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/unit/test_answer_validation.py
import pytest
from dataclasses import dataclass, field
from chores.answer_validators import validate_answer, AnswerValidationError


@dataclass
class FakeQuestion:
    type: str
    required: bool = True
    regex_pattern: str = ""
    min_value: int | None = None
    max_value: int | None = None
    pk: int = 1


@dataclass
class FakeChoice:
    pk: int
    question_id: int


def test_text_invalid_regex_rejected():
    q = FakeQuestion(type="TEXT", regex_pattern=r"^\d+$")
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer="abc", valid_choice_ids=set())


def test_text_valid_regex_passes():
    q = FakeQuestion(type="TEXT", regex_pattern=r"^\d+$")
    validate_answer(q, answer="123", valid_choice_ids=set())  # no exception


def test_integer_below_min_rejected():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=4, valid_choice_ids=set())


def test_integer_above_max_rejected():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=11, valid_choice_ids=set())


def test_integer_in_range_passes():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    validate_answer(q, answer=7, valid_choice_ids=set())  # no exception


def test_required_with_none_answer_rejected():
    q = FakeQuestion(type="TEXT", required=True)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=None, valid_choice_ids=set())


def test_optional_with_none_answer_passes():
    q = FakeQuestion(type="TEXT", required=False)
    validate_answer(q, answer=None, valid_choice_ids=set())  # no exception


def test_enum_invalid_choice_rejected():
    q = FakeQuestion(type="ENUM")
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=99, valid_choice_ids={1, 2, 3})


def test_enum_valid_choice_passes():
    q = FakeQuestion(type="ENUM")
    validate_answer(q, answer=2, valid_choice_ids={1, 2, 3})  # no exception
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_answer_validation.py -v`

Expected: `ImportError`

- [ ] **Step 3: Implement answer_validators.py**

```python
# chores/answer_validators.py
import re


class AnswerValidationError(Exception):
    pass


def validate_answer(question, answer, valid_choice_ids: set) -> None:
    if answer is None:
        if question.required:
            raise AnswerValidationError(f"Question is required")
        return  # optional + None is fine

    if question.type == "TEXT":
        if question.regex_pattern:
            if not re.fullmatch(question.regex_pattern, str(answer)):
                raise AnswerValidationError(
                    f"Answer does not match required pattern: {question.regex_pattern}"
                )

    elif question.type == "INTEGER":
        if question.min_value is not None and answer < question.min_value:
            raise AnswerValidationError(f"Answer must be >= {question.min_value}")
        if question.max_value is not None and answer > question.max_value:
            raise AnswerValidationError(f"Answer must be <= {question.max_value}")

    elif question.type == "ENUM":
        if answer not in valid_choice_ids:
            raise AnswerValidationError("Invalid choice")
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_answer_validation.py -v`

Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add chores/answer_validators.py tests/unit/test_answer_validation.py
git commit -m "feat: answer validation for completion questions"
```

---

## Task 11: Completion Flow With Questions

**Files:**
- Modify: `chores/views.py` (add question modal GET + POST)
- Create: `chores/forms.py` (CompletionAnswerForm)
- Modify: `chores/urls.py`
- Create: `templates/chores/_question_modal.html`
- Create: `tests/integration/test_completion_questions.py`

- [ ] **Step 1: Write failing integration tests**

```python
# tests/integration/test_completion_questions.py
import pytest
from django.utils import timezone as dj_tz
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion, Question, QuestionChoice, CompletionAnswer


def make_chore_with_question(user):
    defn = ChoreDefinition.objects.create(
        creator=user, name="Watering", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    q = Question.objects.create(
        definition=defn, order=1, text="How many litres?",
        required=True, type="INTEGER", min_value=1, max_value=20
    )
    return inst, q


@pytest.mark.django_db
def test_question_modal_get_returns_form(client, django_user_model):
    user = django_user_model.objects.create_user(username="h1", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    response = client.get(f"/chores/{inst.pk}/questions/")
    assert response.status_code == 200
    assert b"How many litres?" in response.content


@pytest.mark.django_db
def test_valid_answers_create_completion_and_answers(client, django_user_model):
    user = django_user_model.objects.create_user(username="h2", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "5"},
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1
    completion = ChoreCompletion.objects.get(instance=inst)
    answer = CompletionAnswer.objects.get(completion=completion, question=q)
    assert answer.integer_value == 5


@pytest.mark.django_db
def test_invalid_answer_returns_form_with_errors_no_completion(client, django_user_model):
    user = django_user_model.objects.create_user(username="h3", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "999"},  # exceeds max_value=20
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert ChoreCompletion.objects.filter(instance=inst).count() == 0
```

- [ ] **Step 2: Add question modal views to chores/views.py**

```python
# append to chores/views.py
from .models import Question, QuestionChoice, CompletionAnswer
from .answer_validators import validate_answer, AnswerValidationError


@login_required
def chore_questions(request, instance_id):
    instance = get_object_or_404(ChoreInstance, pk=instance_id, owner=request.user, is_active=True)
    questions = list(instance.definition.questions.prefetch_related("choices").all())

    if request.method == "GET":
        return render(request, "chores/_question_modal.html", {
            "instance": instance,
            "questions": questions,
            "errors": {},
        })

    # POST — validate and complete
    raw_ts = request.POST.get("completed_at", "")
    from django.utils.dateparse import parse_datetime
    from django.utils import timezone as dj_tz
    from django.conf import settings as django_settings

    completed_at = parse_datetime(raw_ts)
    now = dj_tz.now()
    max_age = timedelta(hours=django_settings.COMPLETION_TIMESTAMP_MAX_AGE_HOURS)

    if completed_at is None or completed_at > now or (now - completed_at) > max_age:
        return HttpResponseBadRequest("Invalid completed_at")

    errors = {}
    typed_answers = {}

    for q in questions:
        raw = request.POST.get(f"question_{q.pk}")
        try:
            value = _coerce_answer(q, raw)
            valid_ids = set(q.choices.values_list("pk", flat=True)) if q.type == "ENUM" else set()
            validate_answer(q, value, valid_ids)
            typed_answers[q.pk] = value
        except (AnswerValidationError, ValueError) as exc:
            errors[q.pk] = str(exc)

    if errors:
        return render(request, "chores/_question_modal.html", {
            "instance": instance,
            "questions": questions,
            "errors": errors,
            "posted": request.POST,
        })

    with transaction.atomic():
        broke = detect_streak_break(instance.definition.recurrence, instance.last_completed_at, now)
        instance.streak_count = 1 if broke else instance.streak_count + 1
        instance.last_completed_at = completed_at

        xp_settings = instance.owner.profile.xp_settings
        xp_earned = calculate_xp(instance.definition.base_xp, instance.streak_count, xp_settings)

        completion = ChoreCompletion.objects.create(
            instance=instance, completed_at=completed_at, xp_earned=xp_earned
        )
        instance.save()

        for q in questions:
            answer_value = typed_answers.get(q.pk)
            if answer_value is None:
                continue
            kwargs = {"completion": completion, "question": q}
            if q.type == "TEXT":
                kwargs["text_value"] = answer_value
            elif q.type == "INTEGER":
                kwargs["integer_value"] = answer_value
            elif q.type == "BOOLEAN":
                kwargs["boolean_value"] = answer_value
            elif q.type == "ENUM":
                kwargs["enum_value_id"] = answer_value
            CompletionAnswer.objects.create(**kwargs)

        from accounts.models import Profile
        Profile.objects.filter(user=request.user).update(total_xp=models.F("total_xp") + xp_earned)

    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    card_html = render(request, "chores/_chore_card.html", {"instance": instance, "status": status}).content.decode()

    # Out-of-band modal close
    close_oob = '<div hx-swap-oob="innerHTML:#question-modal-content"></div>'
    return HttpResponse(card_html + close_oob)


def _coerce_answer(question, raw):
    if raw is None or raw.strip() == "":
        return None
    if question.type == "INTEGER":
        return int(raw)
    if question.type == "BOOLEAN":
        return raw.lower() in ("true", "1", "yes", "on")
    if question.type == "ENUM":
        return int(raw)
    return raw  # TEXT
```

- [ ] **Step 3: Add URL**

```python
# chores/urls.py — add:
path("chores/<int:instance_id>/questions/", views.chore_questions, name="chore_questions"),
```

- [ ] **Step 4: Create question modal template**

```html
<!-- templates/chores/_question_modal.html -->
<div class="modal-header">
  <h5 class="modal-title">Complete: {{ instance.definition.name }}</h5>
  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
</div>
<form hx-post="{% url 'chore_questions' instance.pk %}"
      hx-target="#chore-{{ instance.pk }}"
      hx-swap="outerHTML"
      hx-on::after-request="bootstrap.Modal.getInstance(document.getElementById('question-modal')).hide()">
  {% csrf_token %}
  <input type="hidden" name="completed_at" class="js-now">
  <div class="modal-body">
    {% for q in questions %}
    <div class="mb-3">
      <label class="form-label">{{ q.text }}{% if q.required %} *{% endif %}</label>
      {% if q.type == "TEXT" %}
        <input type="text" name="question_{{ q.pk }}" class="form-control"
               value="{{ posted|default_if_none:''|get_item:q.pk|default:'' }}">
      {% elif q.type == "INTEGER" %}
        <input type="number" name="question_{{ q.pk }}" class="form-control"
               {% if q.min_value is not None %}min="{{ q.min_value }}"{% endif %}
               {% if q.max_value is not None %}max="{{ q.max_value }}"{% endif %}
               value="{{ posted|default_if_none:''|get_item:q.pk|default:'' }}">
      {% elif q.type == "BOOLEAN" %}
        <select name="question_{{ q.pk }}" class="form-select">
          <option value="">---</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      {% elif q.type == "ENUM" %}
        <select name="question_{{ q.pk }}" class="form-select">
          <option value="">---</option>
          {% for choice in q.choices.all %}
          <option value="{{ choice.pk }}">{{ choice.label }}</option>
          {% endfor %}
        </select>
      {% endif %}
      {% if errors|default_if_none:''|get_item:q.pk %}
      <div class="text-danger small">{{ errors|get_item:q.pk }}</div>
      {% endif %}
    </div>
    {% endfor %}
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
    <button type="submit" class="btn btn-primary">Submit</button>
  </div>
</form>
<script>document.querySelectorAll('.js-now').forEach(el => el.value = new Date().toISOString());</script>
```

- [ ] **Step 5: Add `get_item` template filter to chore_tags.py**

```python
# append to chores/templatetags/chore_tags.py
@register.filter
def get_item(dictionary, key):
    if dictionary is None:
        return None
    return dictionary.get(key)
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/integration/test_completion_questions.py -v`

Expected: `3 passed`

- [ ] **Step 7: Commit**

```bash
git add chores/ templates/chores/_question_modal.html tests/integration/test_completion_questions.py
git commit -m "feat: completion flow with question modal"
```

---

## Task 12: Chore Management (Create, Edit, Deactivate)

**Files:**
- Modify: `chores/forms.py`
- Modify: `chores/views.py`
- Modify: `chores/urls.py`
- Create: `templates/chores/chore_form.html`
- Create: `tests/integration/test_chore_management.py`

- [ ] **Step 1: Write failing integration tests**

```python
# tests/integration/test_chore_management.py
import pytest
from django.utils import timezone as dj_tz
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion, Question


@pytest.mark.django_db
def test_create_chore_saves_definition_and_instance(client, django_user_model):
    user = django_user_model.objects.create_user(username="i1", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Vacuum",
        "description": "Living room",
        "xp_size": "L",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY",
        "questions-TOTAL_FORMS": "0",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
    })
    assert response.status_code == 302
    assert ChoreDefinition.objects.filter(name="Vacuum").exists()
    defn = ChoreDefinition.objects.get(name="Vacuum")
    assert ChoreInstance.objects.filter(definition=defn, owner=user).exists()


@pytest.mark.django_db
def test_edit_chore_updates_definition_not_completions(client, django_user_model):
    user = django_user_model.objects.create_user(username="i2", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    ChoreCompletion.objects.create(instance=inst, completed_at=dj_tz.now(), xp_earned=3)

    client.post(f"/chores/{defn.pk}/edit/", {
        "name": "Sweep Updated",
        "description": "",
        "xp_size": "M",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
        "questions-TOTAL_FORMS": "0",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
    })
    defn.refresh_from_db()
    assert defn.name == "Sweep Updated"
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1


@pytest.mark.django_db
def test_create_chore_with_questions_saves_questions(client, django_user_model):
    user = django_user_model.objects.create_user(username="i3", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Run",
        "description": "",
        "xp_size": "M",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
        "questions-TOTAL_FORMS": "1",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
        "questions-0-text": "Distance (km)?",
        "questions-0-type": "INTEGER",
        "questions-0-required": "on",
        "questions-0-order": "1",
        "questions-0-min_value": "1",
        "questions-0-max_value": "100",
    })
    assert response.status_code == 302
    defn = ChoreDefinition.objects.get(name="Run")
    assert Question.objects.filter(definition=defn, text="Distance (km)?").exists()


@pytest.mark.django_db
def test_deactivate_removes_from_dashboard(client, django_user_model):
    user = django_user_model.objects.create_user(username="i4", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Hide Me", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    client.post(f"/chores/{inst.pk}/deactivate/")
    inst.refresh_from_db()
    assert not inst.is_active
    response = client.get("/")
    assert b"Hide Me" not in response.content
```

- [ ] **Step 2: Create chores/forms.py**

```python
# chores/forms.py
from django import forms
from django.forms import inlineformset_factory
from .models import ChoreDefinition, Question


class ChoreDefinitionForm(forms.ModelForm):
    class Meta:
        model = ChoreDefinition
        fields = ["name", "description", "xp_size", "recurrence"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }


QuestionFormSet = inlineformset_factory(
    ChoreDefinition,
    Question,
    fields=["text", "type", "required", "order", "regex_pattern", "min_value", "max_value"],
    extra=0,
    can_delete=True,
    can_order=False,
)
```

- [ ] **Step 3: Add create/edit/deactivate views to chores/views.py**

```python
# append to chores/views.py
from django.shortcuts import redirect
from .forms import ChoreDefinitionForm, QuestionFormSet


@login_required
def create_chore(request):
    if request.method == "POST":
        form = ChoreDefinitionForm(request.POST)
        formset = QuestionFormSet(request.POST, prefix="questions")
        if form.is_valid() and formset.is_valid():
            with transaction.atomic():
                defn = form.save(commit=False)
                defn.creator = request.user
                defn.save()
                formset.instance = defn
                formset.save()
                ChoreInstance.objects.create(definition=defn, owner=request.user)
            return redirect("dashboard")
    else:
        form = ChoreDefinitionForm()
        formset = QuestionFormSet(prefix="questions")
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Create"})


@login_required
def edit_chore(request, definition_id):
    defn = get_object_or_404(ChoreDefinition, pk=definition_id, creator=request.user)
    if request.method == "POST":
        form = ChoreDefinitionForm(request.POST, instance=defn)
        formset = QuestionFormSet(request.POST, instance=defn, prefix="questions")
        if form.is_valid() and formset.is_valid():
            with transaction.atomic():
                form.save()
                formset.save()
            return redirect("dashboard")
    else:
        form = ChoreDefinitionForm(instance=defn)
        formset = QuestionFormSet(instance=defn, prefix="questions")
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Edit"})


@login_required
def deactivate_chore(request, instance_id):
    instance = get_object_or_404(ChoreInstance, pk=instance_id, owner=request.user)
    instance.is_active = False
    instance.save()
    return redirect("dashboard")
```

- [ ] **Step 4: Add URLs**

```python
# chores/urls.py — append to urlpatterns:
path("chores/new/", views.create_chore, name="chore_create"),
path("chores/<int:definition_id>/edit/", views.edit_chore, name="chore_edit"),
path("chores/<int:instance_id>/deactivate/", views.deactivate_chore, name="chore_deactivate"),
```

- [ ] **Step 5: Create chore_form.html template**

```html
<!-- templates/chores/chore_form.html -->
{% extends "base.html" %}
{% block title %}{{ action }} Chore{% endblock %}
{% block content %}
<h2>{{ action }} Chore</h2>
<form method="post">
  {% csrf_token %}
  {{ form.as_p }}

  <h4 class="mt-4">Questions</h4>
  {{ formset.management_form }}
  <div id="question-formset">
    {% for qform in formset %}
    <div class="border rounded p-3 mb-2 question-form">
      {{ qform.as_p }}
      {% if qform.instance.pk %}{{ qform.DELETE }}{% endif %}
    </div>
    {% endfor %}
  </div>
  <button type="button" class="btn btn-outline-secondary btn-sm mb-3" id="add-question">+ Add Question</button>

  <div>
    <button class="btn btn-primary" type="submit">{{ action }}</button>
    <a class="btn btn-link" href="{% url 'dashboard' %}">Cancel</a>
  </div>
</form>

<script>
  let formIdx = {{ formset.total_form_count }};
  document.getElementById('add-question').addEventListener('click', () => {
    const container = document.getElementById('question-formset');
    const tmpl = container.querySelector('.question-form');
    if (!tmpl) return;
    const clone = tmpl.cloneNode(true);
    clone.innerHTML = clone.innerHTML.replace(/__prefix__/g, formIdx).replace(/questions-\d+-/g, `questions-${formIdx}-`);
    clone.querySelectorAll('input,select,textarea').forEach(el => el.value = '');
    container.appendChild(clone);
    document.getElementById('id_questions-TOTAL_FORMS').value = ++formIdx;
  });
</script>
{% endblock %}
```

- [ ] **Step 6: Register chores in admin**

```python
# chores/admin.py
from django.contrib import admin
from .models import ChoreDefinition, ChoreInstance, ChoreCompletion, Question

admin.site.register(ChoreDefinition)
admin.site.register(ChoreInstance)
admin.site.register(ChoreCompletion)
admin.site.register(Question)
```

- [ ] **Step 7: Run integration tests**

Run: `pytest tests/integration/test_chore_management.py -v`

Expected: `4 passed`

- [ ] **Step 8: Run full test suite**

Run: `pytest tests/unit/ tests/integration/ -v`

Expected: All tests pass (no failures).

- [ ] **Step 9: Commit**

```bash
git add chores/ templates/chores/chore_form.html tests/integration/test_chore_management.py
git commit -m "feat: chore create/edit/deactivate with inline question formset"
```

---

## Task 13: Phase 1 Offline (Service Worker + PWA)

**Files:**
- Create: `static/js/service-worker.js`
- Create: `static/manifest.json`
- Modify: `templates/base.html` (SW registration is already there from Task 4 — just needs actual SW file)

The service worker caches the app shell (Bootstrap, HTMX, Alpine.js, base HTML) on install, and uses a network-first strategy for dashboard and chore pages. When offline, the "Complete" button is hidden.

- [ ] **Step 1: Create static/manifest.json**

```json
{
  "name": "Tasks Harmony",
  "short_name": "Tasks",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#212529",
  "theme_color": "#212529",
  "icons": [
    {
      "src": "/static/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/static/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Create a placeholder icon (1×1 PNG, good enough for PWA installability)**

Run:
```bash
python -c "
import base64, pathlib
# 1x1 dark grey PNG, base64 encoded
data = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
pathlib.Path('static/icon-192.png').write_bytes(data)
pathlib.Path('static/icon-512.png').write_bytes(data)
"
```

- [ ] **Step 3: Create static/js/service-worker.js**

```javascript
const CACHE_NAME = 'tasks-harmony-v1';
const APP_SHELL = [
  '/',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://unpkg.com/htmx.org@1.9.12',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
```

- [ ] **Step 4: Add offline button-hiding to base template**

Inside the `<body>` tag in `templates/base.html`, add before the closing `</body>`:

```html
<script>
  window.addEventListener('offline', () => {
    document.querySelectorAll('button[type="submit"], .btn-primary').forEach(btn => {
      btn.disabled = true;
      btn.dataset.offlineDisabled = '1';
    });
  });
  window.addEventListener('online', () => {
    document.querySelectorAll('[data-offline-disabled]').forEach(btn => {
      btn.disabled = false;
      delete btn.dataset.offlineDisabled;
    });
  });
</script>
```

- [ ] **Step 5: Run collectstatic to verify no errors**

Run: `python manage.py collectstatic --noinput`

Expected: Static files collected without error.

- [ ] **Step 6: Commit**

```bash
git add static/ templates/base.html
git commit -m "feat: Phase 1 offline — service worker, PWA manifest, offline button disable"
```

---

## Task 14: End-to-End Tests (Playwright)

**Files:**
- Create: `tests/e2e/conftest.py`
- Create: `tests/e2e/test_dashboard.py`
- Create: `tests/e2e/test_chore_management.py`
- Create: `tests/e2e/test_offline.py`

These tests require a running Django dev server and installed Playwright browsers.

Setup: `playwright install chromium`

- [ ] **Step 1: Create E2E conftest.py**

```python
# tests/e2e/conftest.py
import pytest
import threading
import django
from django.test import LiveServerTestCase
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="session")
def live_server_url(live_server):
    return live_server.url


@pytest.fixture(scope="session")
def browser_context_args():
    return {"ignore_https_errors": True}


def create_test_user(username="tester", password="testpass123"):
    from django.contrib.auth.models import User
    user, _ = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.save()
    return user, password


def login_browser(page, live_url, username="tester", password="testpass123"):
    page.goto(f"{live_url}/accounts/login/")
    page.fill("[name=username]", username)
    page.fill("[name=password]", password)
    page.click("[type=submit]")
    page.wait_for_url(f"{live_url}/")
```

- [ ] **Step 2: Create test_dashboard.py**

```python
# tests/e2e/test_dashboard.py
import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db(transaction=True)
def test_all_four_card_states_render(page: Page, live_server):
    user, pw = create_test_user("e2e_states")
    # Create 4 chores with distinct statuses by varying DTSTART
    from django.utils import timezone
    now = timezone.now()

    def make(name, dtstart, last_completed=None):
        rrule = f"DTSTART:{dtstart}\nRRULE:FREQ=WEEKLY"
        defn = ChoreDefinition.objects.create(creator=user, name=name, xp_size="S", recurrence=rrule)
        inst = ChoreInstance.objects.create(definition=defn, owner=user, last_completed_at=last_completed)
        return inst

    # Due: started in current week, not completed
    make("Due Chore", now.strftime("%Y%m%dT%H%M%SZ"))
    # Completed: started last week, completed last week
    import datetime
    last_week = now - datetime.timedelta(days=7)
    make("Completed Chore", last_week.strftime("%Y%m%dT%H%M%SZ"), last_completed=last_week + datetime.timedelta(days=1))
    # Upcoming: starts next week
    next_week = now + datetime.timedelta(days=7)
    make("Upcoming Chore", next_week.strftime("%Y%m%dT%H%M%SZ"))
    # Overdue: started 2 weeks ago, not completed
    two_weeks = now - datetime.timedelta(days=14)
    make("Overdue Chore", two_weeks.strftime("%Y%m%dT%H%M%SZ"))

    login_browser(page, live_server.url, "e2e_states", pw)
    expect(page.locator("text=Due Chore")).to_be_visible()
    expect(page.locator("text=Completed Chore")).to_be_visible()
    expect(page.locator("text=Upcoming Chore")).to_be_visible()
    expect(page.locator("text=Overdue Chore")).to_be_visible()

    # Each status badge is visible
    expect(page.locator(".badge", has_text="Overdue")).to_be_visible()
    expect(page.locator(".badge", has_text="Due")).to_be_visible()
    expect(page.locator(".badge", has_text="Completed")).to_be_visible()
    expect(page.locator(".badge", has_text="Upcoming")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_complete_no_questions_no_page_reload(page: Page, live_server):
    user, pw = create_test_user("e2e_complete")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Quick Task", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    navigated = []
    page.on("framenavigated", lambda _: navigated.append(1))
    login_browser(page, live_server.url, "e2e_complete", pw)
    navigated.clear()  # clear login navigations

    page.click("button:has-text('Complete')")
    page.wait_for_selector(".badge:has-text('Completed')")
    assert len(navigated) == 0, "Full page reload occurred"


@pytest.mark.django_db(transaction=True)
def test_complete_with_questions_modal_opens_and_card_updates(page: Page, live_server):
    user, pw = create_test_user("e2e_modal")
    from django.utils import timezone
    from chores.models import Question
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Modal Task", xp_size="M", recurrence=rrule)
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    Question.objects.create(definition=defn, order=1, text="Rate it (1-5)?", required=True, type="INTEGER", min_value=1, max_value=5)

    login_browser(page, live_server.url, "e2e_modal", pw)
    page.click("button:has-text('Complete')")
    expect(page.locator("#question-modal")).to_be_visible()
    page.fill("[name*='question_']", "3")
    page.click(".modal-footer button[type=submit]")
    page.wait_for_selector(".badge:has-text('Completed')")
    expect(page.locator("#question-modal")).not_to_be_visible()
```

- [ ] **Step 3: Create test_chore_management.py**

```python
# tests/e2e/test_chore_management.py
import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser


@pytest.mark.django_db(transaction=True)
def test_full_create_flow_chore_appears_on_dashboard(page: Page, live_server):
    user, pw = create_test_user("e2e_create")
    login_browser(page, live_server.url, "e2e_create", pw)
    page.click("text=+ New Chore")
    page.fill("[name=name]", "New E2E Chore")
    page.select_option("[name=xp_size]", "L")
    # Set recurrence via textarea (django-recurrence renders a textarea)
    page.fill("[name=recurrence]", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    page.click("[type=submit]")
    page.wait_for_url(f"{live_server.url}/")
    expect(page.locator("text=New E2E Chore")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_edit_chore_updates_card_on_dashboard(page: Page, live_server):
    from django.utils import timezone
    from chores.models import ChoreDefinition, ChoreInstance
    user, pw = create_test_user("e2e_edit")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Old Name", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_edit", pw)
    page.goto(f"{live_server.url}/chores/{defn.pk}/edit/")
    page.fill("[name=name]", "Updated Name")
    page.select_option("[name=xp_size]", "XL")
    page.click("[type=submit]")
    page.wait_for_url(f"{live_server.url}/")
    expect(page.locator("text=Updated Name")).to_be_visible()
```

- [ ] **Step 4: Create test_offline.py**

```python
# tests/e2e/test_offline.py
import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db(transaction=True)
def test_offline_dashboard_served_from_cache(page: Page, live_server, context):
    user, pw = create_test_user("e2e_offline1")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Offline Test", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    # Warm the cache
    login_browser(page, live_server.url, "e2e_offline1", pw)
    page.wait_for_load_state("networkidle")

    # Go offline
    context.set_offline(True)
    page.reload()
    expect(page.locator("text=Offline Test")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_complete_button_disabled_when_offline(page: Page, live_server, context):
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Offline Btn", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    complete_btn = page.locator("button:has-text('Complete')")
    expect(complete_btn).to_be_disabled()
    context.set_offline(False)
```

- [ ] **Step 5: Install Playwright browsers**

Run: `playwright install chromium`

Expected: Chromium binary downloaded.

- [ ] **Step 6: Run E2E tests**

Run: `pytest tests/e2e/ -v --headed=false`

Expected: All E2E tests pass (note: tests requiring a running server use `live_server` fixture automatically provided by pytest-django).

- [ ] **Step 7: Run full test suite**

Run: `pytest tests/ -v`

Expected: All unit, integration, and E2E tests pass.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/
git commit -m "feat: Playwright E2E tests — dashboard, chore management, offline Phase 1"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec Section | Covered By |
|---|---|
| Docker Compose (base + override) | Task 1 |
| accounts app — Profile, total_xp, xp_settings FK | Task 3 |
| xp app — XPSettings model, named configurations | Task 3 |
| XP formula — streak_mult, decay_mult, round() | Task 2 |
| Ledger — total_xp transactional update, xp_earned immutable | Task 9, 11 |
| ChoreDefinition — creator, name, xp_size (Fibonacci), recurrence RRULE | Task 5 |
| ChoreInstance — streak, last_completed_at, is_active | Task 5 |
| Auto-create owner ChoreInstance on create | Task 12 |
| Question / QuestionChoice / ChoreCompletion / CompletionAnswer models | Task 6 |
| Window logic — due, overdue, completed, upcoming | Task 7 |
| Streak break detection | Task 7 |
| Dashboard — sorted by status (overdue→due→completed→upcoming) | Task 8 |
| Completion (no questions) — HTMX card swap | Task 9 |
| Timestamp validation — future/stale rejected with 400 | Task 9 |
| Completion (with questions) — modal, validation, OOB modal close | Task 11 |
| Answer validation — TEXT regex, INTEGER range, required, ENUM membership | Task 10, 11 |
| Chore create/edit/deactivate with inline question builder | Task 12 |
| Phase 1 offline — SW caching, network-first strategy, Complete button hidden | Task 13 |
| All unit tests from spec | Tasks 2, 7, 10 |
| All integration tests from spec | Tasks 3, 5, 8, 9, 11, 12 |
| E2E tests — 4 status states, no reload on complete, modal, create, edit, offline | Task 14 |

**Phase 2 offline (Alpine optimistic UI + IndexedDB + Background Sync) is explicitly deferred** — write a separate plan when Phase 1 has been manually reviewed and merged.

**Placeholder scan:** No TBD / TODO / "implement later" found. All steps include complete code.

**Type consistency check:**
- `calculate_xp(base_xp: Decimal, streak_count: int, settings) -> int` used consistently in Tasks 2, 9, 11.
- `get_chore_status(rrule_string, last_completed_at, now)` → `ChoreStatus` used consistently in Tasks 7, 8, 9, 11.
- `detect_streak_break(rrule_string, last_completed_at, now)` → `bool` used consistently in Tasks 7, 9, 11.
- `XP_SIZE_VALUES` dict and `ChoreDefinition.base_xp` property used in Tasks 5, 9, 11.
- `QuestionFormSet` with prefix `"questions"` used in Tasks 12 tests and views.
