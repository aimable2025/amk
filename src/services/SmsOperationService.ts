import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import {
  db,
  type LocalSmsOperation,
  type SmsSyncQueueItem,
} from '../lib/db';
import type { SmsOperation } from '../types/smsOperation';

const MAX_RETRY_DELAY = 30 * 60 * 1000;
const SYNC_INTERVAL = 30 * 1000;

function getRetryDelay(attempts: number): number {
  const baseDelay = 5000;
  return Math.min(
    baseDelay * Math.pow(2, Math.max(0, attempts - 1)),
    MAX_RETRY_DELAY
  );
}

function toLocalSmsOperation(
  operation: SmsOperation
): LocalSmsOperation {
  const now = Date.now();
  return {
    id: operation.id,
    internalNumberId: operation.internalNumberId,
    receiverPhoneNumber: operation.receiverPhoneNumber,
    agencyId: operation.agencyId,
    operator: operation.operator,
    sender: operation.sender,
    rawMessage: operation.rawMessage,
    transactionReference: operation.transactionReference,
    amount: operation.amount,
    currency: operation.currency,
    transactionType: operation.transactionType,
    operationDate: operation.operationDate,
    receivedAt: operation.receivedAt,
    processedAt: operation.processedAt,
    collectorDeviceId: operation.collectorDeviceId || null,
    collectorDeviceName: operation.collectorDeviceName || null,
    status: operation.status,
    reconciliationStatus: operation.reconciliationStatus || 'unmatched',
    reconciledOperationId: operation.reconciledOperationId || null,
    reconciledBy: operation.reconciledBy || null,
    reconciledAt: operation.reconciledAt || null,
    discrepancyReason: operation.discrepancyReason || null,
    validationNotes: operation.validationNotes || null,
    syncStatus: operation.syncStatus || 'pending',
    lastSyncError: operation.lastSyncError || null,
    createdAt: operation.createdAt || now,
    updatedAt: now,
  };
}

export async function saveSmsOperationLocally(
  operation: SmsOperation
): Promise<void> {
  const localOperation = toLocalSmsOperation(operation);
  await db.transaction(
    'rw',
    db.smsOperations,
    db.smsSyncQueue,
    async () => {
      await db.smsOperations.put(localOperation);
      const existing = await db.smsSyncQueue
        .where('smsOperationId')
        .equals(operation.id)
        .first();

      if (existing) {
        await db.smsSyncQueue.update(existing.id!, {
          status: 'pending',
          lastError: null,
          nextAttemptAt: Date.now(),
          updatedAt: Date.now(),
        });
        return;
      }

      const now = Date.now();
      await db.smsSyncQueue.add({
        smsOperationId: operation.id,
        operation: 'create',
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: now,
        lastAttemptAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  );
}

export async function getReadySmsQueueItems(): Promise<SmsSyncQueueItem[]> {
  const now = Date.now();
  return db.smsSyncQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((item) => item.nextAttemptAt <= now)
    .sortBy('nextAttemptAt');
}

export async function getPendingSmsOperations(): Promise<LocalSmsOperation[]> {
  const queueItems = await getReadySmsQueueItems();
  const operations: LocalSmsOperation[] = [];
  for (const item of queueItems) {
    const operation = await db.smsOperations.get(item.smsOperationId);
    if (operation) {
      operations.push(operation);
    }
  }
  return operations;
}

export async function recoverStuckSmsQueue(): Promise<number> {
  const stuck = await db.smsSyncQueue
    .where('status')
    .equals('processing')
    .toArray();

  if (stuck.length === 0) {
    return 0;
  }

  const now = Date.now();
  await db.transaction('rw', db.smsSyncQueue, async () => {
    for (const item of stuck) {
      await db.smsSyncQueue.update(item.id!, {
        status: 'failed',
        lastError:
          item.lastError ??
          'Synchronisation interrompue avant sa finalisation.',
        nextAttemptAt: now,
        updatedAt: now,
      });
    }
  });

  return stuck.length;
}

async function markQueueProcessing(
  queueItem: SmsSyncQueueItem
): Promise<void> {
  const now = Date.now();
  await db.smsSyncQueue.update(queueItem.id!, {
    status: 'processing',
    attempts: queueItem.attempts + 1,
    lastAttemptAt: now,
    updatedAt: now,
  });
}

export async function syncSmsOperation(
  operationId: string
): Promise<void> {
  const operation = await db.smsOperations.get(operationId);
  if (!operation) {
    throw new Error(`Opération SMS introuvable : ${operationId}`);
  }

  const queueItem = await db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();

  if (!queueItem) {
    throw new Error(`Élément de file introuvable pour : ${operationId}`);
  }

  await markQueueProcessing(queueItem);

  try {
    const firestoreRef = doc(firestore, 'smsOperations', operation.id);
    await setDoc(
      firestoreRef,
      {
        id: operation.id,
        internalNumberId: operation.internalNumberId,
        receiverPhoneNumber: operation.receiverPhoneNumber ?? null,
        agencyId: operation.agencyId,
        operator: operation.operator,
        sender: operation.sender ?? null,
        rawMessage: operation.rawMessage,
        transactionReference: operation.transactionReference ?? null,
        amount: operation.amount ?? null,
        currency: operation.currency ?? null,
        transactionType: operation.transactionType ?? null,
        operationDate: operation.operationDate ?? null,
        receivedAt: operation.receivedAt,
        processedAt: operation.processedAt ?? null,
        collectorDeviceId: operation.collectorDeviceId ?? null,
        collectorDeviceName: operation.collectorDeviceName ?? null,
        status: operation.status,
        reconciliationStatus: operation.reconciliationStatus || 'unmatched',
        reconciledOperationId: operation.reconciledOperationId || null,
        reconciledBy: operation.reconciledBy || null,
        reconciledAt: operation.reconciledAt || null,
        createdAt: operation.createdAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const now = Date.now();
    await db.transaction(
      'rw',
      db.smsOperations,
      db.smsSyncQueue,
      async () => {
        await db.smsOperations.update(operation.id, {
          syncStatus: 'synced',
          lastSyncError: null,
          updatedAt: now,
        });
        await db.smsSyncQueue.update(queueItem.id!, {
          status: 'completed',
          lastError: null,
          updatedAt: now,
        });
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    const currentQueueItem = await db.smsSyncQueue.get(queueItem.id!);
    const attempts =
      currentQueueItem?.attempts ?? queueItem.attempts + 1;
    const delay = getRetryDelay(attempts);
    const nextAttemptAt = Date.now() + delay;

    await db.transaction(
      'rw',
      db.smsOperations,
      db.smsSyncQueue,
      async () => {
        await db.smsOperations.update(operation.id, {
          syncStatus: 'failed',
          lastSyncError: message,
          updatedAt: Date.now(),
        });
        await db.smsSyncQueue.update(queueItem.id!, {
          status: 'failed',
          lastError: message,
          nextAttemptAt,
          updatedAt: Date.now(),
        });
      }
    );
    throw new Error(`Échec synchronisation SMS : ${message}`);
  }
}

export async function processSmsSyncQueue(): Promise<{
  processed: number;
  failed: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  const queue = await getReadySmsQueueItems();
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await syncSmsOperation(item.smsOperationId);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

export async function syncPendingSmsOperations(): Promise<{
  synced: number;
  failed: number;
}> {
  const result = await processSmsSyncQueue();
  return { synced: result.processed, failed: result.failed };
}

export async function retrySmsOperation(
  operationId: string
): Promise<void> {
  const queueItem = await db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();

  if (!queueItem) {
    throw new Error(`Opération absente de la file : ${operationId}`);
  }

  await db.smsSyncQueue.update(queueItem.id!, {
    status: 'pending',
    nextAttemptAt: Date.now(),
    lastError: null,
    updatedAt: Date.now(),
  });

  await db.smsOperations.update(operationId, {
    syncStatus: 'pending',
    updatedAt: Date.now(),
  });
}

export async function getSmsSyncQueueItem(
  operationId: string
): Promise<SmsSyncQueueItem | undefined> {
  return db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();
}

export async function getSmsSyncQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const items = await db.smsSyncQueue.toArray();
  return {
    pending: items.filter((item) => item.status === 'pending').length,
    processing: items.filter((item) => item.status === 'processing').length,
    completed: items.filter((item) => item.status === 'completed').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
}

let syncWorkerStarted = false;

export function startSmsSyncWorker(): () => void {
  if (syncWorkerStarted) {
    return () => undefined;
  }

  syncWorkerStarted = true;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const run = async () => {
    try {
      await recoverStuckSmsQueue();
      await processSmsSyncQueue();
    } catch {
      // Silencieux pour stabilité
    }
  };

  void run();

  intervalId = setInterval(() => {
    void run();
  }, SYNC_INTERVAL);

  const handleOnline = () => {
    void run();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    syncWorkerStarted = false;
  };
}

export async function getSmsOperationsByNumber(
  internalNumberId: string
): Promise<LocalSmsOperation[]> {
  return db.smsOperations
    .where('internalNumberId')
    .equals(internalNumberId)
    .reverse()
    .sortBy('receivedAt');
}

export async function getSmsOperationsByAgency(
  agencyId: string
): Promise<LocalSmsOperation[]> {
  return db.smsOperations
    .where('agencyId')
    .equals(agencyId)
    .reverse()
    .sortBy('receivedAt');
}

export async function getRecentSmsOperations(
  limitCount = 50
): Promise<LocalSmsOperation[]> {
  const all = await db.smsOperations.toArray();
  all.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
  return all.slice(0, limitCount);
}

/**
 * Récupère les SMS enregistrés sur Firestore depuis les appareils collecteurs
 * et les met en cache dans Dexie pour consultation immédiate et hors ligne.
 */
export async function fetchRemoteSmsOperations(
  options?: {
    agencyId?: string | null;
    limitCount?: number;
  }
): Promise<SmsOperation[]> {
  try {
    let q = query(
      collection(firestore, 'smsOperations'),
      orderBy('receivedAt', 'desc'),
      limit(options?.limitCount || 200)
    );

    if (options?.agencyId) {
      q = query(
        collection(firestore, 'smsOperations'),
        where('agencyId', '==', options.agencyId),
        orderBy('receivedAt', 'desc'),
        limit(options?.limitCount || 200)
      );
    }

    const snapshot = await getDocs(q);
    const remoteList: SmsOperation[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const op: SmsOperation = {
        id: docSnap.id,
        internalNumberId: data.internalNumberId || '',
        receiverPhoneNumber: data.receiverPhoneNumber || undefined,
        agencyId: data.agencyId ?? null,
        operator: data.operator || 'vodacom',
        sender: data.sender || 'INCONNU',
        rawMessage: data.rawMessage || '',
        transactionReference: data.transactionReference ?? undefined,
        amount: data.amount !== undefined && data.amount !== null ? Number(data.amount) : undefined,
        currency: data.currency ?? undefined,
        transactionType: data.transactionType ?? undefined,
        operationDate: data.operationDate ? Number(data.operationDate) : undefined,
        receivedAt: data.receivedAt ? Number(data.receivedAt) : Date.now(),
        processedAt: data.processedAt ? Number(data.processedAt) : undefined,
        collectorDeviceId: data.collectorDeviceId ?? null,
        collectorDeviceName: data.collectorDeviceName ?? null,
        status: data.status || 'received',
        reconciliationStatus: data.reconciliationStatus || 'unmatched',
        reconciledOperationId: data.reconciledOperationId ?? null,
        reconciledBy: data.reconciledBy ?? null,
        reconciledAt: data.reconciledAt ? Number(data.reconciledAt) : null,
        discrepancyReason: data.discrepancyReason ?? null,
        validationNotes: data.validationNotes ?? null,
        syncStatus: 'synced',
        lastSyncError: null,
        createdAt: data.createdAt ? Number(data.createdAt) : Date.now(),
        updatedAt: data.updatedAt ? Number(data.updatedAt) : Date.now(),
      };
      remoteList.push(op);

      // Cacher dans Dexie sans écraser les SMS locaux en attente
      const local = await db.smsOperations.get(op.id);
      if (!local || local.syncStatus === 'synced') {
        await db.smsOperations.put(toLocalSmsOperation(op));
      }
    }

    // Récupérer également les opérations locales en attente ou échouées
    const localPending = await db.smsOperations
      .where('syncStatus')
      .anyOf(['pending', 'failed'])
      .toArray();

    const mergedMap = new Map<string, SmsOperation>();
    for (const rem of remoteList) {
      mergedMap.set(rem.id, rem);
    }
    for (const loc of localPending) {
      mergedMap.set(loc.id, loc as SmsOperation);
    }

    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
    return merged;
  } catch (err) {
    console.warn('[Ets AMANI] Firestore smsOperations indisponible, repli sur le cache local Dexie:', err);
    const local = await db.smsOperations.toArray();
    local.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
    return local as SmsOperation[];
  }
}

/**
 * Écoute en temps réel les nouveaux SMS opérateurs transmis vers Firestore
 * et notifie le tableau de bord du Directeur Général.
 */
export function subscribeToRemoteSmsOperations(
  onData: (operations: SmsOperation[]) => void,
  agencyId?: string | null
): () => void {
  try {
    let q = query(
      collection(firestore, 'smsOperations'),
      orderBy('receivedAt', 'desc'),
      limit(200)
    );

    if (agencyId) {
      q = query(
        collection(firestore, 'smsOperations'),
        where('agencyId', '==', agencyId),
        orderBy('receivedAt', 'desc'),
        limit(200)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const remoteList: SmsOperation[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const op: SmsOperation = {
            id: docSnap.id,
            internalNumberId: data.internalNumberId || '',
            receiverPhoneNumber: data.receiverPhoneNumber || undefined,
            agencyId: data.agencyId ?? null,
            operator: data.operator || 'vodacom',
            sender: data.sender || 'INCONNU',
            rawMessage: data.rawMessage || '',
            transactionReference: data.transactionReference ?? undefined,
            amount: data.amount !== undefined && data.amount !== null ? Number(data.amount) : undefined,
            currency: data.currency ?? undefined,
            transactionType: data.transactionType ?? undefined,
            operationDate: data.operationDate ? Number(data.operationDate) : undefined,
            receivedAt: data.receivedAt ? Number(data.receivedAt) : Date.now(),
            processedAt: data.processedAt ? Number(data.processedAt) : undefined,
            collectorDeviceId: data.collectorDeviceId ?? null,
            collectorDeviceName: data.collectorDeviceName ?? null,
            status: data.status || 'received',
            reconciliationStatus: data.reconciliationStatus || 'unmatched',
            reconciledOperationId: data.reconciledOperationId ?? null,
            reconciledBy: data.reconciledBy ?? null,
            reconciledAt: data.reconciledAt ? Number(data.reconciledAt) : null,
            discrepancyReason: data.discrepancyReason ?? null,
            validationNotes: data.validationNotes ?? null,
            syncStatus: 'synced',
            lastSyncError: null,
            createdAt: data.createdAt ? Number(data.createdAt) : Date.now(),
            updatedAt: data.updatedAt ? Number(data.updatedAt) : Date.now(),
          };
          remoteList.push(op);

          const local = await db.smsOperations.get(op.id);
          if (!local || local.syncStatus === 'synced') {
            await db.smsOperations.put(toLocalSmsOperation(op));
          }
        }

        const localPending = await db.smsOperations
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();

        const mergedMap = new Map<string, SmsOperation>();
        for (const rem of remoteList) {
          mergedMap.set(rem.id, rem);
        }
        for (const loc of localPending) {
          mergedMap.set(loc.id, loc as SmsOperation);
        }

        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
        onData(merged);
      },
      (err) => {
        console.warn('[Ets AMANI] Snapshot temps réel Firestore smsOperations indisponible:', err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[Ets AMANI] Impossible d activer le listener Firestore smsOperations:', err);
    return () => {};
  }
}

