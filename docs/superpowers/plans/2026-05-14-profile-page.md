# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile page accessible from the navbar that displays user info and allows changing personal details and password.

**Architecture:** A single `profile` view at `/accounts/profile/` handles GET (display) and two POST variants distinguished by a hidden `action` field (`info` or `password`). The page is split into three visual sections: read-only stats, personal info form, password change form. Bootstrap Icons (CDN) provides the navbar icon.

**Tech Stack:** Django 5, Bootstrap 5.3, Bootstrap Icons 1.11, existing `{% bs_field %}` template tag, `django.contrib.auth.forms.PasswordChangeForm`

---

## File Structure

| File | Change |
|---|---|
| `accounts/forms.py` | Add `PersonalInfoForm` (ModelForm on User: first_name, last_name, email) |
| `accounts/views.py` | Add `profile` view |
| `accounts/urls.py` | Add `path("profile/", ...)` |
| `templates/accounts/profile.html` | New page: stats card + two forms |
| `templates/base.html` | Add Bootstrap Icons CDN; add profile icon link in navbar |
| `tests/integration/test_profile.py` | New: 7 integration tests |

---

### Task 1: `PersonalInfoForm` + failing tests

**Files:**
- Modify: `accounts/forms.py`
- Create: `tests/integration/test_profile.py`

- [ ] **Step 1: Add `PersonalInfoForm` to `accounts/forms.py`**

Append after `RegisterForm`:

```python
class PersonalInfoForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "email"]
```

- [ ] **Step 2: Create `tests/integration/test_profile.py` with 7 failing tests**

```python
import pytest
from django.contrib.auth.models import User


@pytest.mark.django_db
def test_profile_requires_login(client):
    response = client.get("/accounts/profile/")
    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_profile_get_shows_user_info(client, django_user_model):
    user = django_user_model.objects.create_user(
        username="prof1", password="pw", email="prof1@example.com"
    )
    client.force_login(user)
    response = client.get("/accounts/profile/")
    assert response.status_code == 200
    assert b"prof1" in response.content
    assert b"prof1@example.com" in response.content


@pytest.mark.django_db
def test_profile_get_shows_xp_and_settings(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof2", password="pw")
    client.force_login(user)
    response = client.get("/accounts/profile/")
    assert response.status_code == 200
    # total_xp default is 0
    assert b"0" in response.content
    # XP settings name ("Standard") must appear
    assert b"Standard" in response.content


@pytest.mark.django_db
def test_profile_post_info_updates_user(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof3", password="pw")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "info",
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "alice@example.com",
    })
    assert response.status_code == 302
    user.refresh_from_db()
    assert user.first_name == "Alice"
    assert user.last_name == "Smith"
    assert user.email == "alice@example.com"


@pytest.mark.django_db
def test_profile_post_info_invalid_email_does_not_save(client, django_user_model):
    user = django_user_model.objects.create_user(
        username="prof4", password="pw", email="original@example.com"
    )
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "info",
        "first_name": "Bob",
        "last_name": "",
        "email": "not-an-email",
    })
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.email == "original@example.com"


@pytest.mark.django_db
def test_profile_post_password_change_updates_password(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof5", password="oldpass99!")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "password",
        "old_password": "oldpass99!",
        "new_password1": "Newpass123!",
        "new_password2": "Newpass123!",
    })
    assert response.status_code == 302
    user.refresh_from_db()
    assert user.check_password("Newpass123!")


@pytest.mark.django_db
def test_profile_post_password_wrong_old_does_not_change(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof6", password="oldpass99!")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "password",
        "old_password": "wrongpass",
        "new_password1": "Newpass123!",
        "new_password2": "Newpass123!",
    })
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("oldpass99!")
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/test_profile.py -v
```

Expected: 7 FAIL (NoReverseMatch — URL doesn't exist yet)

- [ ] **Step 4: Commit**

```bash
git add accounts/forms.py tests/integration/test_profile.py
git commit -m "test: add failing profile page tests + PersonalInfoForm"
```

---

### Task 2: Profile view + URL

**Files:**
- Modify: `accounts/views.py`
- Modify: `accounts/urls.py`

- [ ] **Step 1: Replace `accounts/views.py` with the full updated file**

```python
from django.contrib.auth import login, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib import messages
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.generic import CreateView

from .forms import PersonalInfoForm, RegisterForm


class RegisterView(CreateView):
    form_class = RegisterForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("dashboard")

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response


@login_required
def profile(request):
    user = request.user
    info_form = PersonalInfoForm(instance=user)
    password_form = PasswordChangeForm(user)

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "info":
            info_form = PersonalInfoForm(request.POST, instance=user)
            if info_form.is_valid():
                info_form.save()
                messages.success(request, "Personal info updated.")
                return redirect("profile")
        elif action == "password":
            password_form = PasswordChangeForm(user, request.POST)
            if password_form.is_valid():
                password_form.save()
                update_session_auth_hash(request, password_form.user)
                messages.success(request, "Password changed.")
                return redirect("profile")

    return render(request, "accounts/profile.html", {
        "info_form": info_form,
        "password_form": password_form,
    })
```

- [ ] **Step 2: Add profile URL to `accounts/urls.py`**

```python
from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from .views import RegisterView, profile

urlpatterns = [
    path("login/", LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("profile/", profile, name="profile"),
]
```

- [ ] **Step 3: Run tests — they should still fail but now with TemplateDoesNotExist, not NoReverseMatch**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/test_profile.py -v
```

Expected: most FAIL with `TemplateDoesNotExist: accounts/profile.html`

- [ ] **Step 4: Commit**

```bash
git add accounts/views.py accounts/urls.py
git commit -m "feat: add profile view and URL"
```

---

### Task 3: Profile template

**Files:**
- Create: `templates/accounts/profile.html`

- [ ] **Step 1: Create the template**

```html
{% extends "base.html" %}
{% load chore_tags %}
{% block title %}Profile{% endblock %}
{% block content %}
<div class="row justify-content-center">
  <div class="col-lg-7">
    <h2 class="mb-4">Profile</h2>

    {% for message in messages %}
      <div class="alert alert-success alert-dismissible fade show py-2">{{ message }}</div>
    {% endfor %}

    {# ── Stats ── #}
    <div class="card mb-4">
      <div class="card-header fw-semibold">Account Info</div>
      <ul class="list-group list-group-flush">
        <li class="list-group-item d-flex justify-content-between">
          <span class="text-muted">Username</span>
          <span>{{ request.user.username }}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between">
          <span class="text-muted">Joined</span>
          <span>{{ request.user.date_joined|date:"j N Y" }}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between">
          <span class="text-muted">Total XP</span>
          <span>{{ request.user.profile.total_xp }}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between">
          <span class="text-muted">XP Settings</span>
          <span>
            {% with s=request.user.profile.xp_settings %}
              {% if s %}
                {{ s.name }}
                <small class="text-muted ms-2">max ×{{ s.max_streak_multiplier }}, floor ×{{ s.decay_floor }}</small>
              {% else %}
                —
              {% endif %}
            {% endwith %}
          </span>
        </li>
      </ul>
    </div>

    {# ── Personal info form ── #}
    <div class="card mb-4">
      <div class="card-header fw-semibold">Personal Info</div>
      <div class="card-body">
        <form method="post">
          {% csrf_token %}
          <input type="hidden" name="action" value="info">
          {% for field in info_form %}{% bs_field field %}{% endfor %}
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
      </div>
    </div>

    {# ── Password form ── #}
    <div class="card mb-4">
      <div class="card-header fw-semibold">Change Password</div>
      <div class="card-body">
        <form method="post">
          {% csrf_token %}
          <input type="hidden" name="action" value="password">
          {% for field in password_form %}{% bs_field field %}{% endfor %}
          <button class="btn btn-primary" type="submit">Change Password</button>
        </form>
      </div>
    </div>

  </div>
</div>
{% endblock %}
```

- [ ] **Step 2: Run all tests — all 7 profile tests must pass, no regressions in the full suite**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/ tests/unit/ -v
```

Expected: all 61 tests PASS

- [ ] **Step 3: Commit**

```bash
git add templates/accounts/profile.html
git commit -m "feat: add profile page template"
```

---

### Task 4: Bootstrap Icons + navbar profile link

**Files:**
- Modify: `templates/base.html`

- [ ] **Step 1: Add Bootstrap Icons CDN link and profile nav button to `base.html`**

In the `<head>`, after the Bootstrap CSS `<link>`, add:
```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
```

In the `{% if user.is_authenticated %}` navbar block, add the profile link between the XP counter and the logout button:
```html
      <a class="btn btn-outline-light btn-sm me-2" href="{% url 'profile' %}" title="Profile">
        <i class="bi bi-person-circle"></i>
      </a>
```

The full updated authenticated block in `base.html` should look like:
```html
      {% if user.is_authenticated %}
      <span id="xp-counter" class="navbar-text text-light me-3">XP: {{ user.profile.total_xp }}</span>
      <a class="btn btn-outline-light btn-sm me-2" href="{% url 'profile' %}" title="Profile">
        <i class="bi bi-person-circle"></i>
      </a>
      <form method="post" action="{% url 'logout' %}" class="d-inline">
        {% csrf_token %}
        <button class="btn btn-outline-light btn-sm" type="submit">Logout</button>
      </form>
      {% else %}
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/ tests/unit/ -v
```

Expected: all 61 tests PASS

- [ ] **Step 3: Commit**

```bash
git add templates/base.html
git commit -m "feat: add Bootstrap Icons and profile nav link"
```
