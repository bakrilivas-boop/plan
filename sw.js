const CACHE_NAME = 'campusflow-v1.2.6';
const APP_SHELL = ['./', './index.html', './styles.css?v=1.2.6', './app.js?v=1.2.6', './manifest.json', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // CacheStorage is shared by every app on an origin (including sibling
    // GitHub Pages projects).  Only remove caches owned by CampusFlow;
    // deleting every key here can invalidate unrelated apps' offline data.
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('campusflow-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('/sw.js')) return;
  // OCR engine/model downloads are managed by the browser/CDN. Keeping the
  // CampusFlow cache same-origin prevents a large model from crowding out the app shell.
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (openClients) => {
      const appUrl = new URL('./index.html#planner', self.location.href).href;
      const existing = openClients.find((client) => client.url.startsWith(new URL('./', self.location.href).href));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'campusflow-open-view', view: event.notification.data?.view || 'planner' });
        return;
      }
      return clients.openWindow(appUrl);
    })
  );
});
