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
