// Service worker: precache the app shell so the game works offline.
const CACHE = 'cliffdiving-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/fredoka-latin.woff2',
  './src/rig.js',
  './src/main.js',
  './src/game.js',
  './src/ui.js',
  './src/input.js',
  './src/render.js',
  './src/world.js',
  './src/scoring.js',
  './src/tricks.js',
  './src/odds.js',
  './src/rng.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Network first (the game is under active development), cache as the offline fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const sameOrigin = new URL(event.request.url).origin === location.origin;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && sameOrigin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});
