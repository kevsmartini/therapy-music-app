// Sube este número cada vez que cambies algún archivo de la app.
const VERSION = 'calma-v5';

const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'catalog.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
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

// Solo lo propio pasa por aquí; YouTube va siempre por la red.
// Los audios salen de la caché; el resto se pide primero a la red para que
// las actualizaciones lleguen a la primera, y de la caché si no hay conexión.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const enCache = () => caches.match(e.request, { ignoreSearch: true });
  if (url.pathname.includes('/audio/')) {
    e.respondWith(enCache().then((guardado) => guardado || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => enCache().then((guardado) => guardado || Response.error()))
  );
});
