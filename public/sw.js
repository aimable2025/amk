/**
 * Service Worker pour Ets AMANI
 * Gère les notifications push locales et d'arrière-plan pour les agents
 */

const CACHE_NAME = 'ets-amani-sw-v1';

self.addEventListener('install', (event) => {
  // Activation immédiate sans attendre la fermeture des anciens clients
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      console.log('[Ets AMANI SW] Service Worker activé et contrôleur de clients prêt.');
    })()
  );
});

// Écoute des messages venant de l'application (ex: demande d'émission de notification locale)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [250, 100, 250, 100, 250],
        requireInteraction: options?.requireInteraction ?? true,
        ...options,
      })
    );
  }
});

// Gestion du clic sur une notification par l'agent
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  notification.close();

  // Cible de navigation
  const targetUrl = data.url || '/dashboard/agent';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si une fenêtre Ets AMANI est déjà ouverte, on la focalise
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl) {
            // Transmettre l'événement de clic à la fenêtre cliente
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data,
              action,
            });
            return client.navigate(targetUrl);
          }
          return;
        }
      }

      // Sinon, on ouvre une nouvelle fenêtre
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Gestion des notifications Push distantes (si abonnement Web Push actif)
self.addEventListener('push', (event) => {
  let payload = {
    title: '🚨 Ets AMANI — Nouvelle Opération Urgente',
    body: 'Une tâche opérationnelle prioritaire nécessite votre attention immédiate.',
    data: { url: '/dashboard/agent' },
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.png',
      badge: '/logo.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: payload.tag || `op-${Date.now()}`,
      data: payload.data || { url: '/dashboard/agent' },
      actions: [
        { action: 'open', title: 'Voir l’opération' },
        { action: 'dismiss', title: 'Ignorer' },
      ],
    })
  );
});
