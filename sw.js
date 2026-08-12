const CACHE_NAME = 'metas-v6';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
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
  // Notificações push: não interceptar
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && ASSETS.some(a => e.request.url.endsWith(a))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Abre a aba Coach ao clicar na notificação push
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) {
        list[0].focus();
        list[0].postMessage({ type: 'OPEN_COACH' });
      } else {
        clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  self.registration.showNotification(data.title || 'Minhas Metas', {
    body: data.body || 'Hora de checar suas metas!',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: data
  });
});
