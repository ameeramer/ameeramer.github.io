// Offline support for the studio. Stale-while-revalidate: cached shell is
// served instantly (and offline), while the network quietly refreshes the
// cache so a redeploy is picked up on the visit after next.
const CACHE = 'moonshot-v2';

const SHELL = [
  './', './index.html', './css/app.css',
  './js/main.js', './js/ui.js', './js/state.js', './js/renderer.js',
  './js/frames.js', './js/backgrounds.js', './js/presets.js',
  './js/sample.js', './js/export.js', './js/license.js',
  './js/cryptopay.js', './js/redact.js', './js/redact-ui.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then((res) => {
        // Opaque responses (Google Fonts) are cached too so captions keep
        // their real typefaces offline.
        if (res && (res.status === 200 || res.type === 'opaque')) {
          cache.put(e.request, res.clone());
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
