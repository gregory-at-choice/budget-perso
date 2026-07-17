// sw.js — Service worker : met l'application en cache pour un usage hors-ligne.
// Stratégie « cache d'abord » sur la coquille de l'app ; les appels vers d'autres
// domaines (Google : authentification et API Drive) passent directement au réseau.

const CACHE = 'budget-perso-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/drive.js',
  './js/config.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Laisser passer sans interférence tout ce qui n'est pas sur notre domaine
  // (Google Identity Services, API Drive, etc.).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => {
          // Hors-ligne : pour une navigation, renvoyer la coquille de l'app.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Hors-ligne' });
        });
    })
  );
});
