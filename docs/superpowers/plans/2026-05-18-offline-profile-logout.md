# Offline Profile & Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four offline improvements: bump SW cache to v3 (adding login page to APP_SHELL), warm the profile page cache from the dashboard, make the profile page read-only while offline, and enable offline logout that auto-completes server-side on reconnect.

**Architecture:** The service worker's APP_SHELL gains `/accounts/login/` so a cached login page is always available. The dashboard pre-fetches the profile page via a one-liner fetch so the SW caches it dynamically. The profile template disables its forms when offline and reloads on reconnect (fresh CSRF required). The logout form intercepts offline submits, sets a localStorage flag, and navigates to the cached login page; the login page script completes the real server logout as soon as the browser is back online.

**Tech Stack:** Django 5, Playwright E2E tests (pytest-playwright), Vanilla JS (no new libraries), Service Worker Cache API, localStorage.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `static/js/service-worker.js` | Modify | Bump cache to v3; add `/accounts/login/` to APP_SHELL |
| `templates/chores/dashboard.html` | Modify | Pre-fetch profile URL on page load when online |
| `templates/accounts/profile.html` | Modify | Add `{% block extra_scripts %}` with offline read-only logic |
| `templates/base.html` | Modify | Add `id="logout-form"` to logout form; add offline logout interceptor to inline `<script>` |
| `templates/accounts/login.html` | Modify | Add `{% block extra_scripts %}` with pending-logout completion logic |
| `tests/e2e/test_offline.py` | Modify | Update two `'tasks-harmony-v2'` references to `'tasks-harmony-v3'`; add 7 new tests |

---

### Task 1: Bump SW cache to v3 + add login page to APP_SHELL

**Files:**
- Modify: `static/js/service-worker.js:1-8`
- Modify: `tests/e2e/test_offline.py:69` and `tests/e2e/test_offline.py:265`
- Test: `tests/e2e/test_offline.py`

- [ ] **Step 1: Write the failing test**

Append the following test at the bottom of `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_login_page_in_app_shell_cache(page: Page, live_server, context):
    """Login page is pre-cached in APP_SHELL so offline logout redirect works."""
    user, pw = create_test_user("e2e_shell1")
    login_browser(page, live_server.url, "e2e_shell1", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_login_page_in_app_shell_cache -x
```

Expected: FAIL — `TimeoutError` waiting for the v3 cache / login entry (cache is still v2 and does not include the login URL).

- [ ] **Step 3: Update existing v2 references in the test file**

In `tests/e2e/test_offline.py` line 69, change:

```python
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
```

to:

```python
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/').then(r => !!r))",
```

In `tests/e2e/test_offline.py` line 265, change:

```python
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
```

to:

```python
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/').then(r => !!r))",
```

- [ ] **Step 4: Update the service worker**

In `static/js/service-worker.js`, replace lines 1–8:

```javascript
const CACHE_NAME = 'tasks-harmony-v2';
const APP_SHELL = [
  '/',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
];
```

with:

```javascript
const CACHE_NAME = 'tasks-harmony-v3';
const APP_SHELL = [
  '/',
  '/accounts/login/',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
];
```

The rest of `service-worker.js` (lines 10–51) is unchanged.

- [ ] **Step 5: Run the full offline test suite to verify all tests pass**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py -v
```

Expected: all existing tests pass (the two updated v2→v3 references now match the new cache name) and the new `test_login_page_in_app_shell_cache` passes.

- [ ] **Step 6: Commit**

```bash
git add static/js/service-worker.js tests/e2e/test_offline.py
git commit -m "feat: bump SW cache to v3, add /accounts/login/ to APP_SHELL"
```

---

### Task 2: Profile page cache warming from dashboard

**Files:**
- Modify: `templates/chores/dashboard.html:41-44`
- Test: `tests/e2e/test_offline.py`

- [ ] **Step 1: Write the failing test**

Append the following test at the bottom of `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_profile_cached_after_dashboard_load(page: Page, live_server, context):
    """Profile page is cached by the SW background fetch on dashboard load."""
    user, pw = create_test_user("e2e_prof_warm1")
    login_browser(page, live_server.url, "e2e_prof_warm1", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_profile_cached_after_dashboard_load -x
```

Expected: FAIL — `TimeoutError` because the profile URL has not been fetched and cached.

- [ ] **Step 3: Add the warming fetch to dashboard.html**

In `templates/chores/dashboard.html`, the `{% block extra_scripts %}` currently reads:

```html
{% block extra_scripts %}
<script src="/static/js/pending-completions.js"></script>
<script src="/static/js/offline-complete.js"></script>
{% endblock %}
```

Replace it with:

```html
{% block extra_scripts %}
<script src="/static/js/pending-completions.js"></script>
<script src="/static/js/offline-complete.js"></script>
<script>
  if (navigator.onLine) fetch('/accounts/profile/').catch(() => {});
</script>
{% endblock %}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_profile_cached_after_dashboard_load -x
```

Expected: PASS.

- [ ] **Step 5: Run the full offline suite to verify no regressions**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add templates/chores/dashboard.html tests/e2e/test_offline.py
git commit -m "feat: pre-fetch /accounts/profile/ from dashboard for offline cache warming"
```

---

### Task 3: Profile page offline read-only

**Files:**
- Modify: `templates/accounts/profile.html:68` (add `{% block extra_scripts %}` after `{% endblock %}`)
- Test: `tests/e2e/test_offline.py`

**Context:** The profile page has two `<form method="post">` elements — one for personal info (submit button text "Save") and one for change password ("Change Password"). When offline, all `form input`, `form select`, `form textarea`, and `form button[type=submit]` elements must be disabled. Returning online triggers `location.reload()` to obtain a fresh CSRF token rather than trying to re-enable forms in place.

- [ ] **Step 1: Write the three failing tests**

Append the following three tests at the bottom of `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_profile_inputs_disabled_when_loaded_offline(page: Page, live_server, context):
    """Profile form inputs/buttons are disabled when page is loaded while offline."""
    user, pw = create_test_user("e2e_prof_ro1")
    login_browser(page, live_server.url, "e2e_prof_ro1", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("form button[type=submit]").first).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_profile_inputs_disabled_on_going_offline(page: Page, live_server, context):
    """Profile form inputs/buttons are disabled when going offline while on the page."""
    user, pw = create_test_user("e2e_prof_ro2")
    login_browser(page, live_server.url, "e2e_prof_ro2", pw)
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    expect(page.locator("form button[type=submit]").first).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_profile_reloads_on_reconnect(page: Page, live_server, context):
    """Going back online on the profile page triggers a reload (refreshes stale CSRF)."""
    user, pw = create_test_user("e2e_prof_ro3")
    login_browser(page, live_server.url, "e2e_prof_ro3", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")

    context.set_offline(False)
    with page.expect_navigation(timeout=6000):
        page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_load_state("networkidle")
    expect(page.locator("form button[type=submit]").first).to_be_enabled()
```

- [ ] **Step 2: Run the three tests to verify they fail**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_profile_inputs_disabled_when_loaded_offline tests/e2e/test_offline.py::test_profile_inputs_disabled_on_going_offline tests/e2e/test_offline.py::test_profile_reloads_on_reconnect -x
```

Expected: FAIL — buttons are not disabled because no offline logic exists yet in the profile template.

- [ ] **Step 3: Add the offline read-only script block to profile.html**

`templates/accounts/profile.html` currently ends at line 68 with `{% endblock %}` (the content block). Append a new `{% block extra_scripts %}` block after it. The full file after the change:

```html
{% extends "base.html" %}
{% load chore_tags %}
{% block title %}Profile{% endblock %}
{% block content %}
<div class="row justify-content-center">
  <div class="col-lg-7">
    <h2 class="mb-4">Profile</h2>

    {% for message in messages %}
      <div class="alert alert-success alert-dismissible fade show py-2">{{ message }}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>
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
          <span>{{ request.user.profile.total_xp }} XP</span>
        </li>
        <li class="list-group-item d-flex justify-content-between">
          <span class="text-muted">XP Settings</span>
          <span>
            {% with s=request.user.profile.xp_settings %}
              {% if s %}{{ s.name }}{% else %}—{% endif %}
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
{% block extra_scripts %}
<script>
  function _setProfileFormsDisabled(disabled) {
    document.querySelectorAll('form input, form select, form textarea, form button[type=submit]').forEach(function(el) {
      el.disabled = disabled;
    });
  }
  document.addEventListener('DOMContentLoaded', function() {
    if (!navigator.onLine) _setProfileFormsDisabled(true);
  });
  window.addEventListener('offline', function() { _setProfileFormsDisabled(true); });
  window.addEventListener('online', function() { location.reload(); });
</script>
{% endblock %}
```

- [ ] **Step 4: Run the three tests to verify they pass**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_profile_inputs_disabled_when_loaded_offline tests/e2e/test_offline.py::test_profile_inputs_disabled_on_going_offline tests/e2e/test_offline.py::test_profile_reloads_on_reconnect -x
```

Expected: all three PASS.

- [ ] **Step 5: Run the full offline suite to verify no regressions**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add templates/accounts/profile.html tests/e2e/test_offline.py
git commit -m "feat: profile page offline read-only — disable forms offline, reload on reconnect"
```

---

### Task 4: Offline logout

**Files:**
- Modify: `templates/base.html:29-32` (logout form) and `templates/base.html:50-84` (inline `<script>`)
- Modify: `templates/accounts/login.html:1-19`
- Test: `tests/e2e/test_offline.py`

**Context:** The offline logout flow works in two phases. Phase 1 (offline): the logout form submit is intercepted, `'offline_logout_pending'` is stored in `localStorage`, and the browser navigates to `/accounts/login/` (which is already in the SW APP_SHELL cache). Phase 2 (back online): the login page script detects the flag, GETs the login page to refresh the CSRF cookie, then POSTs to `/accounts/logout/` with the fresh token. `SESSION_COOKIE_HTTPONLY` defaults to True so the session cookie cannot be read or deleted from JS; a real server-side POST is required. `CSRF_COOKIE_HTTPONLY` defaults to False so `csrftoken` is readable from `document.cookie`.

- [ ] **Step 1: Write the two failing tests**

Append the following two tests at the bottom of `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_offline_logout_redirects_to_login_with_flag(page: Page, live_server, context):
    """Clicking Logout offline navigates to the cached login page and sets the pending flag."""
    user, pw = create_test_user("e2e_logout1")
    login_browser(page, live_server.url, "e2e_logout1", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    assert page.evaluate("localStorage.getItem('offline_logout_pending')") == '1'
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_logout_completes_server_side_on_reconnect(page: Page, live_server, context):
    """After offline logout, going online auto-submits real logout; flag is cleared and profile is inaccessible."""
    user, pw = create_test_user("e2e_logout2")
    login_browser(page, live_server.url, "e2e_logout2", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v3').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    context.set_offline(False)
    # Wait for auto-logout flag to clear (login page script submits real logout then reloads)
    page.wait_for_function("() => !localStorage.getItem('offline_logout_pending')", timeout=10000)

    # Server session is now cleared — profile requires login
    page.goto(f"{live_server.url}/accounts/profile/")
    assert "/accounts/login/" in page.url
```

- [ ] **Step 2: Run the two tests to verify they fail**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_offline_logout_redirects_to_login_with_flag tests/e2e/test_offline.py::test_offline_logout_completes_server_side_on_reconnect -x
```

Expected: FAIL — the logout form has no `id`, no offline interceptor exists, and the login page has no pending-logout handler.

- [ ] **Step 3: Update base.html — add id to logout form and offline interceptor**

In `templates/base.html`, change the logout form (lines 29–32) from:

```html
          <form method="post" action="{% url 'logout' %}">
            {% csrf_token %}
            <button class="btn btn-outline-light btn-sm rounded-start-0" style="margin-left:-1px" type="submit">Logout</button>
          </form>
```

to:

```html
          <form id="logout-form" method="post" action="{% url 'logout' %}">
            {% csrf_token %}
            <button class="btn btn-outline-light btn-sm rounded-start-0" style="margin-left:-1px" type="submit">Logout</button>
          </form>
```

Then, in the inline `<script>` block of `templates/base.html`, add the offline logout interceptor immediately after the existing `window.addEventListener('online', ...)` handler (after line 73, before the `// Clean up Bootstrap modal backdrop` comment). The full inline `<script>` block after the change:

```html
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js');
    }
    window.addEventListener('offline', () => {
      document.getElementById('offline-banner').style.display = '';
      document.querySelectorAll('[data-offline-disable]').forEach(btn => {
        btn.disabled = true;
        btn.dataset.offlineDisabled = '1';
        const wrapper = btn.closest('[data-offline-wrapper]');
        if (wrapper) {
          bootstrap.Tooltip.getOrCreateInstance(wrapper, { title: 'Requires a connection' });
        }
      });
    });
    window.addEventListener('online', () => {
      document.getElementById('offline-banner').style.display = 'none';
      document.querySelectorAll('[data-offline-disabled]').forEach(btn => {
        btn.disabled = false;
        delete btn.dataset.offlineDisabled;
        const wrapper = btn.closest('[data-offline-wrapper]');
        if (wrapper) bootstrap.Tooltip.getInstance(wrapper)?.dispose();
      });
    });
    document.getElementById('logout-form')?.addEventListener('submit', function(e) {
      if (!navigator.onLine) {
        e.preventDefault();
        localStorage.setItem('offline_logout_pending', '1');
        location.href = '{% url "login" %}';
      }
    });
    // Clean up Bootstrap modal backdrop when modal is reset via HTMX OOB swap
    document.body.addEventListener('htmx:afterSwap', function() {
      const modal = document.getElementById('question-modal');
      if (modal && !modal.classList.contains('show')) {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    });
  </script>
```

- [ ] **Step 4: Update login.html — add pending logout handler**

`templates/accounts/login.html` currently has no `{% block extra_scripts %}`. Replace the full file content with:

```html
{% extends "base.html" %}
{% load chore_tags %}
{% block title %}Login{% endblock %}
{% block content %}
<div class="row justify-content-center">
  <div class="col-md-4">
    <h2 class="mb-3">Login</h2>
    <form method="post">
      {% csrf_token %}
      {% for error in form.non_field_errors %}
        <div class="alert alert-danger py-2">{{ error }}</div>
      {% endfor %}
      {% for field in form %}{% bs_field field %}{% endfor %}
      <button class="btn btn-primary w-100" type="submit">Login</button>
    </form>
    <p class="mt-2 text-center"><a href="{% url 'register' %}">Create account</a></p>
  </div>
</div>
{% endblock %}
{% block extra_scripts %}
<script>
  (function () {
    if (!localStorage.getItem('offline_logout_pending')) return;

    async function completeLogout() {
      try {
        await fetch('{% url "login" %}');
        var csrf = document.cookie.split(';').map(function(c) { return c.trim(); })
          .find(function(c) { return c.startsWith('csrftoken='); })
          ?.split('=')[1];
        if (csrf) {
          await fetch('{% url "logout" %}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ csrfmiddlewaretoken: csrf }),
            redirect: 'manual',
          });
        }
      } finally {
        localStorage.removeItem('offline_logout_pending');
        location.reload();
      }
    }

    if (navigator.onLine) {
      completeLogout();
    } else {
      window.addEventListener('online', completeLogout, { once: true });
    }
  })();
</script>
{% endblock %}
```

- [ ] **Step 5: Run the two tests to verify they pass**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_offline_logout_redirects_to_login_with_flag tests/e2e/test_offline.py::test_offline_logout_completes_server_side_on_reconnect -x
```

Expected: both PASS.

- [ ] **Step 6: Run the full offline suite to verify no regressions**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add templates/base.html templates/accounts/login.html tests/e2e/test_offline.py
git commit -m "feat: offline logout — intercept in base.html, auto-complete on login page reconnect"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| Bump SW cache to v3 | Task 1 Step 4 |
| Add `/accounts/login/` to APP_SHELL | Task 1 Step 4 |
| Update existing tests from v2 to v3 | Task 1 Step 3 |
| Dashboard pre-fetches `/accounts/profile/` | Task 2 Step 3 |
| Profile page disabled when loaded offline | Task 3 Step 3 (`DOMContentLoaded` + `!navigator.onLine` check) |
| Profile page disabled when going offline while on page | Task 3 Step 3 (`window 'offline'` listener) |
| Profile page reloads on reconnect | Task 3 Step 3 (`window 'online'` → `location.reload()`) |
| Offline logout stores `'offline_logout_pending'` in localStorage | Task 4 Step 3 |
| Offline logout navigates to cached login page | Task 4 Step 3 |
| Login page auto-completes real logout on reconnect | Task 4 Step 4 |
| Login page clears the localStorage flag after completing | Task 4 Step 4 (`finally` block) |

### Placeholder scan

No "TBD", "TODO", "similar to Task N", or vague instructions found. Every step contains the exact code or command needed.

### Type / name consistency

- Cache name `'tasks-harmony-v3'` used consistently in `service-worker.js` and all test `caches.open(...)` calls.
- `id="logout-form"` set in `base.html` form; `#logout-form` selector used in both the JS interceptor and the two new E2E tests.
- `'offline_logout_pending'` key used consistently between `base.html` (set), `login.html` (read / remove), and both E2E tests (assert / wait).
- `_setProfileFormsDisabled` defined and called only within the profile template's own script block — no cross-file dependency.
- `completeLogout` is a local function inside an IIFE in `login.html` — no global namespace conflict.
