# Phase 2 Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable offline completion of simple chores (no questions) via IndexedDB queuing with Alpine optimistic UI, syncing to the server when reconnected.

**Architecture:** A standalone `pending-completions.js` IndexedDB module is exposed as `window.PendingCompletions`. An `offline-complete.js` orchestrator intercepts HTMX form submissions when offline, queues them, dispatches Alpine events for optimistic UI, and syncs on reconnect. The service worker adds a Background Sync handler as a secondary sync path. Chores with questions remain question-button-disabled offline (too complex to queue answers).

**Tech Stack:** IndexedDB, Alpine.js 3 (already loaded), HTMX 1.9 `htmx:beforeRequest`, Service Worker Background Sync API, Playwright E2E tests.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `static/js/pending-completions.js` | Create | IndexedDB CRUD: `queueCompletion`, `getPending`, `removePending` |
| `static/js/offline-complete.js` | Create | HTMX intercept, Alpine event dispatch, online sync, DOMContentLoaded restore, Background Sync registration |
| `templates/chores/_chore_card.html` | Modify | Alpine `x-data`, Syncing... button, form with `data-offline-intercept` + `data-chore-id`, `data-offline-disable` on question button |
| `templates/base.html` | Modify | Replace global button-disable with targeted `data-offline-disable` disable; add `{% block extra_scripts %}` |
| `templates/chores/dashboard.html` | Modify | Load the two new JS files via `extra_scripts` block |
| `static/js/service-worker.js` | Modify | Add `sync` event handler; update `CACHE_NAME` to `tasks-harmony-v2` |
| `tests/e2e/test_offline.py` | Modify | Update cache-name assertion; update disabled-button test; add Phase 2 flow tests |

---

### Task 1: IndexedDB Pending-Completions Module

**Files:**
- Create: `static/js/pending-completions.js`

- [ ] **Step 1: Write the module**

```javascript
// static/js/pending-completions.js
const _DB_NAME = 'tasks-harmony-pending';
const _DB_VERSION = 1;
const _STORE = 'pending-completions';

function _openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_DB_NAME, _DB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(_STORE, { keyPath: 'choreId' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

window.PendingCompletions = {
  async queueCompletion(choreId, completedAt, csrfToken) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readwrite');
      tx.objectStore(_STORE).put({ choreId, completedAt, csrfToken });
      tx.oncomplete = resolve;
      tx.onerror = e => reject(e.target.error);
    });
  },

  async getPending() {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readonly');
      const req = tx.objectStore(_STORE).getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  },

  async removePending(choreId) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readwrite');
      tx.objectStore(_STORE).delete(choreId);
      tx.oncomplete = resolve;
      tx.onerror = e => reject(e.target.error);
    });
  },
};
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la static/js/pending-completions.js
```

Expected: file listed.

- [ ] **Step 3: Write a Playwright smoke test for IDB operations**

In `tests/e2e/test_offline.py`, add at the top (after existing imports):

```python
@pytest.mark.django_db(transaction=True)
def test_pending_completions_idb_roundtrip(page: Page, live_server, context):
    """Verify IndexedDB module exposes queueCompletion / getPending / removePending."""
    user, pw = create_test_user("e2e_idb1")
    login_browser(page, live_server.url, "e2e_idb1", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""async () => {
        await window.PendingCompletions.queueCompletion(42, '2026-01-01T00:00:00Z', 'tok');
        const before = await window.PendingCompletions.getPending();
        await window.PendingCompletions.removePending(42);
        const after = await window.PendingCompletions.getPending();
        return { before, after };
    }""")
    assert result["before"] == [{"choreId": 42, "completedAt": "2026-01-01T00:00:00Z", "csrfToken": "tok"}]
    assert result["after"] == []
```

- [ ] **Step 4: Run the test — it should FAIL** (module not loaded yet)

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_pending_completions_idb_roundtrip -v 2>&1 | tail -20
```

Expected: `FAILED` — `AttributeError: Cannot read properties of undefined (reading 'queueCompletion')`

- [ ] **Step 5: Commit**

```bash
git add static/js/pending-completions.js tests/e2e/test_offline.py
git commit -m "feat: IndexedDB pending-completions module + smoke test"
```

---

### Task 2: Update base.html — Targeted Offline Disable + extra_scripts Block

**Files:**
- Modify: `templates/base.html`

The current Phase 1 global `offline` handler disables ALL `button[type="submit"]` and `.btn-primary` buttons. Phase 2 replaces this with targeted disabling (only elements with `data-offline-disable`) and adds an `{% block extra_scripts %}` slot for page-specific JS.

- [ ] **Step 1: Replace the inline offline script in base.html**

Find this block in `templates/base.html`:
```javascript
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
```

Replace with:
```javascript
    window.addEventListener('offline', () => {
      document.querySelectorAll('[data-offline-disable]').forEach(btn => {
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
```

- [ ] **Step 2: Add extra_scripts block at the end of body (before `</body>`)**

After the closing `</script>` of the existing inline script block, add:
```html
  {% block extra_scripts %}{% endblock %}
```

- [ ] **Step 3: Run existing offline tests — the button-disabled test will FAIL (expected)**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_complete_button_disabled_when_offline -v 2>&1 | tail -10
```

Expected: `FAILED` — button no longer disabled (no `data-offline-disable` on the chore card yet). This failure confirms the template change works.

- [ ] **Step 4: Run the cache test to confirm it still passes**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_offline_dashboard_served_from_cache -v 2>&1 | tail -10
```

Expected: `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add templates/base.html
git commit -m "feat: targeted offline-disable, extra_scripts block in base template"
```

---

### Task 3: Alpine Optimistic UI in Chore Card Template

**Files:**
- Modify: `templates/chores/_chore_card.html`

- [ ] **Step 1: Rewrite the chore card template**

Replace the entire contents of `templates/chores/_chore_card.html` with:

```html
{% load chore_tags %}
<div class="col" id="chore-{{ instance.pk }}"
     x-data="{ pending: false }"
     @mark-pending="pending = true">
  <div class="card h-100 {% if status.value == 'overdue' %}border-danger{% elif status.value == 'due' %}border-warning{% elif status.value == 'completed' %}border-success{% else %}border-secondary{% endif %}">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span>{{ instance.definition.name }}</span>
      <div class="d-flex align-items-center gap-2">
        <span class="badge {% if status.value == 'overdue' %}bg-danger{% elif status.value == 'due' %}bg-warning text-dark{% elif status.value == 'completed' %}bg-success{% else %}bg-secondary{% endif %}"
              :class="pending ? 'bg-info text-dark' : ''">
          <span x-show="!pending">{{ status.value|title }}</span>
          <span x-show="pending" style="display:none">Pending</span>
        </span>
        <div class="dropdown">
          <button class="btn btn-light px-2" type="button"
                  data-bs-toggle="dropdown" aria-expanded="false" aria-label="Card options">
            ⋮
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li>
              <button class="dropdown-item"
                hx-get="{% url 'chore_edit' instance.definition.pk %}"
                hx-target="#chore-form-modal-content"
                hx-on::after-request="bootstrap.Modal.getInstance(document.getElementById('question-modal'))?.hide(); bootstrap.Modal.getOrCreateInstance(document.getElementById('chore-form-modal')).show()">
                Edit
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="card-body">
      <p class="card-text small text-muted">Streak: {{ instance.streak_count }} &nbsp;|&nbsp; {% xp_preview instance %} XP</p>
      {% if status.value == 'overdue' or status.value == 'due' %}
        <div class="d-flex justify-content-end">
          {% if instance.definition.questions.exists %}
            <button class="btn btn-primary btn-sm"
                    data-offline-disable
                    hx-get="{% url 'chore_questions' instance.pk %}"
                    hx-target="#question-modal-content"
                    hx-on::after-request="bootstrap.Modal.getOrCreateInstance(document.getElementById('question-modal')).show()">
              Complete
            </button>
          {% else %}
            <button x-show="pending" style="display:none"
                    class="btn btn-secondary btn-sm" disabled>Syncing&hellip;</button>
            <form x-show="!pending"
                  hx-post="{% url 'chore_complete' instance.pk %}"
                  hx-target="#chore-{{ instance.pk }}"
                  hx-swap="outerHTML"
                  data-offline-intercept
                  data-chore-id="{{ instance.pk }}">
              {% csrf_token %}
              <input type="hidden" name="completed_at" class="js-now">
              <button class="btn btn-primary btn-sm" type="submit">Complete</button>
            </form>
          {% endif %}
        </div>
      {% endif %}
    </div>
  </div>
</div>
<script>
  document.querySelectorAll('.js-now').forEach(el => el.value = new Date().toISOString());
</script>
```

- [ ] **Step 2: Write a Playwright test verifying Alpine state on mark-pending**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_card_shows_syncing_on_mark_pending_event(page: Page, live_server, context):
    """Dispatching mark-pending on the card div switches it to Syncing... state."""
    user, pw = create_test_user("e2e_alpine1")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Alpine Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_alpine1", pw)
    page.wait_for_load_state("networkidle")

    instance = ChoreInstance.objects.get(owner=user)
    card_id = f"chore-{instance.pk}"

    # Before event: form visible, Syncing button hidden
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_visible()
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_hidden()

    # Dispatch mark-pending directly on the card div
    page.evaluate(f"""
        document.getElementById('{card_id}').dispatchEvent(new CustomEvent('mark-pending'))
    """)

    # After event: Syncing visible, form hidden
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_visible()
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_hidden()
```

- [ ] **Step 3: Run the new test — it should FAIL** (scripts not loaded yet, Alpine not wired)

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_card_shows_syncing_on_mark_pending_event -v 2>&1 | tail -15
```

Expected: `FAILED` — dashboard loads the scripts only after Task 5; Alpine won't be wired on the card because `x-data` is only live after scripts are included.

- [ ] **Step 4: Commit**

```bash
git add templates/chores/_chore_card.html tests/e2e/test_offline.py
git commit -m "feat: Alpine optimistic UI on chore card (pending state)"
```

---

### Task 4: Offline Intercept + Online Sync Module

**Files:**
- Create: `static/js/offline-complete.js`

This module orchestrates everything: intercept offline HTMX requests, queue to IDB, dispatch Alpine events, sync on reconnect, restore pending state on page load.

- [ ] **Step 1: Write the module**

```javascript
// static/js/offline-complete.js
// Depends on window.PendingCompletions (pending-completions.js loaded first).

async function _syncPending() {
  const pending = await window.PendingCompletions.getPending();
  if (!pending.length) return;

  let anySuccess = false;
  for (const { choreId, completedAt, csrfToken } of pending) {
    try {
      const resp = await fetch(`/chores/${choreId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          completed_at: completedAt,
          csrfmiddlewaretoken: csrfToken,
        }),
      });
      if (resp.ok) {
        await window.PendingCompletions.removePending(choreId);
        anySuccess = true;
      }
    } catch (_) {
      // Network still down or server error — leave in IDB.
    }
  }

  if (anySuccess) location.reload();
}

// Intercept HTMX form submissions when offline.
document.addEventListener('htmx:beforeRequest', async (e) => {
  const form = e.detail.elt;
  if (!form.dataset || !('offlineIntercept' in form.dataset)) return;
  if (navigator.onLine) return;

  e.preventDefault();

  const choreId = parseInt(form.dataset.choreId, 10);
  const tsInput = form.querySelector('[name=completed_at]');
  if (!tsInput.value) tsInput.value = new Date().toISOString();
  const completedAt = tsInput.value;
  const csrfToken = form.querySelector('[name=csrfmiddlewaretoken]').value;

  await window.PendingCompletions.queueCompletion(choreId, completedAt, csrfToken);

  // Register Background Sync so the SW can trigger sync when connection returns.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-completions');
    } catch (_) {}
  }

  const card = document.getElementById(`chore-${choreId}`);
  if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
});

// Sync when the page comes back online.
window.addEventListener('online', _syncPending);

// Listen for Background Sync trigger from the service worker.
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', ({ data }) => {
    if (data && data.type === 'SYNC_COMPLETIONS') _syncPending();
  });
}

// On page load: restore pending visual state, then sync if online.
document.addEventListener('DOMContentLoaded', async () => {
  const pending = await window.PendingCompletions.getPending();
  for (const { choreId } of pending) {
    const card = document.getElementById(`chore-${choreId}`);
    if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
  }
  if (navigator.onLine && pending.length > 0) {
    await _syncPending();
  }
});
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la static/js/offline-complete.js
```

- [ ] **Step 3: Commit**

```bash
git add static/js/offline-complete.js
git commit -m "feat: offline intercept + online sync module"
```

---

### Task 5: Dashboard Template — Load Phase 2 Scripts

**Files:**
- Modify: `templates/chores/dashboard.html`

- [ ] **Step 1: Add extra_scripts block to dashboard.html**

Append to `templates/chores/dashboard.html` (inside the template, after `{% endblock %}`):

The file currently ends with:
```html
{% endblock %}
```

Add a new block after it:
```html
{% block extra_scripts %}
<script src="/static/js/pending-completions.js"></script>
<script src="/static/js/offline-complete.js"></script>
{% endblock %}
```

- [ ] **Step 2: Run the Alpine state test — now it should PASS**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_card_shows_syncing_on_mark_pending_event -v 2>&1 | tail -10
```

Expected: `PASSED`.

- [ ] **Step 3: Run the IDB roundtrip test — now it should PASS**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_pending_completions_idb_roundtrip -v 2>&1 | tail -10
```

Expected: `PASSED`.

- [ ] **Step 4: Write and run the offline complete → Syncing… E2E test**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_offline_simple_complete_shows_syncing(page: Page, live_server, context):
    """Clicking Complete while offline queues to IDB and shows Syncing... state."""
    user, pw = create_test_user("e2e_sync1")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Sync Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync1", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")

    page.locator("button:has-text('Complete')").click()

    instance = ChoreInstance.objects.get(owner=user)
    card = page.locator(f"#chore-{instance.pk}")
    expect(card.locator("button:has-text('Syncing')")).to_be_visible()
    expect(card.locator("form[data-offline-intercept]")).to_be_hidden()

    # IDB has the queued entry
    pending = page.evaluate("window.PendingCompletions.getPending()")
    assert len(pending) == 1
    assert pending[0]["choreId"] == instance.pk

    context.set_offline(False)
```

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_offline_simple_complete_shows_syncing -v 2>&1 | tail -15
```

Expected: `PASSED`.

- [ ] **Step 5: Write and run the offline complete → sync on reconnect test**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_offline_complete_syncs_on_reconnect(page: Page, live_server, context):
    """Coming back online syncs IDB entries and reloads the page showing Completed."""
    user, pw = create_test_user("e2e_sync2")
    from django.utils import timezone
    from chores.models import ChoreCompletion
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Reconnect Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync2", pw)
    page.wait_for_load_state("networkidle")

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()

    instance = ChoreInstance.objects.get(owner=user)
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()

    # Come back online — page should reload and show Completed
    context.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_load_state("networkidle")

    # Server recorded the completion
    assert ChoreCompletion.objects.filter(instance=instance).exists()

    # Card shows Completed badge
    expect(page.locator(f"#chore-{instance.pk} .badge:has-text('Completed')")).to_be_visible()

    # IDB is empty
    pending = page.evaluate("window.PendingCompletions.getPending()")
    assert pending == []
```

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py::test_offline_complete_syncs_on_reconnect -v 2>&1 | tail -15
```

Expected: `PASSED`.

- [ ] **Step 6: Commit**

```bash
git add templates/chores/dashboard.html tests/e2e/test_offline.py
git commit -m "feat: load offline-complete scripts in dashboard; offline complete E2E tests"
```

---

### Task 6: Service Worker — Background Sync Handler + Cache Name Bump

**Files:**
- Modify: `static/js/service-worker.js`
- Modify: `tests/e2e/test_offline.py` (update cache name assertion)

- [ ] **Step 1: Update service-worker.js**

Replace the entire file with:

```javascript
const CACHE_NAME = 'tasks-harmony-v2';
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

// Background Sync: ping open page clients to trigger syncPending().
self.addEventListener('sync', event => {
  if (event.tag === 'sync-completions') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(clients =>
          Promise.all(clients.map(c => c.postMessage({ type: 'SYNC_COMPLETIONS' })))
        )
    );
  }
});
```

- [ ] **Step 2: Update cache-name assertion in the existing test**

In `tests/e2e/test_offline.py`, find:
```python
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v1').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )
```

Replace with:
```python
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )
```

- [ ] **Step 3: Also update the button-disabled test to match Phase 2 behavior**

The existing test `test_complete_button_disabled_when_offline` uses a chore without questions. After Phase 2, that button is intercepted (not disabled). Update the test:

Find:
```python
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

Replace with two tests — one for question-based chores (still disabled) and one confirming simple chore button is now intercepted not disabled:

```python
@pytest.mark.django_db(transaction=True)
def test_question_complete_button_disabled_when_offline(page: Page, live_server, context):
    """Complete button for chores with questions is still disabled offline."""
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    from chores.models import Question
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Question Chore", xp_size="S", recurrence=rrule)
    Question.objects.create(definition=defn, text="How was it?", type="TEXT", order=1)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    expect(page.locator("button[data-offline-disable]:has-text('Complete')")).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_simple_complete_button_not_disabled_when_offline(page: Page, live_server, context):
    """Simple (no-questions) Complete button is NOT disabled offline — it's intercepted."""
    user, pw = create_test_user("e2e_offline3")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Simple Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline3", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    complete_btn = page.locator("form[data-offline-intercept] button:has-text('Complete')")
    expect(complete_btn).to_be_enabled()
    context.set_offline(False)
```

- [ ] **Step 4: Write a pending-restore-on-reload test**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_offline_pending_state_restored_after_reload(page: Page, live_server, context):
    """After offline complete + page reload (from SW cache), card still shows Syncing..."""
    user, pw = create_test_user("e2e_sync3")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Persist Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync3", pw)
    # Navigate once to warm the SW cache
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    instance = ChoreInstance.objects.get(owner=user)

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()

    # Reload while offline (served from SW cache)
    page.reload(wait_until="domcontentloaded")

    # Syncing... state should be restored from IDB on DOMContentLoaded
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()
    expect(page.locator(f"#chore-{instance.pk} form[data-offline-intercept]")).to_be_hidden()

    context.set_offline(False)
```

- [ ] **Step 5: Run all offline tests**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/e2e/test_offline.py -v 2>&1 | tail -30
```

Expected: all tests `PASSED`.

- [ ] **Step 6: Run the full integration test suite**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/integration/ -v 2>&1 | tail -20
```

Expected: all `PASSED`.

- [ ] **Step 7: Commit**

```bash
git add static/js/service-worker.js tests/e2e/test_offline.py
git commit -m "feat: Background Sync handler in SW, cache v2, update offline E2E tests"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run the complete test suite**

```bash
docker exec tasks-harmony-web-1 python -m pytest tests/ -v 2>&1 | tail -40
```

Expected: all tests pass. Note any failures and investigate before proceeding.

- [ ] **Step 2: Manual smoke test**

1. Open the dashboard in a browser
2. Open DevTools → Application → Service Workers: confirm `tasks-harmony-v2` cache exists
3. DevTools → Network → Offline
4. Click Complete on a simple chore: see "Syncing…" badge and button appear immediately
5. DevTools → Network → Online
6. Confirm page reloads and card shows "Completed"
7. Repeat with a chore that has questions: confirm Complete button is grayed out offline

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phase 2 offline complete — IDB queue, optimistic UI, Background Sync"
```

---

## Self-Review

**Spec coverage:**
- IndexedDB queue: Task 1 ✓
- HTMX interception when offline: Task 4 ✓
- Alpine optimistic UI (Syncing…): Task 3 ✓
- Online sync via page `online` event: Task 4 ✓
- Page-load IDB restore: Task 4 ✓
- Background Sync secondary path: Task 4 + Task 6 ✓
- Questions-based chore: still disabled offline ✓
- E2E tests for all flows: Tasks 1, 3, 5, 6 ✓

**Type consistency:**
- `queueCompletion(choreId, completedAt, csrfToken)` — used in Tasks 1 and 4 ✓
- `getPending()` returns `[{ choreId, completedAt, csrfToken }]` — consumed in Tasks 4 and test assertions ✓
- `removePending(choreId)` — called after successful sync in Task 4 ✓
- `data-offline-intercept` attribute — set in Task 3, read in Task 4 ✓
- `data-chore-id` attribute — set in Task 3, read in Task 4 ✓
- `data-offline-disable` attribute — set in Task 3, targeted by base.html handler in Task 2 ✓
- `mark-pending` CustomEvent — dispatched in Task 4, received by `@mark-pending` in Task 3 ✓
- `CACHE_NAME = 'tasks-harmony-v2'` — set in Task 6, asserted in Task 6 test update ✓
