/**
 * Service de notifications push locales et d'arrière-plan pour Ets AMANI
 * Permet d'alerter les agents même lorsque l'application est en arrière-plan ou minimisée.
 */

import { db } from '../lib/db';
import type { Operation } from '../types/operation';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  tag?: string;
  priority?: 'maintenant' | 'tres_urgent' | 'urgent' | 'normal' | 'attendre';
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

const NOTIFIED_CACHE_KEY = 'ets_amani_notified_operations';
let swRegistration: ServiceWorkerRegistration | null = null;
let watcherIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Joue une sonnerie d'alerte urgente audible via Web Audio API
 */
export function playUrgentAlertTone() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Motif d'alarme double tonalité puissante mais agréable
    [0, 0.22, 0.44].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now + offset); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + offset + 0.14); // D6

      gain.gain.setValueAtTime(0.12, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  } catch {
    // ignore
  }
}

/**
 * Enregistre le Service Worker pour le traitement des notifications en arrière-plan
 */
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    swRegistration = registration;
    console.log('[Ets AMANI] Service Worker enregistré avec succès pour les notifications push locales.');
    return registration;
  } catch (err) {
    console.warn('[Ets AMANI] Erreur enregistrement Service Worker :', err);
    return null;
  }
}

/**
 * Obtient le statut de permission actuel
 */
export function getNotificationPermissionStatus(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Demande formellement la permission d'émettre des notifications push à l'agent
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerNotificationServiceWorker();
    }
    return permission;
  } catch (err) {
    console.warn('Erreur demande permission notification :', err);
    return 'denied';
  }
}

/**
 * Émet une notification push locale (prioritairement via le Service Worker pour fonctionner en arrière-plan)
 */
export async function sendLocalPushNotification(
  payload: PushNotificationPayload
): Promise<boolean> {
  // Vibration d'urgence sur appareil mobile
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    if (payload.priority === 'maintenant' || payload.priority === 'tres_urgent') {
      navigator.vibrate([300, 150, 300, 150, 400]);
    } else {
      navigator.vibrate([200, 100, 200]);
    }
  }

  // Alerte sonore pour les tâches urgentes
  if (payload.priority === 'maintenant' || payload.priority === 'tres_urgent' || payload.priority === 'urgent') {
    playUrgentAlertTone();
  }

  const permission = getNotificationPermissionStatus();
  if (permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions & { actions?: Array<{ action: string; title: string }> } = {
    body: payload.body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.tag || `ets-amani-notif-${Date.now()}`,
    data: payload.data || { url: '/dashboard/agent' },
    requireInteraction: payload.requireInteraction ?? (payload.priority === 'maintenant' || payload.priority === 'tres_urgent'),
    // Action buttons if supported
    actions: payload.actions || [
      { action: 'open', title: 'Prendre en charge' },
      { action: 'dismiss', title: 'Plus tard' },
    ],
  };

  // 1. Tenter d'abord via le Service Worker (permet l'affichage même si l'onglet est en arrière-plan)
  try {
    if (!swRegistration && 'serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.ready;
    }

    if (swRegistration?.showNotification) {
      await swRegistration.showNotification(payload.title, options);
      return true;
    }
  } catch (err) {
    console.warn('[Ets AMANI] SW showNotification a échoué, essai via Window Notification :', err);
  }

  // 2. Fallback via Window Notification API si disponible
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const n = new Notification(payload.title, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    }
  } catch (err) {
    console.warn('[Ets AMANI] Window Notification a échoué :', err);
  }

  return false;
}

/**
 * Cache des identifiants d'opérations déjà notifiées pour éviter les alertes redondantes
 */
function getNotifiedOperationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_CACHE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveNotifiedOperationId(opId: string): void {
  try {
    const set = getNotifiedOperationIds();
    set.add(opId);
    // Limiter la taille de l'historique
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(NOTIFIED_CACHE_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/**
 * Démarre le surveillant de tâches urgentes & opérations pour l'agent connecté
 * Tourne en arrière-plan et déclenche la notification dès qu'une tâche est affectée
 */
export function startAgentNotificationWatcher(
  agentUid: string,
  onNewTaskDetected?: (op: Operation) => void
): () => void {
  if (!agentUid) return () => {};

  // Vérification initiale
  void checkPendingAgentTasks(agentUid, onNewTaskDetected);

  // Intervalle périodique (toutes les 8 secondes)
  if (watcherIntervalId) {
    clearInterval(watcherIntervalId);
  }

  watcherIntervalId = setInterval(() => {
    void checkPendingAgentTasks(agentUid, onNewTaskDetected);
  }, 8000);

  // Écouteur de retour au premier plan pour rafraîchir immédiatement
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void checkPendingAgentTasks(agentUid, onNewTaskDetected);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    if (watcherIntervalId) {
      clearInterval(watcherIntervalId);
      watcherIntervalId = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * Vérifie dans Dexie s'il existe de nouvelles opérations non encore notifiées
 */
async function checkPendingAgentTasks(
  agentUid: string,
  onNewTaskDetected?: (op: Operation) => void
): Promise<void> {
  try {
    const notifiedIds = getNotifiedOperationIds();

    // Récupérer les opérations locales assignées à cet agent
    const allOps = await db.operations.toArray();
    const myOps = allOps.filter((op) => {
      const isAssigned =
        op.assignedAgentIds?.includes(agentUid) ||
        op.assignedAgentNames?.some((n) => n.toLowerCase().includes(agentUid.toLowerCase()));
      const isPending =
        op.status === 'cree' || op.status === 'envoye' || op.status === 'assigne';
      return isAssigned && isPending;
    });

    for (const op of myOps) {
      if (!notifiedIds.has(op.id)) {
        // Enregistrer pour ne pas re-notifier
        saveNotifiedOperationId(op.id);

        const isUrgent =
          op.priority === 'maintenant' ||
          op.priority === 'tres_urgent' ||
          op.priority === 'urgent';

        const priorityLabel =
          op.priority === 'maintenant'
            ? '⚡ IMMÉDIAT'
            : op.priority === 'tres_urgent'
            ? '🚨 TRÈS URGENT'
            : op.priority === 'urgent'
            ? '⚠️ URGENT'
            : 'NOUVELLE TÂCHE';

        // Émission de la notification push locale
        await sendLocalPushNotification({
          title: `[${priorityLabel}] ${op.title}`,
          body: `${op.operationNumber} · ${op.agencyName || 'Agence'}\n${op.description || 'Opération en attente de traitement.'}`,
          priority: op.priority,
          tag: `op-${op.id}`,
          requireInteraction: isUrgent,
          data: {
            operationId: op.id,
            url: `/dashboard/agent?opId=${op.id}`,
          },
        });

        if (onNewTaskDetected) {
          onNewTaskDetected(op);
        }
      }
    }
  } catch (err) {
    console.warn('[Ets AMANI] Erreur surveillance notifications agent :', err);
  }
}

/**
 * Déclenche une notification de test pour permettre à l'agent de vérifier le fonctionnement
 */
export async function triggerTestUrgentNotification(agentName?: string): Promise<boolean> {
  const perm = getNotificationPermissionStatus();
  if (perm !== 'granted') {
    const requested = await requestNotificationPermission();
    if (requested !== 'granted') {
      alert('Veuillez autoriser les notifications dans votre navigateur pour recevoir les alertes urgentes.');
      return false;
    }
  }

  const success = await sendLocalPushNotification({
    title: '🚨 [TEST URGENT] Dépôt Caisse Express à traiter',
    body: `OP-TEST-${Date.now().toString().slice(-4)} · Agence Goma Centre\nClient express en attente au guichet. Traitement prioritaire demandé pour ${agentName || 'vous'}.`,
    priority: 'tres_urgent',
    requireInteraction: true,
    tag: `test-op-${Date.now()}`,
    data: {
      url: '/dashboard/agent',
      isTest: true,
    },
  });

  return success;
}
