const CACHE_NAME = 'egaux-time-v1';
const STATIC_ASSETS = [
  '/mobile.html',
  '/css/styles.css',
  '/js/lib.js',
  '/js/mobile.js',
  '/pwa/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: always network-first (never serve stale API data)
  if(url.pathname.startsWith('/api/')){
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets: cache-first with network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses for static assets
        if(response.ok && e.request.method === 'GET'){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation requests
      if(e.request.mode === 'navigate'){
        return caches.match('/mobile.html');
      }
    })
  );
});
