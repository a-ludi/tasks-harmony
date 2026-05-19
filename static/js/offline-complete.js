// static/js/offline-complete.js
// Depends on window.PendingCompletions (pending-completions.js loaded first).

let _syncing = false;

function _isOfflineModeActive() {
  if (!navigator.onLine) return true;
  const banner = document.getElementById('offline-banner');
  return !!banner && banner.style.display !== 'none';
}

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

async function _queueAndMarkPending(choreId, completedAt, csrfToken, answers) {
  await window.PendingCompletions.queueCompletion(choreId, completedAt, csrfToken, answers);

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-completions');
    } catch (_) {}
  }

  const card = document.getElementById(`chore-${choreId}`);
  if (card) card.dispatchEvent(new CustomEvent('mark-pending'));
}

// Intercept HTMX form submissions when offline.
document.addEventListener('htmx:beforeRequest', async (e) => {
  const form = e.detail.elt;
  if (!form.dataset || !('offlineIntercept' in form.dataset)) return;
  if (!_isOfflineModeActive()) return;

  e.preventDefault();

  const choreId = parseInt(form.dataset.choreId, 10);
  const tsInput = form.querySelector('[name=completed_at]');
  if (!tsInput.value) tsInput.value = new Date().toISOString();
  await _queueAndMarkPending(choreId, tsInput.value, form.querySelector('[name=csrfmiddlewaretoken]').value, null);
});

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

  if (typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getInstance(document.getElementById('question-modal'))?.hide();
  }
  await _queueAndMarkPending(choreId, completedAt, csrfToken, answers);
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
