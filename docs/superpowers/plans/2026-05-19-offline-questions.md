# Offline Completion with Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow chores with questions to be completed offline — storing answers in IndexedDB and syncing to `/chores/{pk}/questions/` when connectivity is restored.

**Architecture:** The existing offline infrastructure (pending-completions.js IDB store, offline-complete.js interceptor, SW background sync) is extended minimally: `queueCompletion` gains an optional `answers` dict, a new `htmx:beforeRequest` branch intercepts the question form, and `_syncPending` picks the right endpoint based on whether answers are present. The question modal is pre-warmed in the SW cache so it can open offline.

**Tech Stack:** JavaScript (ES2019), IndexedDB, Alpine.js, HTMX, Bootstrap modals, Django/Python, Playwright E2E tests.

---

## File Map

| File | Change |
|---|---|
| `static/js/pending-completions.js` | Add optional `answers` param to `queueCompletion` |
| `static/js/offline-complete.js` | Add `_isOfflineModeActive()`, pre-warm question modals, intercept question form, update sync |
| `templates/chores/_chore_card.html` | Remove `data-offline-disable` from question Complete button; add `data-questions-url` |
| `templates/chores/_question_modal.html` | Add `data-offline-intercept-answers` + `data-chore-id` to the form |
| `tests/e2e/test_offline.py` | Replace disabled-button test; add offline submit + sync tests |

---

### Task 1: Extend pending-completions.js to store question answers

**Files:**
- Modify: `static/js/pending-completions.js`

- [ ] **Step 1: Write the failing unit test in E2E (IDB roundtrip with answers)**

Add at end of `test_pending_completions_idb_roundtrip` test (around line 145) — actually write a new standalone test right after it:

```python
@pytest.mark.django_db(transaction=True)
def test_pending_completions_idb_stores_answers(page: Page, live_server, context):
    """queueCompletion stores optional answers dict and getPending returns it."""
    user, pw = create_test_user("e2e_idb_ans1")
    login_browser(page, live_server.url, "e2e_idb_ans1", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""
        async () => {
            await window.PendingCompletions.queueCompletion(
                42, '2026-01-01T00:00:00.000Z', 'tok', { question_7: 'great' }
            );
            const pending = await window.PendingCompletions.getPending();
            const entry = pending.find(p => p.choreId === 42);
            await window.PendingCompletions.removePending(42);
            return entry ? entry.answers : null;
        }
    """)
    assert result == {"question_7": "great"}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_pending_completions_idb_stores_answers -v
```

Expected: FAIL — `queueCompletion` ignores the 4th arg, `answers` is `undefined`/missing.

- [ ] **Step 3: Implement — add `answers` param to `queueCompletion`**

In `static/js/pending-completions.js`, replace the `queueCompletion` method:

```javascript
  async queueCompletion(choreId, completedAt, csrfToken, answers = null) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readwrite');
      const record = { choreId, completedAt, csrfToken };
      if (answers) record.answers = answers;
      tx.objectStore(_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_pending_completions_idb_stores_answers -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static/js/pending-completions.js tests/e2e/test_offline.py
git commit -m "feat: extend PendingCompletions.queueCompletion to store optional answers"
```

---

### Task 2: Add `_isOfflineModeActive()` helper and update offline-complete.js detection

**Files:**
- Modify: `static/js/offline-complete.js`

The existing code uses `navigator.onLine` to decide whether to intercept. We want to use the offline banner state instead — which already reflects the probe result from base.html. This avoids a second async probe in the synchronous HTMX intercept path.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/test_offline.py` — a test that verifies the simple-complete button interception works when `navigator.onLine` is (potentially) true but the probe said offline. We simulate by setting offline mode AND confirming the button behavior works via the banner state:

```python
@pytest.mark.django_db(transaction=True)
def test_offline_intercept_uses_banner_state(page: Page, live_server, context):
    """Offline intercept fires based on banner visibility, not navigator.onLine alone."""
    from django.utils import timezone
    user, pw = create_test_user("e2e_banner_intercept1")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="BannerChore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    login_browser(page, live_server.url, "e2e_banner_intercept1", pw)
    page.wait_for_load_state("networkidle")

    # Simulate: navigator.onLine is True but banner is shown (probe detected offline)
    page.evaluate("""
        document.getElementById('offline-banner').style.display = '';
    """)
    # navigator.onLine is still True; click Complete
    page.locator("form[data-offline-intercept] button:has-text('Complete')").click()
    # IDB should have the pending entry (intercept fired based on banner)
    pending = page.evaluate(
        "window.PendingCompletions.getPending().then(p => p.length)"
    )
    assert pending == 1
    # Cleanup IDB
    chore_id = page.evaluate(
        "window.PendingCompletions.getPending().then(p => p[0]?.choreId)"
    )
    page.evaluate(f"window.PendingCompletions.removePending({chore_id})")
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_offline_intercept_uses_banner_state -v
```

Expected: FAIL — current code uses `navigator.onLine` which is `true`, so intercept doesn't fire, IDB has 0 entries.

- [ ] **Step 3: Add `_isOfflineModeActive()` and update the intercept check**

Replace the top of `static/js/offline-complete.js` (keep `_syncing` + `_syncPending`, only update the intercept and the DOMContentLoaded check):

```javascript
// static/js/offline-complete.js
// Depends on window.PendingCompletions (pending-completions.js loaded first).

let _syncing = false;

function _isOfflineModeActive() {
  if (!navigator.onLine) return true;
  const banner = document.getElementById('offline-banner');
  return !!banner && banner.style.display !== 'none';
}
```

Then in the `htmx:beforeRequest` handler, replace `if (navigator.onLine) return;` with `if (!_isOfflineModeActive()) return;`:

```javascript
// Intercept HTMX form submissions when offline.
document.addEventListener('htmx:beforeRequest', async (e) => {
  const form = e.detail.elt;
  if (!form.dataset || !('offlineIntercept' in form.dataset)) return;
  if (!_isOfflineModeActive()) return;

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
```

Also update the DOMContentLoaded sync guard:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const pending = await window.PendingCompletions.getPending();
  for (const { choreId } of pending) {
    const card = document.getElementById(`chore-${choreId}`);
    if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
  }
  if (!_isOfflineModeActive() && pending.length > 0) {
    await _syncPending();
  }
});
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_offline_intercept_uses_banner_state -v
```

Expected: PASS.

- [ ] **Step 5: Run the full offline test suite to confirm no regressions**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py -v -x
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add static/js/offline-complete.js tests/e2e/test_offline.py
git commit -m "feat: use banner-state for offline intercept instead of navigator.onLine"
```

---

### Task 3: Enable question Complete button offline and pre-warm modal cache

**Files:**
- Modify: `templates/chores/_chore_card.html`
- Modify: `static/js/offline-complete.js` (DOMContentLoaded pre-warm)
- Test: `tests/e2e/test_offline.py`

Currently the question Complete button has `data-offline-disable` so it's disabled when offline. We remove that, add `data-questions-url` for cache pre-warming, and fetch those URLs on dashboard load.

- [ ] **Step 1: Update the existing disabled-button test to assert ENABLED**

In `tests/e2e/test_offline.py`, replace the test `test_question_complete_button_disabled_when_offline` (lines ~91-115) entirely:

```python
@pytest.mark.django_db(transaction=True)
def test_question_complete_button_enabled_when_offline(
    page: Page, live_server, context
):
    """Complete button for question chores is NOT disabled offline — it opens a cached modal."""
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    from chores.models import Question

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Question Chore", xp_size="S", recurrence=rrule
    )
    Question.objects.create(definition=defn, text="How was it?", type="TEXT", order=1)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    # No data-offline-disable on question Complete button — it should stay enabled
    expect(
        page.locator("button:has-text('Complete')")
    ).to_be_enabled()
    context.set_offline(False)
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_complete_button_enabled_when_offline -v
```

Expected: FAIL — button currently has `data-offline-disable` so it's disabled.

- [ ] **Step 3: Remove `data-offline-disable` from question Complete button; add `data-questions-url`**

In `templates/chores/_chore_card.html`, replace the question Complete button (lines 39-47):

```html
          {% if instance.definition.questions.exists %}
            <button class="btn btn-primary btn-sm"
                    data-questions-url="{% url 'chore_questions' instance.pk %}"
                    hx-get="{% url 'chore_questions' instance.pk %}"
                    hx-target="#question-modal-content"
                    hx-on::after-request="bootstrap.Modal.getOrCreateInstance(document.getElementById('question-modal')).show()">
              Complete
            </button>
```

(The surrounding `<span data-offline-wrapper ...>` should be removed too — the whole wrapper block, keeping only the button.)

The full block after the change (lines 38-47 area) becomes:

```html
          {% if instance.definition.questions.exists %}
            <button class="btn btn-primary btn-sm"
                    data-questions-url="{% url 'chore_questions' instance.pk %}"
                    hx-get="{% url 'chore_questions' instance.pk %}"
                    hx-target="#question-modal-content"
                    hx-on::after-request="bootstrap.Modal.getOrCreateInstance(document.getElementById('question-modal')).show()">
              Complete
            </button>
```

- [ ] **Step 4: Add question modal pre-warming to offline-complete.js DOMContentLoaded**

In `static/js/offline-complete.js`, inside the `DOMContentLoaded` handler, add pre-warming before the sync call:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const pending = await window.PendingCompletions.getPending();
  for (const { choreId } of pending) {
    const card = document.getElementById(`chore-${choreId}`);
    if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
  }

  // Pre-warm question modal pages in SW cache so they open when offline.
  if ('serviceWorker' in navigator && !_isOfflineModeActive()) {
    document.querySelectorAll('[data-questions-url]').forEach(btn => {
      fetch(btn.dataset.questionsUrl).catch(() => {});
    });
  }

  if (!_isOfflineModeActive() && pending.length > 0) {
    await _syncPending();
  }
});
```

- [ ] **Step 5: Run tests to confirm button is now enabled**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_complete_button_enabled_when_offline -v
```

Expected: PASS.

- [ ] **Step 6: Run the full suite**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py -v -x
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add templates/chores/_chore_card.html static/js/offline-complete.js tests/e2e/test_offline.py
git commit -m "feat: enable question Complete button offline; pre-warm modal cache"
```

---

### Task 4: Intercept question form submission offline

**Files:**
- Modify: `templates/chores/_question_modal.html`
- Modify: `static/js/offline-complete.js`
- Test: `tests/e2e/test_offline.py`

When offline and the user submits the question form, intercept via HTMX `beforeRequest`, serialize answers into IDB, close the modal, and mark the card as pending.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_question_completion_offline_submit(page: Page, live_server, context):
    """Submitting question form offline stores answers in IDB and marks card Pending."""
    from django.utils import timezone
    from chores.models import Question

    user, pw = create_test_user("e2e_qoffline1")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="QOfflineChore", xp_size="S", recurrence=rrule
    )
    q = Question.objects.create(definition=defn, text="How did it go?", type="TEXT", order=1)
    instance = ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_qoffline1", pw)
    # Warm SW cache: visit dashboard (caches page + pre-warms question modal)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    # Wait for question modal to be pre-warmed in SW cache
    page.wait_for_function(
        f"() => caches.open('tasks-harmony-v5').then(c => c.match('/chores/{instance.pk}/questions/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)

    # Open question modal (served from SW cache)
    page.locator("button:has-text('Complete')").click()
    expect(page.locator("#question-modal")).to_be_visible(timeout=5000)

    # Fill in text answer
    page.locator(f"[name='question_{q.pk}']").fill("Went great!")

    # Submit form — should be intercepted offline
    page.locator("#question-modal .btn-primary[type=submit]").click()

    # Modal should close and card should show Pending badge
    expect(page.locator("#question-modal")).to_be_hidden(timeout=5000)
    expect(page.locator(f"#chore-{instance.pk} .badge")).to_have_text("Pending", timeout=5000)

    # IDB should have the pending entry with answers
    pending = page.evaluate("""
        window.PendingCompletions.getPending().then(p => p.map(e => ({
            choreId: e.choreId, hasAnswers: !!e.answers
        })))
    """)
    assert len(pending) == 1
    assert pending[0]["choreId"] == instance.pk
    assert pending[0]["hasAnswers"] is True

    context.set_offline(False)
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_completion_offline_submit -v
```

Expected: FAIL — modal stays open / form does a full submit (no intercept), IDB is empty.

- [ ] **Step 3: Add `data-offline-intercept-answers` and `data-chore-id` to the question form**

In `templates/chores/_question_modal.html`, update the `<form>` opening tag (line 6):

```html
<form class="d-flex flex-column flex-fill overflow-hidden"
      data-offline-intercept-answers
      data-chore-id="{{ instance.pk }}"
      hx-post="{% url 'chore_questions' instance.pk %}"
      hx-target="#chore-{{ instance.pk }}"
      hx-swap="outerHTML"
      hx-on::after-request="if (!event.detail.xhr.getResponseHeader('HX-Validation-Error')) { bootstrap.Modal.getInstance(document.getElementById('question-modal')).hide(); }">
```

- [ ] **Step 4: Add the question form interceptor to offline-complete.js**

In `static/js/offline-complete.js`, add a second `htmx:beforeRequest` listener **after** the existing simple-complete interceptor:

```javascript
// Intercept question form submissions when offline.
document.addEventListener('htmx:beforeRequest', async (e) => {
  const form = e.detail.elt;
  if (!form.dataset || !('offlineInterceptAnswers' in form.dataset)) return;
  if (!_isOfflineModeActive()) return;

  e.preventDefault();

  const choreId = parseInt(form.dataset.choreId, 10);
  const formData = new FormData(form);
  const completedAt = formData.get('completed_at') || new Date().toISOString();
  const csrfToken = formData.get('csrfmiddlewaretoken');

  const answers = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('question_')) answers[key] = value;
  }

  await window.PendingCompletions.queueCompletion(choreId, completedAt, csrfToken, answers);

  // Register Background Sync.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-completions');
    } catch (_) {}
  }

  // Close the modal and mark card pending.
  bootstrap.Modal.getInstance(document.getElementById('question-modal'))?.hide();
  const card = document.getElementById(`chore-${choreId}`);
  if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
});
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_completion_offline_submit -v
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py -v -x
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add templates/chores/_question_modal.html static/js/offline-complete.js tests/e2e/test_offline.py
git commit -m "feat: intercept question form offline; store answers in IDB"
```

---

### Task 5: Update _syncPending to sync question completions

**Files:**
- Modify: `static/js/offline-complete.js`
- Test: `tests/e2e/test_offline.py`

When syncing, check for the `answers` field: POST to `/chores/{pk}/questions/` if present, else `/chores/{pk}/complete/`. Handle `HX-Validation-Error` by discarding (can't fix headlessly).

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/test_offline.py`:

```python
@pytest.mark.django_db(transaction=True)
def test_question_completion_syncs_after_reconnect(page: Page, live_server, context):
    """Pending question completion POSTs to /questions/ on reconnect and completes the chore."""
    from django.utils import timezone
    from chores.models import Question, ChoreCompletion

    user, pw = create_test_user("e2e_qsync1")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="QSyncChore", xp_size="S", recurrence=rrule
    )
    q = Question.objects.create(definition=defn, text="Rating?", type="TEXT", order=1)
    instance = ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_qsync1", pw)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        f"() => caches.open('tasks-harmony-v5').then(c => c.match('/chores/{instance.pk}/questions/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)

    # Open modal (SW cache), fill answer, submit offline
    page.locator("button:has-text('Complete')").click()
    expect(page.locator("#question-modal")).to_be_visible(timeout=5000)
    page.locator(f"[name='question_{q.pk}']").fill("Excellent")
    page.locator("#question-modal .btn-primary[type=submit]").click()
    expect(page.locator(f"#chore-{instance.pk} .badge")).to_have_text("Pending", timeout=5000)

    # Come back online — sync fires
    context.set_offline(False)
    page.wait_for_function(
        "() => window.PendingCompletions.getPending().then(p => p.length === 0)",
        timeout=15000,
    )

    # Server should have a ChoreCompletion with a CompletionAnswer
    from chores.models import CompletionAnswer
    instance.refresh_from_db()
    assert instance.last_completed_at is not None
    completions = list(instance.completions.all())
    assert len(completions) == 1
    answers = list(completions[0].answers.all())
    assert len(answers) == 1
    assert answers[0].text_value == "Excellent"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_completion_syncs_after_reconnect -v
```

Expected: FAIL — `_syncPending` POSTs to `/chores/{pk}/complete/` (wrong endpoint), no answers saved.

- [ ] **Step 3: Update `_syncPending` to handle question completions**

Replace the `_syncPending` function in `static/js/offline-complete.js`:

```javascript
async function _syncPending() {
  // Guard against concurrent invocations (online event + SW postMessage + DOMContentLoaded
  // can all fire close together and each would POST the same IDB entry before removal).
  if (_syncing) return;
  _syncing = true;
  try {
    const pending = await window.PendingCompletions.getPending();
    if (!pending.length) return;

    let anySuccess = false;
    for (const { choreId, completedAt, csrfToken, answers } of pending) {
      try {
        const url = answers
          ? `/chores/${choreId}/questions/`
          : `/chores/${choreId}/complete/`;
        const body = new URLSearchParams({
          completed_at: completedAt,
          csrfmiddlewaretoken: csrfToken,
          ...(answers || {}),
        });
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        if (resp.ok) {
          // For question completions, a 200 with HX-Validation-Error means answers
          // were invalid. We can't show the modal to fix them, so discard.
          await window.PendingCompletions.removePending(choreId);
          if (!resp.headers.get('HX-Validation-Error')) anySuccess = true;
        } else if (resp.status === 400) {
          // Timestamp too old or other unrecoverable error — discard.
          await window.PendingCompletions.removePending(choreId);
        }
        // Other non-ok statuses (5xx, network error) leave the entry for the next sync.
      } catch (_) {
        // Network still down — leave in IDB.
      }
    }

    if (anySuccess) location.reload();
  } finally {
    _syncing = false;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py::test_question_completion_syncs_after_reconnect -v
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
docker compose run --rm web pytest tests/e2e/test_offline.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add static/js/offline-complete.js tests/e2e/test_offline.py
git commit -m "feat: sync pending question completions to /questions/ endpoint on reconnect"
```
