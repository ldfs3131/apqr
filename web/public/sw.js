/* Service worker do APQR — só acelera a abertura e mostra aviso sem internet.
   NUNCA guarda respostas de /api (dados do aluno ficam fora do cache do aparelho). */
const V = 'apqr-v3';
const SHELL = `shell-${V}`;
const RUNTIME = `rt-${V}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/offline.html', '/brand/pollyana-logo.png', '/icon-192.png'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const STATIC = /^\/(assets\/|brand\/|icon-|apple-touch-icon|favicon)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(RUNTIME)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/')) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  if (STATIC.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    })());
  }
});
