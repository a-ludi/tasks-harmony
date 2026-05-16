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
