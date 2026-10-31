import { db } from '../lib/db';
import type {
  Billetage,
  BilletageDenomination,
  SyncQueueItem,
} from '../lib/db';
import type {
  BilletageCalculation,
  BilletageCurrency,
  BilletageDenominationConfig,
  BilletageLine,
  BilletageRecord,
  CreateBilletageInput,
} from '../types/billetage';
import {
  calculateBilletageDiscrepancy,
  calculateBilletageSubtotal,
  calculateBilletageTotal,
  isBilletageCoherent,
} from '../types/billetage';
import { recordAuditLog } from './AuditService';

/**
 * Générateur d'identifiant unique universel robuste pour la production.
 */
function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function assertValidQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('La quantité doit être un nombre positif ou nul.');
  }
  if (!Number.isInteger(quantity)) {
    throw new Error('La quantité doit être un nombre entier.');
  }
}

function assertValidDenomination(denomination: number): void {
  if (!Number.isFinite(denomination) || denomination <= 0) {
    throw new Error('La dénomination doit être supérieure à zéro.');
  }
}

function assertValidCurrency(currency: BilletageCurrency): void {
  if (currency !== 'USD' && currency !== 'CDF') {
    throw new Error('Devise de billetage invalide. Seules USD et CDF sont autorisées.');
  }
}

function normalizeLines(
  lines: readonly BilletageLine[]
): BilletageLine[] {
  return lines.map((line) => {
    assertValidCurrency(line.currency);
    assertValidDenomination(line.denomination);
    assertValidQuantity(line.quantity);
    return {
      denominationId: line.denominationId,
      currency: line.currency,
      denomination: line.denomination,
      quantity: line.quantity,
      subtotal: calculateBilletageSubtotal(
        line.denomination,
        line.quantity
      ),
    };
  });
}

export function calculateBilletage(
  currency: BilletageCurrency,
  lines: readonly BilletageLine[],
  declaredAmount: number | null = null
): BilletageCalculation {
  assertValidCurrency(currency);
  const normalizedLines = normalizeLines(lines);
  const total = calculateBilletageTotal(normalizedLines);
  const discrepancy = calculateBilletageDiscrepancy(
    total,
    declaredAmount
  );
  return {
    currency,
    lines: normalizedLines,
    total,
    declaredAmount,
    discrepancy,
    isCoherent: isBilletageCoherent(
      total,
      declaredAmount
    ),
  };
}

export function calculateLineSubtotal(
  denomination: number,
  quantity: number
): number {
  assertValidDenomination(denomination);
  assertValidQuantity(quantity);
  return calculateBilletageSubtotal(
    denomination,
    quantity
  );
}

export function createEmptyBilletageLines(
  configurations: readonly BilletageDenominationConfig[],
  currency: BilletageCurrency
): BilletageLine[] {
  assertValidCurrency(currency);
  return configurations
    .filter(
      (configuration) =>
        configuration.active &&
        configuration.currency === currency
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((configuration) => ({
      denominationId: configuration.id,
      currency: configuration.currency,
      denomination: configuration.value,
      quantity: 0,
      subtotal: 0,
    }));
}

async function toBilletageRecord(
  billetage: Billetage
): Promise<BilletageRecord> {
  const denominationRows = await db.billetageDenominations
    .where('billetageId')
    .equals(billetage.id)
    .toArray();

  const lines: BilletageLine[] = denominationRows
    .sort((a, b) => {
      if (a.currency !== b.currency) {
        return a.currency.localeCompare(b.currency);
      }
      return b.denomination - a.denomination;
    })
    .map((row) => ({
      denominationId: String(row.id ?? row.denomination),
      currency: row.currency as BilletageCurrency,
      denomination: row.denomination,
      quantity: row.quantity,
      subtotal: row.subtotal,
    }));

  return {
    id: billetage.id,
    type: billetage.type,
    userId: billetage.userId,
    agencyId: billetage.agencyId ?? null,
    currency: billetage.currency as BilletageCurrency,
    lines,
    calculatedTotal: billetage.calculatedTotal,
    declaredAmount: billetage.declaredAmount ?? null,
    discrepancy: billetage.discrepancy ?? null,
    status: billetage.status,
    syncStatus: billetage.syncStatus,
    transactionId: billetage.transactionId ?? null,
    reference: billetage.reference ?? null,
    createdAt: billetage.createdAt,
    updatedAt: billetage.updatedAt,
  };
}

export async function createBilletage(
  input: CreateBilletageInput
): Promise<BilletageRecord> {
  if (!input.userId || !input.userId.trim()) {
    throw new Error('L utilisateur du billetage est obligatoire.');
  }
  assertValidCurrency(input.currency);
  if (input.type === 'business' && !input.agencyId) {
    throw new Error(
      'Une agence est obligatoire pour un billetage professionnel.'
    );
  }

  const lines = normalizeLines(input.lines);
  const calculatedTotal = calculateBilletageTotal(lines);
  const declaredAmount = input.declaredAmount ?? null;
  const discrepancy = calculateBilletageDiscrepancy(
    calculatedTotal,
    declaredAmount
  );
  const now = Date.now();

  const billetage: Billetage = {
    id: generateId('billetage'),
    type: input.type,
    userId: input.userId.trim(),
    agencyId: input.agencyId ? input.agencyId.trim() : null,
    currency: input.currency,
    calculatedTotal,
    declaredAmount,
    discrepancy,
    status: 'draft',
    syncStatus: input.type === 'business' ? 'pending' : 'local',
    transactionId: input.transactionId ?? null,
    reference: input.reference ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction(
    'rw',
    db.billetages,
    db.billetageDenominations,
    db.syncQueue,
    async () => {
      await db.billetages.add(billetage);
      await db.billetageDenominations.bulkAdd(
        lines.map((line) => ({
          billetageId: billetage.id,
          currency: line.currency,
          denomination: line.denomination,
          quantity: line.quantity,
          subtotal: line.subtotal,
          createdAt: now,
          updatedAt: now,
        }))
      );

      if (input.type === 'business') {
        const queueItem: SyncQueueItem = {
          entity: 'billetage',
          entityId: billetage.id,
          operation: 'create',
          attempts: 0,
          lastError: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        };
        await db.syncQueue.add(queueItem);
      }
    }
  );

  return toBilletageRecord(billetage);
}

export async function getBilletage(
  billetageId: string
): Promise<BilletageRecord | null> {
  if (!billetageId || !billetageId.trim()) return null;
  const billetage = await db.billetages.get(billetageId);
  if (!billetage) {
    return null;
  }
  return toBilletageRecord(billetage);
}

export async function getOwnBilletages(
  userId: string
): Promise<BilletageRecord[]> {
  if (!userId || !userId.trim()) {
    return [];
  }
  const records = await db.billetages
    .where('userId')
    .equals(userId.trim())
    .reverse()
    .sortBy('updatedAt');
  return Promise.all(records.map(toBilletageRecord));
}

export async function getAgencyBilletages(
  agencyId: string
): Promise<BilletageRecord[]> {
  if (!agencyId || !agencyId.trim()) {
    return [];
  }
  const records = await db.billetages
    .where('agencyId')
    .equals(agencyId.trim())
    .reverse()
    .sortBy('updatedAt');
  return Promise.all(records.map(toBilletageRecord));
}

export async function getAllBilletages(): Promise<BilletageRecord[]> {
  const records = await db.billetages
    .toCollection()
    .reverse()
    .sortBy('updatedAt');
  return Promise.all(records.map(toBilletageRecord));
}

export async function updateBilletage(
  billetageId: string,
  lines: readonly BilletageLine[],
  declaredAmount?: number | null
): Promise<BilletageRecord> {
  const existing = await db.billetages.get(billetageId);
  if (!existing) {
    throw new Error('Billetage introuvable.');
  }
  if (existing.status === 'validated') {
    throw new Error('Un billetage validé ne peut plus être modifié.');
  }

  const normalizedLines = normalizeLines(lines);
  const calculatedTotal = calculateBilletageTotal(normalizedLines);
  const nextDeclaredAmount =
    declaredAmount === undefined
      ? existing.declaredAmount ?? null
      : declaredAmount;
  const discrepancy = calculateBilletageDiscrepancy(
    calculatedTotal,
    nextDeclaredAmount
  );
  const now = Date.now();

  await db.transaction(
    'rw',
    db.billetages,
    db.billetageDenominations,
    db.syncQueue,
    async () => {
      await db.billetages.update(billetageId, {
        calculatedTotal,
        declaredAmount: nextDeclaredAmount,
        discrepancy,
        updatedAt: now,
        syncStatus: existing.type === 'business' ? 'pending' : 'local',
      });
      await db.billetageDenominations
        .where('billetageId')
        .equals(billetageId)
        .delete();
      await db.billetageDenominations.bulkAdd(
        normalizedLines.map((line) => ({
          billetageId,
          currency: line.currency,
          denomination: line.denomination,
          quantity: line.quantity,
          subtotal: line.subtotal,
          createdAt: now,
          updatedAt: now,
        }))
      );

      if (existing.type === 'business') {
        await enqueueSync(billetageId, 'update', now);
      }
    }
  );

  const updated = await db.billetages.get(billetageId);
  if (!updated) {
    throw new Error('Impossible de relire le billetage après modification.');
  }
  return toBilletageRecord(updated);
}

export async function completeBilletage(
  billetageId: string
): Promise<BilletageRecord> {
  const existing = await db.billetages.get(billetageId);
  if (!existing) {
    throw new Error('Billetage introuvable.');
  }
  if (existing.status === 'validated') {
    throw new Error('Ce billetage est déjà validé.');
  }
  if (
    existing.declaredAmount !== null &&
    existing.declaredAmount !== undefined &&
    !isBilletageCoherent(
      existing.calculatedTotal,
      existing.declaredAmount
    )
  ) {
    throw new Error(
      `Écart détecté : ${existing.discrepancy ?? 0}. Le billetage doit être cohérent avant finalisation.`
    );
  }

  const now = Date.now();
  await db.transaction('rw', db.billetages, db.syncQueue, async () => {
    await db.billetages.update(billetageId, {
      status: 'completed',
      updatedAt: now,
      syncStatus: existing.type === 'business' ? 'pending' : 'local',
    });
    if (existing.type === 'business') {
      await enqueueSync(billetageId, 'update', now);
    }
  });

  const updated = await db.billetages.get(billetageId);
  if (!updated) {
    throw new Error('Impossible de relire le billetage finalisé.');
  }
  return toBilletageRecord(updated);
}

export async function validateBilletage(
  billetageId: string,
  validator?: { uid: string; name: string; role: string }
): Promise<BilletageRecord> {
  const existing = await db.billetages.get(billetageId);
  if (!existing) {
    throw new Error('Billetage introuvable.');
  }
  const now = Date.now();
  await db.transaction('rw', db.billetages, db.syncQueue, async () => {
    await db.billetages.update(billetageId, {
      status: 'validated',
      updatedAt: now,
      syncStatus: existing.type === 'business' ? 'pending' : 'local',
    });
    if (existing.type === 'business') {
      await enqueueSync(billetageId, 'update', now);
    }
  });

  if (validator) {
    await recordAuditLog({
      action: 'Validation billetage de caisse',
      category: 'operations',
      severity: 'info',
      details: `Validation du billetage ${existing.reference || existing.id} (${existing.currency} ${existing.calculatedTotal}) par ${validator.name}.`,
      actorName: validator.name,
      actorRole: validator.role,
      actorUid: validator.uid,
    });
  }

  const updated = await db.billetages.get(billetageId);
  if (!updated) {
    throw new Error('Impossible de relire le billetage validé.');
  }
  return toBilletageRecord(updated);
}

export async function cancelBilletage(billetageId: string): Promise<void> {
  const existing = await db.billetages.get(billetageId);
  if (!existing) {
    throw new Error('Billetage introuvable.');
  }
  if (existing.status === 'validated') {
    throw new Error('Un billetage validé ne peut pas être annulé.');
  }
  const now = Date.now();
  await db.transaction('rw', db.billetages, db.syncQueue, async () => {
    await db.billetages.update(billetageId, {
      status: 'cancelled',
      updatedAt: now,
      syncStatus: existing.type === 'business' ? 'pending' : 'local',
    });
    if (existing.type === 'business') {
      await enqueueSync(billetageId, 'update', now);
    }
  });
}

async function enqueueSync(
  billetageId: string,
  operation: SyncQueueItem['operation'],
  now: number
): Promise<void> {
  const existing = await db.syncQueue
    .where({
      entity: 'billetage',
      entityId: billetageId,
    })
    .first();

  if (existing?.id !== undefined) {
    await db.syncQueue.update(existing.id, {
      operation,
      status: 'pending',
      lastError: null,
      updatedAt: now,
    });
    return;
  }

  await db.syncQueue.add({
    entity: 'billetage',
    entityId: billetageId,
    operation,
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function getPendingSyncCount(): Promise<number> {
  return db.syncQueue.where('status').equals('pending').count();
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return db.syncQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
}

export async function deletePersonalBilletage(
  billetageId: string,
  userId: string
): Promise<void> {
  const existing = await db.billetages.get(billetageId);
  if (!existing) {
    throw new Error('Billetage introuvable.');
  }
  if (existing.type !== 'personal') {
    throw new Error('Cette méthode est réservée au calculateur personnel.');
  }
  if (existing.userId !== userId) {
    throw new Error('Vous ne pouvez supprimer que votre propre calcul.');
  }

  await db.transaction(
    'rw',
    db.billetages,
    db.billetageDenominations,
    async () => {
      await db.billetageDenominations
        .where('billetageId')
        .equals(billetageId)
        .delete();
      await db.billetages.delete(billetageId);
    }
  );
}
