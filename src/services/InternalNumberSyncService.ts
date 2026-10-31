import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import { db, type LocalInternalNumber } from '../lib/db';

/**
 * Convertit un champ Timestamp Firestore ou Date en timestamp Unix (ms).
 */
function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

/**
 * Synchronise les numéros internes de Firestore vers la base locale IndexedDB (Dexie).
 * Permet un fonctionnement 100% Offline-First pour la résolution des numéros SMS.
 */
export async function syncInternalNumbers(): Promise<void> {
  // Exécution si l'utilisateur est authentifié ou si une session locale existe
  if (!auth.currentUser && !localStorage.getItem('ets_amani_session_user')) {
    return;
  }

  try {
    const snapshot = await getDocs(collection(firestore, 'internalNumbers'));
    const firestoreIds = new Set<string>();

    for (const document of snapshot.docs) {
      const data = document.data();
      const internalNumber: LocalInternalNumber = {
        id: document.id,
        phoneNumber: data.phoneNumber ?? '',
        operator: data.operator ?? 'vodacom',
        agencyId: data.agencyId ?? null,
        assignedUserId: data.assignedUserId ?? null,
        assignedUserName: data.assignedUserName ?? null,
        label: data.label ?? '',
        description: data.description ?? '',
        status: data.status ?? 'active',
        monitoringEnabled: data.monitoringEnabled === true,
        createdBy: data.createdBy ?? '',
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
      };

      firestoreIds.add(document.id);
      await db.internalNumbers.put(internalNumber);
    }

    // Purge des enregistrements locaux supprimés côté serveur (uniquement si le snapshot est valide)
    if (!snapshot.empty) {
      const localNumbers = await db.internalNumbers.toArray();
      for (const local of localNumbers) {
        if (!firestoreIds.has(local.id)) {
          await db.internalNumbers.delete(local.id);
        }
      }
    }
  } catch (error: unknown) {
    console.warn(
      '[Ets AMANI] Synchronisation Firestore des numéros internes reportée :',
      error instanceof Error ? error.message : error
    );
  }
}
