/*
 * Aegis Sound Lab (Sanayacorp) service worker.
 *
 * Security rules for this file:
 *  - same-origin, GET, http(s) only — nothing else is ever intercepted
 *  - API routes are never cached (CSP reports must reach the server)
 *  - only successful, basic-type, cacheable responses enter the cache
 *  - responses carrying `Cache-Control: no-store` are passed through untouched
 *  - a version bump is the only way to invalidate, so stale shells cannot serve
 *    markup that references retired asset hashes.
 */
const VERSION = 'aegis-sound-lab-v8.9.0';
const SHELL = [
  './',
  './index.html',
  './boot.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-64.png',
];

const CACHEABLE_PATH = /^\/(assets\/|icons\/|boot\.css$|manifest\.webmanifest$|index\.html$|\/$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  if (!response || !response.ok) return false;
  if (response.type !== 'basic') return false;
  const cc = response.headers.get('cache-control') || '';
  if (cc.includes('no-store') || cc.includes('private')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  // Reports and any future endpoint go straight to the network.
  if (url.pathname.startsWith('/api/')) return;
  if (!CACHEABLE_PATH.test(url.pathname)) return;

  // Navigations: network first, cached shell when the network is gone.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((r) => r || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })),
        ),
    );
    return;
  }

  // Hashed assets: cache first, then network, refreshing in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('message', (event) => {
  // Only this origin's pages may ask the worker to take over immediately.
  if (event.data === 'SKIP_WAITING' && event.source) self.skipWaiting();
});
