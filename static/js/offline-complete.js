// static/js/offline-complete.js
// Depends on window.PendingCompletions (pending-completions.js loaded first).

let _syncing = false;

async function _syncPending() {
  // Guard against concurrent invocations (online event + SW postMessage + DOMContentLoaded
  // can all fire close together and each would POST the same IDB entry before removal).
  if (_syncing) return;
  _syncing = true;
  try {
    const pending = await window.PendingCompletions.getPending();
    if (!pending.length) return;

    let anySuccess = false;
    for (const { choreId, completedAt, csrfToken } of pending) {
      try {
        const resp = await fetch(`/chores/${choreId}/complete/`, {
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
        } else if (resp.status === 400) {
          // Server rejected this completion (e.g. timestamp too old >48h). Discard it
          // so the card doesn't stay stuck in Syncing... forever.
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
