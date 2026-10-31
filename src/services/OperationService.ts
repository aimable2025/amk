import { db } from '../lib/db';
import { sendLocalPushNotification } from './LocalNotificationService';
import type {
  CreateOperationInput,
  Operation,
  OperationAssignment,
  OperationAssignmentStatus,
  OperationStatus,
} from '../types/operation';

const OPERATION_PREFIX = 'OP';

/**
 * Générateur de numéro d'opération unique et lisible pour la gestion opérationnelle.
 */
function generateOperationNumber(): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  let entropy = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    entropy = crypto.randomUUID().slice(0, 5).toUpperCase();
  } else {
    entropy = Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  return `${OPERATION_PREFIX}-${date}-${time}-${entropy}`;
}

/**
 * Générateur d'identifiant unique universel robuste.
 */
function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Empile ou met à jour un élément dans la file de synchronisation Offline-First.
 */
async function enqueueOperationSync(
  entity: 'operation' | 'operationAssignment',
  entityId: string,
  operation: 'create' | 'update' | 'delete',
): Promise<void> {
  const now = Date.now();

  const existing = await db.syncQueue
    .where({ entity, entityId })
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
    entity,
    entityId,
    operation,
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function createOperation(
  input: CreateOperationInput,
): Promise<Operation> {
  const now = Date.now();

  if (!input.title || !input.title.trim()) {
    throw new Error('Le titre de l opération est obligatoire.');
  }
  if (!input.agencyId || !input.agencyId.trim()) {
    throw new Error('Une agence doit être sélectionnée.');
  }
  if (!input.assignedAgentIds || input.assignedAgentIds.length === 0) {
    throw new Error('Au moins un agent doit être sélectionné.');
  }

  const operation: Operation = {
    id: generateId('operation'),
    operationNumber: generateOperationNumber(),
    type: input.type,
    title: input.title.trim(),
    description: input.description ? input.description.trim() : '',
    priority: input.priority,
    status: 'cree',
    agencyId: input.agencyId.trim(),
    agencyName: input.agencyName ? input.agencyName.trim() : 'Agence',
    assignedAgentIds: [...input.assignedAgentIds],
    assignedAgentNames: [...input.assignedAgentNames],
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdByRole: 'directeur_general',
    createdAt: now,
    updatedAt: now,
    dueDate: input.dueDate,
    amount: input.amount,
    currency: input.currency,
    operatorName: input.operatorName?.trim() || undefined,
    accountNumber: input.accountNumber?.trim() || undefined,
    comments: input.comments?.trim() || undefined,
    syncStatus: 'pending',
    lastSyncError: null,
  };

  await db.transaction(
    'rw',
    db.operations,
    db.operationAssignments,
    db.syncQueue,
    async () => {
      await db.operations.put(operation);

      for (let index = 0; index < input.assignedAgentIds.length; index += 1) {
        const agentId = input.assignedAgentIds[index];
        const agentName = input.assignedAgentNames[index] || 'Agent';

        const assignment: OperationAssignment = {
          id: generateId('assignment'),
          operationId: operation.id,
          operationNumber: operation.operationNumber,
          agencyId: operation.agencyId,
          agentId,
          agentName,
          assignedBy: input.createdBy,
          assignedByName: input.createdByName,
          status: 'propose',
          progress: 0,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        };

        await db.operationAssignments.put(assignment);
        await enqueueOperationSync('operationAssignment', assignment.id, 'create');
      }

      await enqueueOperationSync('operation', operation.id, 'create');
    },
  );

  // Notification push locale immédiate pour les agents affectés
  void sendLocalPushNotification({
    title: `🚨 [${operation.priority.toUpperCase()}] ${operation.title}`,
    body: `${operation.operationNumber} · ${operation.agencyName}\n${operation.description || 'Nouvelle tâche opérationnelle à traiter immédiatement.'}`,
    priority: operation.priority,
    tag: `op-${operation.id}`,
    data: {
      operationId: operation.id,
      url: `/dashboard/agent?opId=${operation.id}`,
    },
  });

  return operation;
}

export async function getOperation(
  id: string,
): Promise<Operation | undefined> {
  if (!id || !id.trim()) return undefined;
  return db.operations.get(id.trim());
}

export async function getOperationsByAgency(
  agencyId: string,
): Promise<Operation[]> {
  if (!agencyId || !agencyId.trim()) return [];
  return db.operations
    .where('agencyId')
    .equals(agencyId.trim())
    .reverse()
    .sortBy('createdAt');
}

export async function getOperationsByStatus(
  status: OperationStatus,
): Promise<Operation[]> {
  return db.operations
    .where('status')
    .equals(status)
    .reverse()
    .sortBy('createdAt');
}

export async function getAllOperations(): Promise<Operation[]> {
  return db.operations.orderBy('createdAt').reverse().toArray();
}

export async function updateOperationStatus(
  id: string,
  status: OperationStatus,
): Promise<void> {
  const operation = await db.operations.get(id);
  if (!operation) {
    throw new Error('Opération introuvable.');
  }

  const now = Date.now();
  const changes: Partial<Operation> = {
    status,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (status === 'termine') {
    changes.completedAt = now;
  }
  if (status === 'archive') {
    changes.closedAt = now;
  }

  await db.transaction('rw', db.operations, db.syncQueue, async () => {
    await db.operations.update(id, changes);
    await enqueueOperationSync('operation', id, 'update');
  });
}

export async function updateOperationAssignment(
  assignmentId: string,
  status: OperationAssignmentStatus,
  progress?: number,
  result?: string,
  comments?: string,
): Promise<void> {
  const assignment = await db.operationAssignments.get(assignmentId);
  if (!assignment) {
    throw new Error('Affectation introuvable.');
  }

  const now = Date.now();
  const safeProgress =
    typeof progress === 'number'
      ? Math.max(0, Math.min(100, progress))
      : assignment.progress;

  const changes: Partial<OperationAssignment> = {
    status,
    progress: safeProgress,
    result: result?.trim() || assignment.result,
    comments: comments?.trim() || assignment.comments,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (status === 'acceptee') {
    changes.acceptedAt = now;
  }
  if (status === 'en_cours') {
    changes.startedAt = now;
  }
  if (status === 'terminee') {
    changes.completedAt = now;
    changes.progress = 100;
  }

  await db.transaction(
    'rw',
    db.operations,
    db.operationAssignments,
    db.syncQueue,
    async () => {
      await db.operationAssignments.update(assignmentId, changes);
      await enqueueOperationSync('operationAssignment', assignmentId, 'update');

      // Vérification : Si toutes les affectations de l'opération sont terminées, passer l'opération en status 'termine'
      if (status === 'terminee') {
        const siblingAssignments = await db.operationAssignments
          .where('operationId')
          .equals(assignment.operationId)
          .toArray();

        const allCompleted = siblingAssignments.every(
          (item) => item.id === assignmentId || item.status === 'terminee',
        );

        if (allCompleted) {
          await db.operations.update(assignment.operationId, {
            status: 'termine',
            completedAt: now,
            updatedAt: now,
            syncStatus: 'pending',
          });
          await enqueueOperationSync('operation', assignment.operationId, 'update');
        }
      }
    },
  );
}

export async function getOperationAssignments(
  operationId: string,
): Promise<OperationAssignment[]> {
  if (!operationId || !operationId.trim()) return [];
  return db.operationAssignments
    .where('operationId')
    .equals(operationId.trim())
    .toArray();
}

export async function getAgentAssignments(
  agentId: string,
): Promise<OperationAssignment[]> {
  if (!agentId || !agentId.trim()) return [];
  return db.operationAssignments
    .where('agentId')
    .equals(agentId.trim())
    .reverse()
    .sortBy('createdAt');
}

export async function getPendingOperationSyncCount(): Promise<number> {
  return db.syncQueue
    .where('status')
    .equals('pending')
    .filter(
      (item) =>
        item.entity === 'operation' || item.entity === 'operationAssignment',
    )
    .count();
}
