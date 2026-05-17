// static/js/pending-completions.js
const _DB_NAME = 'tasks-harmony-pending';
const _DB_VERSION = 1;
const _STORE = 'pending-completions';

// Cached connection — reused across calls; avoids blocking versionchange events
// from unclosed handles on future schema upgrades.
let _dbPromise = null;
function _openDb() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(_DB_NAME, _DB_VERSION);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(_STORE, { keyPath: 'choreId' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => {
        _dbPromise = null;  // Allow retry on next call (e.g. private-browsing quota)
        reject(e.target.error);
      };
    });
  }
  return _dbPromise;
}

window.PendingCompletions = {
  async queueCompletion(choreId, completedAt, csrfToken) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readwrite');
      tx.objectStore(_STORE).put({ choreId, completedAt, csrfToken });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async getPending() {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readonly');
      const req = tx.objectStore(_STORE).getAll();
      req.onsuccess = e => resolve(e.target.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async removePending(choreId) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_STORE, 'readwrite');
      tx.objectStore(_STORE).delete(choreId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
};
