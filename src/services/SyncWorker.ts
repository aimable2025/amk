import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore, isFirebaseConfigured } from '../lib/firebase';
import type {
  SyncQueueItem,
  Billetage,
  LocalReport,
  LocalChatMessage,
  LocalBroadcast,
  LocalDebt,
  LocalInterAgencyTransfer,
  LocalSalaryRecord,
  LocalSalaryClaim,
  LocalSalaryAdvance,
} from '../lib/db';
import type { Operation, OperationAssignment } from '../types/operation';

const SYNC_INTERVAL_MS = 10000;
const MAX_ATTEMPTS = 5;

let isSyncing = false;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

async function isPendingDelete(entity: string, entityId: string): Promise<boolean> {
  try {
    const count = await db.syncQueue
      .where('status')
      .anyOf('pending', 'processing')
      .filter((item) => item.entity === entity && item.entityId === entityId && item.operation === 'delete')
      .count();
    return count > 0;
  } catch {
    return false;
  }
}

async function pullRemoteDataToLocal(): Promise<void> {
  if (!isFirebaseConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }

  // 1. Hydratation descendante des opérations
  try {
    const opsSnap = await getDocs(query(collection(firestore, 'operations'), limit(200)));
    for (const docSnap of opsSnap.docs) {
      const remoteData = docSnap.data() as Operation;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('operation', id)) continue;

      const localExisting = await db.operations.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.operations.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux si hors-ligne ou règles restreintes pour le rôle courant
  }

  // 2. Hydratation descendante des affectations d'opérations
  try {
    const assignSnap = await getDocs(query(collection(firestore, 'operationAssignments'), limit(200)));
    for (const docSnap of assignSnap.docs) {
      const remoteData = docSnap.data() as OperationAssignment;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('operationAssignment', id)) continue;

      const localExisting = await db.operationAssignments.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.operationAssignments.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 3. Hydratation descendante des billetages d'agence
  try {
    const billSnap = await getDocs(query(collection(firestore, 'billetages'), limit(150)));
    for (const docSnap of billSnap.docs) {
      const raw = docSnap.data();
      const id = (raw.id as string) || docSnap.id;
      if (await isPendingDelete('billetage', id)) continue;

      const localExisting = await db.billetages.get(id);
      const remoteUpdatedAt = Number(raw.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        const billetageRow: Billetage = {
          id,
          type: raw.type === 'personal' ? 'personal' : 'business',
          userId: String(raw.userId || ''),
          agencyId: raw.agencyId ? String(raw.agencyId) : null,
          currency: String(raw.currency || 'USD'),
          calculatedTotal: Number(raw.calculatedTotal || 0),
          declaredAmount: raw.declaredAmount !== undefined ? raw.declaredAmount : null,
          discrepancy: raw.discrepancy !== undefined ? raw.discrepancy : null,
          status: raw.status || 'completed',
          syncStatus: 'synced',
          transactionId: raw.transactionId ?? null,
          reference: raw.reference ?? null,
          createdAt: Number(raw.createdAt || Date.now()),
          updatedAt: Number(raw.updatedAt || Date.now()),
        };
        await db.billetages.put(billetageRow);
      }
    }
  } catch {
    // Silencieux
  }

  // 4. Hydratation descendante des rapports (reports)
  try {
    const repSnap = await getDocs(query(collection(firestore, 'reports'), limit(150)));
    for (const docSnap of repSnap.docs) {
      const remoteData = docSnap.data() as LocalReport;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('report', id)) continue;

      const localExisting = await db.reports.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.reports.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 5. Hydratation descendante des messages du chat (messages)
  try {
    const msgSnap = await getDocs(query(collection(firestore, 'messages'), limit(300)));
    for (const docSnap of msgSnap.docs) {
      const remoteData = docSnap.data() as LocalChatMessage;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('chatMessage', id)) continue;

      const localExisting = await db.chatMessages.get(id);
      if (!localExisting) {
        await db.chatMessages.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      } else if (localExisting.syncStatus !== 'pending') {
        await db.chatMessages.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      } else {
        // En attente : fusionner lectures et réactions distantes
        const mergedReactions = { ...(remoteData.reactions || {}), ...(localExisting.reactions || {}) };
        const mergedReadBy = Array.from(new Set([...(remoteData.readBy || []), ...(localExisting.readBy || [])]));
        await db.chatMessages.update(id, {
          reactions: mergedReactions,
          readBy: mergedReadBy,
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 6. Hydratation descendante des diffusions / annonces (notifications)
  try {
    const notifSnap = await getDocs(query(collection(firestore, 'notifications'), limit(100)));
    for (const docSnap of notifSnap.docs) {
      const remoteData = docSnap.data() as LocalBroadcast;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('broadcast', id)) continue;

      const localExisting = await db.broadcasts.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.broadcasts.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 7. Hydratation descendante des dettes (debts)
  try {
    const debtSnap = await getDocs(query(collection(firestore, 'debts'), limit(150)));
    for (const docSnap of debtSnap.docs) {
      const remoteData = docSnap.data() as LocalDebt;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('debt', id)) continue;

      const localExisting = await db.debts.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.debts.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 8. Hydratation descendante des transferts inter-agences (interAgencyTransfers)
  try {
    const trfSnap = await getDocs(query(collection(firestore, 'interAgencyTransfers'), limit(150)));
    for (const docSnap of trfSnap.docs) {
      const remoteData = docSnap.data() as LocalInterAgencyTransfer;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('interAgencyTransfer', id)) continue;

      const localExisting = await db.interAgencyTransfers.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.interAgencyTransfers.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 9. Hydratation descendante des salaires (salaries) avec préservation des décisions DG plus récentes
  try {
    const salSnap = await getDocs(query(collection(firestore, 'salaries'), limit(250)));
    for (const docSnap of salSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryRecord;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salary', id)) continue;

      const localExisting = await db.salaries.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaries.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 10. Hydratation descendante des réclamations salariales (salaryClaims)
  try {
    const clmSnap = await getDocs(query(collection(firestore, 'salaryClaims'), limit(150)));
    for (const docSnap of clmSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryClaim;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salaryClaim', id)) continue;

      const localExisting = await db.salaryClaims.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaryClaims.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 11. Hydratation descendante des demandes d'avance sur salaire (salaryAdvances)
  try {
    const advSnap = await getDocs(query(collection(firestore, 'salaryAdvances'), limit(150)));
    for (const docSnap of advSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryAdvance;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salaryAdvance', id)) continue;

      const localExisting = await db.salaryAdvances.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaryAdvances.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }
}

async function syncSingleItem(item: SyncQueueItem): Promise<void> {
  const { entity, entityId, operation } = item;

  if (entity === 'billetage') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'billetages', entityId);
      await deleteDoc(docRef);
    } else {
      const billetage = await db.billetages.get(entityId);
      if (!billetage) {
        return;
      }
      const denominations = await db.billetageDenominations
        .where('billetageId')
        .equals(entityId)
        .toArray();

      const docRef = doc(firestore, 'billetages', entityId);
      await setDoc(
        docRef,
        {
          ...billetage,
          denominations,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.billetages.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'operation') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'operations', entityId);
      await deleteDoc(docRef);
    } else {
      const op = await db.operations.get(entityId);
      if (!op) {
        return;
      }
      const docRef = doc(firestore, 'operations', entityId);
      await setDoc(
        docRef,
        {
          ...op,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.operations.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'operationAssignment') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'operationAssignments', entityId);
      await deleteDoc(docRef);
    } else {
      const assignment = await db.operationAssignments.get(entityId);
      if (!assignment) {
        return;
      }
      const docRef = doc(firestore, 'operationAssignments', entityId);
      await setDoc(
        docRef,
        {
          ...assignment,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.operationAssignments.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'report') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'reports', entityId));
    } else {
      const report = await db.reports.get(entityId);
      if (!report) return;
      await setDoc(
        doc(firestore, 'reports', entityId),
        {
          ...report,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.reports.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'chatMessage') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'messages', entityId));
    } else {
      const msg = await db.chatMessages.get(entityId);
      if (!msg) return;
      const cleanRemoteData = {
        id: msg.id,
        channelType: msg.channelType,
        channelId: msg.channelId,
        channelName: msg.channelName || '',
        agencyId: msg.agencyId || null,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        recipientId: msg.recipientId || null,
        recipientName: msg.recipientName || null,
        serviceTag: msg.serviceTag || null,
        groupName: msg.groupName || null,
        groupParticipantIds: msg.groupParticipantIds || [],
        groupParticipantNames: msg.groupParticipantNames || [],
        replyToMessageId: msg.replyToMessageId || null,
        replyToSenderName: msg.replyToSenderName || null,
        replyToExcerpt: msg.replyToExcerpt || null,
        forwardedFromSenderName: msg.forwardedFromSenderName || null,
        reactions: msg.reactions || {},
        comments: msg.comments || [],
        content: msg.content || '',
        attachmentType: msg.attachmentType || 'none',
        attachmentName: msg.attachmentName || null,
        attachmentDataUrl:
          msg.attachmentDataUrl && msg.attachmentDataUrl.length < 800000
            ? msg.attachmentDataUrl
            : null,
        readBy: msg.readBy || [msg.senderId],
        syncStatus: 'synced',
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt || Date.now(),
        syncedAt: serverTimestamp(),
      };
      await setDoc(doc(firestore, 'messages', entityId), cleanRemoteData, { merge: true });
      await db.chatMessages.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'broadcast') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'notifications', entityId));
    } else {
      const bc = await db.broadcasts.get(entityId);
      if (!bc) return;
      await setDoc(
        doc(firestore, 'notifications', entityId),
        {
          ...bc,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.broadcasts.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'debt') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'debts', entityId));
    } else {
      const debt = await db.debts.get(entityId);
      if (!debt) return;
      await setDoc(
        doc(firestore, 'debts', entityId),
        {
          ...debt,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.debts.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'interAgencyTransfer') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'interAgencyTransfers', entityId));
    } else {
      const trf = await db.interAgencyTransfers.get(entityId);
      if (!trf) return;
      await setDoc(
        doc(firestore, 'interAgencyTransfers', entityId),
        {
          ...trf,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.interAgencyTransfers.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salary') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaries', entityId));
    } else {
      const sal = await db.salaries.get(entityId);
      if (!sal) return;
      await setDoc(
        doc(firestore, 'salaries', entityId),
        {
          ...sal,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaries.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salaryClaim') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaryClaims', entityId));
    } else {
      const clm = await db.salaryClaims.get(entityId);
      if (!clm) return;
      await setDoc(
        doc(firestore, 'salaryClaims', entityId),
        {
          ...clm,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaryClaims.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salaryAdvance') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaryAdvances', entityId));
    } else {
      const adv = await db.salaryAdvances.get(entityId);
      if (!adv) return;
      await setDoc(
        doc(firestore, 'salaryAdvances', entityId),
        {
          ...adv,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaryAdvances.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  }
}

export async function processSyncQueue(): Promise<{
  processed: number;
  errors: number;
}> {
  if (isSyncing) {
    return { processed: 0, errors: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, errors: 0 };
  }

  if (!isFirebaseConfigured) {
    return { processed: 0, errors: 0 };
  }

  isSyncing = true;
  let processed = 0;
  let errors = 0;

  try {
    // 1. Récupération des éléments bloqués en 'processing' (coupure inattendue, rechargement)
    const stuckItems = await db.syncQueue
      .where('status')
      .equals('processing')
      .toArray();

    for (const stuck of stuckItems) {
      if (stuck.id) {
        await db.syncQueue.update(stuck.id, {
          status: 'pending',
          lastError: stuck.lastError || 'Reprise après interruption inattendue',
          updatedAt: Date.now(),
        });
      }
    }

    // 2. Extraction des éléments éligibles
    const pendingItems = await db.syncQueue
      .where('status')
      .anyOf('pending', 'failed')
      .toArray();

    // 3. Déduplication idempotente : si plusieurs actions concernent le même document, exécuter la plus récente
    const queueMap = new Map<string, SyncQueueItem>();
    for (const item of pendingItems) {
      if (!item.id) continue;
      if (item.attempts >= MAX_ATTEMPTS && item.status === 'failed') {
        continue;
      }
      const key = `${item.entity}:${item.entityId}`;
      const existing = queueMap.get(key);
      if (!existing || (item.id && existing.id && item.id > existing.id)) {
        if (existing && existing.id) {
          await db.syncQueue.update(existing.id, {
            status: 'completed',
            updatedAt: Date.now(),
            lastError: 'Consolidé dans une opération ultérieure',
          });
        }
        queueMap.set(key, item);
      } else {
        await db.syncQueue.update(item.id, {
          status: 'completed',
          updatedAt: Date.now(),
          lastError: 'Consolidé dans une opération ultérieure',
        });
      }
    }

    const itemsToProcess = Array.from(queueMap.values());

    for (const item of itemsToProcess) {
      if (!item.id) continue;

      await db.syncQueue.update(item.id, {
        status: 'processing',
        updatedAt: Date.now(),
      });

      try {
        await syncSingleItem(item);
        await db.syncQueue.update(item.id, {
          status: 'completed',
          updatedAt: Date.now(),
        });
        processed++;
      } catch (err: unknown) {
        errors++;
        const nextAttempts = (item.attempts || 0) + 1;
        const willFail = nextAttempts >= MAX_ATTEMPTS;
        const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de la synchronisation';

        await db.syncQueue.update(item.id, {
          status: willFail ? 'failed' : 'pending',
          attempts: nextAttempts,
          lastError: msg,
          updatedAt: Date.now(),
        });
      }
    }
    await pullRemoteDataToLocal();
  } catch (globalErr) {
    console.warn('[Ets AMANI SyncWorker] Erreur traitement file :', globalErr);
  } finally {
    isSyncing = false;
  }

  return { processed, errors };
}

export function startSyncWorker(): () => void {
  if (syncIntervalId) {
    return () => {
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
    };
  }

  void processSyncQueue();

  const handleOnline = () => {
    void processSyncQueue();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  syncIntervalId = setInterval(() => {
    void processSyncQueue();
  }, SYNC_INTERVAL_MS);

  return () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
  };
}

export async function triggerSyncNow(): Promise<{
  processed: number;
  errors: number;
}> {
  return processSyncQueue();
}
