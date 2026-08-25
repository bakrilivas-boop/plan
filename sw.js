const CACHE_NAME = 'campusflow-v1.0.1';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json', './favicon.svg'];

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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
