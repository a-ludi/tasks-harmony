const CACHE_NAME = 'tasks-harmony-v5';
const APP_SHELL = [
  '/',
  '/accounts/login/',
  '/static/icon.svg',
  '/static/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
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
  if (new URL(event.request.url).pathname === '/accounts/ping/') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreVary: true }))
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
