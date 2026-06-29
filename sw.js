/**
 * CRM Pro — Service Worker
 *
 * Estratégia:
 *  - Navegação (HTML): network-first (sempre tenta a versão nova; cai no cache offline)
 *  - JS/CSS/fontes: stale-while-revalidate (serve do cache e atualiza em background)
 *  - Imagens: cache-first com revalidação
 *  - Supabase/OpenAI: nunca intercepta
 *
 * IMPORTANTE: a cada deploy, incremente SW_VERSION. Isso troca o nome dos
 * caches, e o evento "activate" abaixo apaga os caches antigos — garantindo
 * que ninguém fique preso numa versão velha de JS/CSS.
 */

const SW_VERSION   = 'v3';
const STATIC_CACHE = `crm-static-${SW_VERSION}`;
const RUNTIME_CACHE= `crm-runtime-${SW_VERSION}`;

// Assets essenciais (caminhos relativos ao escopo — funcionam em subpath como /CRMteste/)
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.html',
  './frontend/css/variables.css',
  './frontend/css/base.css',
  './frontend/css/components.css',
  './frontend/css/layout.css',
  './frontend/css/animations.css',
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // allSettled: um 404 num item não aborta o install inteiro
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Permite à página pedir ativação imediata da nova versão
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca intercepta backend/3rd-party dinâmico
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('openai.com') ||
      url.protocol === 'chrome-extension:') {
    return;
  }

  // Navegação (HTML) — network-first, fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // JS/CSS/fontes — stale-while-revalidate
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Imagens — cache-first com revalidação em background
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Default — network-first
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch (_) { data = { body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CRM Pro', {
      body:  data.body || '',
      icon:  './frontend/assets/icons/icon-192x192.png',
      badge: './frontend/assets/icons/icon-96x96.png',
      data:  data,
      tag:   data.tag || 'crm-notif',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const url = event.notification.data?.url || './app.html';
      const existing = clientList.find(c => c.url.includes('app.html') && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
