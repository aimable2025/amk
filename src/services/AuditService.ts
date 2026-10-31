import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';

export type AuditSeverity = 'info' | 'warning' | 'critical' | 'security';
export type AuditCategory =
  | 'all'
  | 'auth'
  | 'security'
  | 'operations'
  | 'sync'
  | 'config'
  | 'rbac';

export interface AuditLogEntry {
  id: string;
  action: string;
  category: 'auth' | 'security' | 'operations' | 'sync' | 'config' | 'rbac';
  severity: AuditSeverity;
  details: string;
  actorName: string;
  actorRole: string;
  actorUid?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const LOCAL_AUDIT_STORAGE_KEY = 'ets_amani_local_audit_logs';

/**
 * Récupère le journal d'audit local en mode Offline-First.
 */
export function getLocalAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Enregistre un événement d'audit de manière persistante (Offline-First + tentative Firestore).
 */
export async function recordAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  const newEntry: AuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  // 1. Enregistrement local garanti (Offline-First)
  try {
    const existing = getLocalAuditLogs();
    const updated = [newEntry, ...existing].slice(0, 300);
    localStorage.setItem(LOCAL_AUDIT_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Erreur enregistrement audit log local:', error);
  }

  // 2. Tentative d'enregistrement dans Firestore si disponible
  try {
    const auditRef = collection(firestoreDb, 'auditLogs');
    await addDoc(auditRef, {
      ...entry,
      timestamp: serverTimestamp(),
      createdAtClient: newEntry.timestamp,
    });
  } catch {
    // Si Firestore refuse l'écriture (règle client ou hors-ligne), le log est conservé localement
  }

  return newEntry;
}

/**
 * Charge les logs combinés (Firestore si dispo + local).
 */
export async function getCombinedAuditLogs(): Promise<AuditLogEntry[]> {
  const localLogs = getLocalAuditLogs();
  try {
    const auditRef = collection(firestoreDb, 'auditLogs');
    const q = query(auditRef, orderBy('timestamp', 'desc'), limit(100));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const remoteLogs: AuditLogEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let timestamp = Date.now();
        if (data.timestamp?.seconds) {
          timestamp = data.timestamp.seconds * 1000;
        } else if (typeof data.timestamp === 'number') {
          timestamp = data.timestamp;
        } else if (typeof data.createdAtClient === 'number') {
          timestamp = data.createdAtClient;
        }
        return {
          id: docSnap.id,
          action: data.action || 'Action administrative',
          category: data.category || 'security',
          severity: data.severity || 'info',
          details: data.details || '',
          actorName: data.actorName || 'Utilisateur',
          actorRole: data.actorRole || 'administrateur_systeme',
          actorUid: data.actorUid,
          timestamp,
          metadata: data.metadata,
        };
      });

      const seenIds = new Set<string>();
      const combined: AuditLogEntry[] = [];
      for (const log of [...remoteLogs, ...localLogs]) {
        if (!seenIds.has(log.id)) {
          seenIds.add(log.id);
          combined.push(log);
        }
      }
      return combined.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch {
    // Si hors ligne ou permissions insuffisantes, utiliser les logs locaux
  }
  return localLogs;
}
