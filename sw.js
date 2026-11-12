// Sube este número cada vez que cambies algún archivo de la app.
const VERSION = 'calma-v2';

const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'catalog.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'audio/lluvia.mp3',
  'audio/bosque.mp3',
  'audio/mar.mp3',
  'audio/rio.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Solo lo propio se sirve desde la caché; YouTube va siempre por la red.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((guardado) => guardado || fetch(e.request))
  );
});
