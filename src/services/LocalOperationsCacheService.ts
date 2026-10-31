/**
 * Service de mise en cache locale (IndexedDB / Dexie) des opérations d'Ets AMANI
 * Permet aux agents de consulter, filtrer et traiter les opérations même en l'absence totale de connexion internet.
 */

import { collection, getDocs, limit, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore, isFirebaseConfigured } from '../lib/firebase';
import type { Operation, OperationPriority, OperationStatus, OperationType } from '../types/operation';

const CACHE_METADATA_KEY = 'ets_amani_operations_cache_meta';

export interface CacheMetadata {
  lastSyncTimestamp: number | null;
  totalCached: number;
  offlineReady: boolean;
  syncedByAgentId?: string;
}

// Jeu d'opérations initiales certifiées de l'Ets AMANI pré-mises en cache localement
export const DEFAULT_OFFLINE_OPERATIONS: Operation[] = [
  {
    id: 'op-cache-goma-01',
    operationNumber: 'OP-20261023-0830-GOM01',
    type: 'depot',
    title: 'Dépôt Espèces Client V.I.P',
    description: 'Dépôt en espèces de 4 500 USD pour le compte commerçant Ets Kivu Import. Vérification et comptage des billets requis.',
    priority: 'maintenant',
    status: 'cree',
    agencyId: 'agence-goma-centre',
    agencyName: 'Agence Goma Centre',
    assignedAgentIds: ['agent-goma-01'],
    assignedAgentNames: ['Kambale Eric'],
    createdBy: 'directeur_general',
    createdByName: 'Direction Générale Ets AMANI',
    createdByRole: 'directeur_general',
    createdAt: Date.now() - 1000 * 60 * 25,
    updatedAt: Date.now() - 1000 * 60 * 25,
    amount: 4500,
    currency: 'USD',
    operatorName: 'Airtel Money / Cash',
    accountNumber: 'CLI-0994821',
    comments: 'Client prioritaire au guichet n°1',
    syncStatus: 'synced',
  },
  {
    id: 'op-cache-goma-02',
    operationNumber: 'OP-20261023-0915-GOM02',
    type: 'transfert',
    title: 'Transfert Inter-Agence Urgent Goma -> Butembo',
    description: 'Transfert de fonds urgent de 2 800 USD pour déblocage caisse Butembo suite à forte demande de retraits.',
    priority: 'tres_urgent',
    status: 'assigne',
    agencyId: 'agence-goma-centre',
    agencyName: 'Agence Goma Centre',
    assignedAgentIds: ['agent-goma-01'],
    assignedAgentNames: ['Kambale Eric'],
    createdBy: 'admin_agence_goma',
    createdByName: 'Admin Agence Goma',
    createdByRole: 'administrateur_agence',
    createdAt: Date.now() - 1000 * 60 * 55,
    updatedAt: Date.now() - 1000 * 60 * 40,
    amount: 2800,
    currency: 'USD',
    operatorName: 'Vodacom M-Pesa / Western',
    accountNumber: 'TRF-BTM-8821',
    comments: 'Bordereau signé par le caissier émetteur',
    syncStatus: 'synced',
  },
  {
    id: 'op-cache-goma-03',
    operationNumber: 'OP-20261023-1000-GOM03',
    type: 'retrait',
    title: 'Retrait Espèces Abonné Entreprise',
    description: 'Paiement retrait abonné de 1 200 000 CDF pour paie personnel chantier.',
    priority: 'urgent',
    status: 'en_cours',
    agencyId: 'agence-goma-centre',
    agencyName: 'Agence Goma Centre',
    assignedAgentIds: ['agent-goma-01'],
    assignedAgentNames: ['Kambale Eric'],
    createdBy: 'admin_agence_goma',
    createdByName: 'Admin Agence Goma',
    createdByRole: 'administrateur_agence',
    createdAt: Date.now() - 1000 * 60 * 90,
    updatedAt: Date.now() - 1000 * 60 * 15,
    amount: 1200000,
    currency: 'CDF',
    operatorName: 'Orange Money',
    accountNumber: 'ABN-449182',
    syncStatus: 'synced',
  },
  {
    id: 'op-cache-goma-04',
    operationNumber: 'OP-20261023-0745-GOM04',
    type: 'approvisionnement',
    title: 'Approvisionnement Caisse Guichet Matin',
    description: 'Dotation initiale de caisse : 10 000 USD et 5 000 000 CDF reçus du coffre-fort principal.',
    priority: 'normal',
    status: 'termine',
    agencyId: 'agence-goma-centre',
    agencyName: 'Agence Goma Centre',
    assignedAgentIds: ['agent-goma-01'],
    assignedAgentNames: ['Kambale Eric'],
    createdBy: 'directeur_general',
    createdByName: 'Direction Générale',
    createdByRole: 'directeur_general',
    createdAt: Date.now() - 1000 * 60 * 180,
    updatedAt: Date.now() - 1000 * 60 * 160,
    completedAt: Date.now() - 1000 * 60 * 160,
    amount: 10000,
    currency: 'USD',
    comments: 'Billetage conforme et scellé',
    syncStatus: 'synced',
  },
  {
    id: 'op-cache-btb-05',
    operationNumber: 'OP-20261023-0800-BTB05',
    type: 'collecte',
    title: 'Collecte Recettes Marché Central',
    description: 'Collecte journalière des dépôts des commerçants partenaires.',
    priority: 'normal',
    status: 'termine',
    agencyId: 'agence-butembo',
    agencyName: 'Agence Butembo',
    assignedAgentIds: ['agent-butembo-02'],
    assignedAgentNames: ['Mumbere Patrick'],
    createdBy: 'directeur_general',
    createdByName: 'Direction Générale',
    createdByRole: 'directeur_general',
    createdAt: Date.now() - 1000 * 60 * 240,
    updatedAt: Date.now() - 1000 * 60 * 120,
    completedAt: Date.now() - 1000 * 60 * 120,
    amount: 3200,
    currency: 'USD',
    syncStatus: 'synced',
  },
];

/**
 * Initialise le cache local Dexie si aucune opération n'est encore présente
 */
export async function seedOperationsCacheIfEmpty(): Promise<void> {
  try {
    const count = await db.operations.count();
    if (count === 0) {
      await db.operations.bulkPut(DEFAULT_OFFLINE_OPERATIONS);
      saveCacheMetadata({
        lastSyncTimestamp: Date.now(),
        totalCached: DEFAULT_OFFLINE_OPERATIONS.length,
        offlineReady: true,
      });
      console.log('[Ets AMANI] Cache IndexedDB initialisé avec les opérations certifiées.');
    }
  } catch (err) {
    console.warn('[Ets AMANI] Erreur initialisation seed cache opérations :', err);
  }
}

/**
 * Enregistre les métadonnées de synchronisation du cache local
 */
export function saveCacheMetadata(meta: Partial<CacheMetadata>): void {
  try {
    const current = getCacheMetadata();
    const updated: CacheMetadata = {
      ...current,
      ...meta,
    };
    localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * Récupère les métadonnées de mise en cache locale
 */
export function getCacheMetadata(): CacheMetadata {
  try {
    const raw = localStorage.getItem(CACHE_METADATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        lastSyncTimestamp: parsed.lastSyncTimestamp ?? null,
        totalCached: parsed.totalCached ?? 0,
        offlineReady: parsed.offlineReady ?? true,
        syncedByAgentId: parsed.syncedByAgentId,
      };
    }
  } catch {
    // ignore
  }
  return {
    lastSyncTimestamp: null,
    totalCached: 0,
    offlineReady: true,
  };
}

/**
 * Récupère les opérations stockées localement dans IndexedDB avec filtrage avancé
 */
export async function getCachedOperations(filters?: {
  agentId?: string;
  agencyId?: string;
  status?: string;
  priority?: string;
  type?: string;
  searchQuery?: string;
}): Promise<Operation[]> {
  try {
    // Si la table est vide, on s'assure qu'elle est initialisée
    const count = await db.operations.count();
    if (count === 0) {
      await seedOperationsCacheIfEmpty();
    }

    let queryCollection = db.operations.orderBy('createdAt').reverse();
    let ops = await queryCollection.toArray();

    // Filtre par agent
    if (filters?.agentId) {
      const aid = filters.agentId.toLowerCase();
      ops = ops.filter(
        (op) =>
          op.assignedAgentIds?.some((id) => id.toLowerCase() === aid) ||
          op.assignedAgentNames?.some((name) => name.toLowerCase().includes(aid)) ||
          op.createdBy?.toLowerCase() === aid
      );
    }

    // Filtre par agence
    if (filters?.agencyId) {
      const agencyId = filters.agencyId;
      ops = ops.filter((op) => op.agencyId === agencyId);
    }

    // Filtre par statut
    if (filters?.status && filters.status !== 'all') {
      ops = ops.filter((op) => op.status === filters.status);
    }

    // Filtre par priorité
    if (filters?.priority && filters.priority !== 'all') {
      ops = ops.filter((op) => op.priority === filters.priority);
    }

    // Filtre par type
    if (filters?.type && filters.type !== 'all') {
      ops = ops.filter((op) => op.type === filters.type);
    }

    // Filtre de recherche textuelle
    if (filters?.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase();
      ops = ops.filter(
        (op) =>
          op.operationNumber?.toLowerCase().includes(q) ||
          op.title?.toLowerCase().includes(q) ||
          op.description?.toLowerCase().includes(q) ||
          op.agencyName?.toLowerCase().includes(q) ||
          op.accountNumber?.toLowerCase().includes(q) ||
          op.operatorName?.toLowerCase().includes(q) ||
          op.assignedAgentNames?.some((n) => n.toLowerCase().includes(q))
      );
    }

    // Met à jour le nombre total en cache dans les métadonnées
    saveCacheMetadata({ totalCached: ops.length, offlineReady: true });

    return ops;
  } catch (err) {
    console.warn('[Ets AMANI] Erreur lecture cache IndexedDB opérations :', err);
    return DEFAULT_OFFLINE_OPERATIONS;
  }
}

/**
 * Récupère le résumé chiffré des opérations en cache pour l'agent
 */
export async function getCachedOperationsSummary(agentId?: string): Promise<{
  total: number;
  pending: number;
  urgent: number;
  completed: number;
  lastSync: number | null;
  totalUsdAmount: number;
  totalCdfAmount: number;
}> {
  const ops = await getCachedOperations(agentId ? { agentId } : undefined);
  const meta = getCacheMetadata();

  let totalUsd = 0;
  let totalCdf = 0;
  let urgent = 0;
  let pending = 0;
  let completed = 0;

  for (const op of ops) {
    if (op.status === 'termine') {
      completed += 1;
    } else {
      pending += 1;
    }

    if (
      op.priority === 'maintenant' ||
      op.priority === 'tres_urgent' ||
      op.priority === 'urgent'
    ) {
      urgent += 1;
    }

    if (op.amount && typeof op.amount === 'number') {
      if (op.currency === 'USD') {
        totalUsd += op.amount;
      } else if (op.currency === 'CDF') {
        totalCdf += op.amount;
      }
    }
  }

  return {
    total: ops.length,
    pending,
    urgent,
    completed,
    lastSync: meta.lastSyncTimestamp,
    totalUsdAmount: totalUsd,
    totalCdfAmount: totalCdf,
  };
}

/**
 * Synchronise les opérations distantes (Firestore) vers le cache local IndexedDB (Dexie)
 */
export async function syncOperationsToIndexedDBCache(params?: {
  agentId?: string;
  agencyId?: string;
}): Promise<{
  syncedCount: number;
  timestamp: number;
  isOnline: boolean;
}> {
  const now = Date.now();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline || !isFirebaseConfigured || !firestore) {
    // Mode hors-ligne : on vérifie que le cache local est bien garni
    await seedOperationsCacheIfEmpty();
    const count = await db.operations.count();
    return {
      syncedCount: count,
      timestamp: getCacheMetadata().lastSyncTimestamp || now,
      isOnline: false,
    };
  }

  try {
    const q = query(
      collection(firestore, 'operations'),
      orderBy('createdAt', 'desc'),
      limit(250)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const remoteOps: Operation[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const op: Operation = {
          id: docSnap.id,
          operationNumber: data.operationNumber || `OP-${docSnap.id.slice(0, 8)}`,
          type: data.type || 'autre',
          title: data.title || 'Opération',
          description: data.description || '',
          priority: data.priority || 'normal',
          status: data.status || 'cree',
          agencyId: data.agencyId || 'globale',
          agencyName: data.agencyName || 'Agence',
          assignedAgentIds: data.assignedAgentIds || [],
          assignedAgentNames: data.assignedAgentNames || [],
          createdBy: data.createdBy || '',
          createdByName: data.createdByName || '',
          createdByRole:
            data.createdByRole === 'administrateur_agence' ||
            data.createdByRole === 'administrateur_systeme' ||
            data.createdByRole === 'directeur_general'
              ? data.createdByRole
              : 'directeur_general',
          createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Number(data.createdAt || now),
          updatedAt: typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : Number(data.updatedAt || now),
          dueDate: data.dueDate,
          amount: data.amount,
          currency: data.currency,
          operatorName: data.operatorName,
          accountNumber: data.accountNumber,
          comments: data.comments,
          completedAt: data.completedAt,
          syncStatus: 'synced',
        };
        remoteOps.push(op);
      });

      // Stocker en bloc dans IndexedDB (Dexie)
      await db.operations.bulkPut(remoteOps);

      saveCacheMetadata({
        lastSyncTimestamp: now,
        totalCached: await db.operations.count(),
        offlineReady: true,
        syncedByAgentId: params?.agentId,
      });

      return {
        syncedCount: remoteOps.length,
        timestamp: now,
        isOnline: true,
      };
    }
  } catch (err) {
    console.warn('[Ets AMANI] Synchronisation Firestore vers cache IndexedDB échouée, conservation du cache existant :', err);
  }

  // Fallback si vide
  await seedOperationsCacheIfEmpty();
  const count = await db.operations.count();
  return {
    syncedCount: count,
    timestamp: getCacheMetadata().lastSyncTimestamp || now,
    isOnline: false,
  };
}

/**
 * Formate un timestamp relatif en français pour l'agent (ex: "Il y a 3 minutes")
 */
export function formatRelativeCacheTime(timestamp: number | null): string {
  if (!timestamp) return 'Jamais synchronisé';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffSec < 45) return 'À l’instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffHours < 24) return `Il y a ${diffHours} h`;

  const d = new Date(timestamp);
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
