import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  deleteApp,
  initializeApp,
} from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from 'firebase/auth';
import {
  db,
  firebaseConfig,
  isFirebaseConfigured,
} from '../lib/firebase';
import type {
  AccountStatus,
  AppUser,
  RegistrationStatus,
  UserRole,
} from '../types/auth';
import type { FirestoreUserProfile } from './UserProfileService';
import { recordAuditLog } from './AuditService';

const USERS_COLLECTION = 'users';
const DIRECTOR_DOC_PATH = 'system/directorGeneral';
const DG_HISTORY_COLLECTION = 'system/directorGeneral/history';
const DG_FEATURES_COLLECTION = 'system/directorGeneral/features';
const DG_HISTORY_LOCAL_KEY = 'ets_amani_dg_governance_history';

export type DgGovernanceAction =
  | 'nomination'
  | 'suspension'
  | 'reactivation'
  | 'remplacement'
  | 'suppression';

export interface DirectorGeneralConfig {
  uid?: string;
  currentDirectorUid?: string;
  displayName?: string;
  currentDirectorName?: string;
  email?: string;
  phone?: string;
  photoURL?: string | null;
  status: 'active' | 'suspended' | 'inactive';
  isActive: boolean;
  appointedBy?: string;
  appointedByName?: string;
  appointedAt?: number;
  suspensionReason?: string;
  suspendedBy?: string;
  suspendedAt?: number;
  features?: Record<string, boolean>;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface DirectorGeneralRecord {
  uid: string;
  displayName?: string;
  email?: string;
  phone?: string;
  photoURL?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  isActive: boolean;
  appointedBy?: string;
  appointedByName?: string;
  appointedAt?: number;
  suspensionReason?: string;
  updatedAt?: unknown;
}

export interface DirectorGeneralHistoryEntry {
  id: string;
  action: DgGovernanceAction;
  targetUid: string;
  targetName: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface DirectorGeneralFeature {
  id: string;
  enabled: boolean;
  updatedBy?: string;
  updatedAt?: unknown;
}

function getDirectorGeneralConfigReference() {
  return doc(db, 'system', 'directorGeneral');
}

/**
 * Récupère l'historique local en mode Offline-First.
 */
function getLocalDgHistory(): DirectorGeneralHistoryEntry[] {
  try {
    const raw = localStorage.getItem(DG_HISTORY_LOCAL_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Enregistre un événement dans l'historique de gouvernance DG (Offline-First + Firestore).
 */
export async function recordDgHistoryEntry(
  entry: Omit<DirectorGeneralHistoryEntry, 'id' | 'timestamp'>,
): Promise<DirectorGeneralHistoryEntry> {
  const newEntry: DirectorGeneralHistoryEntry = {
    ...entry,
    id: `dg-gov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  try {
    const existing = getLocalDgHistory();
    const updated = [newEntry, ...existing].slice(0, 100);
    localStorage.setItem(DG_HISTORY_LOCAL_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Ets AMANI] Erreur enregistrement historique DG local :', err);
  }

  if (isFirebaseConfigured) {
    try {
      const historyRef = doc(collection(db, DG_HISTORY_COLLECTION), newEntry.id);
      await setDoc(historyRef, {
        ...newEntry,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Ets AMANI] Écriture Firestore historique DG reportée :', err);
    }
  }

  return newEntry;
}

/**
 * Récupère tout l'historique de gouvernance du DG.
 */
export async function getDirectorGeneralHistory(): Promise<DirectorGeneralHistoryEntry[]> {
  const localList = getLocalDgHistory();
  const entriesMap = new Map<string, DirectorGeneralHistoryEntry>();

  localList.forEach((item) => entriesMap.set(item.id, item));

  if (isFirebaseConfigured) {
    try {
      const q = query(
        collection(db, DG_HISTORY_COLLECTION),
        orderBy('timestamp', 'desc'),
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        entriesMap.set(docSnap.id, {
          id: docSnap.id,
          action: data.action,
          targetUid: data.targetUid,
          targetName: data.targetName,
          actorUid: data.actorUid,
          actorName: data.actorName,
          actorRole: data.actorRole,
          reason: data.reason,
          timestamp: data.timestamp || Date.now(),
          metadata: data.metadata,
        });
      });
    } catch (err) {
      console.warn('[Ets AMANI] Récupération Firestore historique DG :', err);
    }
  }

  const result = Array.from(entriesMap.values());
  result.sort((a, b) => b.timestamp - a.timestamp);
  return result;
}

/**
 * Écoute en temps réel de la configuration du Directeur Général.
 */
export function subscribeToDirectorGeneralConfig(
  onChange: (config: DirectorGeneralConfig | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const reference = getDirectorGeneralConfigReference();
  return onSnapshot(
    reference,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      onChange(snapshot.data() as DirectorGeneralConfig);
    },
    (error) => {
      console.warn('Synchronisation de la configuration DG reportée:', error);
      onError?.(error);
    },
  );
}

/**
 * Récupère directement la configuration actuelle du Directeur Général.
 */
export async function getDirectorGeneralConfig(): Promise<DirectorGeneralConfig | null> {
  const reference = getDirectorGeneralConfigReference();
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as DirectorGeneralConfig;
}

/**
 * Directeur Général actuellement actif.
 */
export async function getCurrentDirectorGeneral(): Promise<DirectorGeneralRecord | null> {
  const reference = doc(db, DIRECTOR_DOC_PATH);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return {
    uid: data.uid || '',
    displayName: data.displayName,
    email: data.email,
    phone: data.phone,
    photoURL: data.photoURL || null,
    status: data.status || (data.isActive ? 'active' : 'inactive'),
    isActive: data.status === 'active' || data.isActive === true,
    appointedBy: data.appointedBy,
    appointedByName: data.appointedByName,
    appointedAt: data.appointedAt,
    suspensionReason: data.suspensionReason,
    updatedAt: data.updatedAt,
  };
}

/**
 * Vérifie si un utilisateur est le DG officiel et actif.
 */
export async function isCurrentDirectorGeneral(uid: string): Promise<boolean> {
  const director = await getCurrentDirectorGeneral();
  return director?.status === 'active' && director.uid === uid;
}

/**
 * Nomination ou création d'un nouveau DG par l'Administrateur Système.
 */
export async function appointDirectorGeneral(
  params: {
    uid?: string;
    displayName: string;
    email: string;
    phone?: string;
    password?: string;
  },
  actor: { uid: string; name: string; role: string },
  previousDgUid?: string,
): Promise<DirectorGeneralRecord> {
  let finalUid = params.uid;

  // Création du compte Firebase Auth si mot de passe fourni et compte absent
  if (!finalUid) {
    if (isFirebaseConfigured && params.password && params.email) {
      try {
        const secondaryApp = initializeApp(firebaseConfig, `AuthCreateDG_${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, params.email, params.password);
        finalUid = cred.user.uid;
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
      } catch (authError) {
        console.warn('Création Firebase Auth DG via instance secondaire :', authError);
      }
    }
    if (!finalUid) {
      finalUid = `dg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
  }

  // Si un précédent DG existait, désactiver son mandat
  if (previousDgUid && previousDgUid !== finalUid) {
    try {
      const oldDgRef = doc(db, USERS_COLLECTION, previousDgUid);
      await updateDoc(oldDgRef, {
        status: 'inactive',
        isApproved: false,
        notes: `Remplacé en tant que DG par ${params.displayName} le ${new Date().toLocaleDateString('fr-FR')}`,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore
    }
  }

  // 1. Mettre à jour / Créer le document utilisateur
  const dgCanonicalPermissions = [
    '*',
    'users.read',
    'users.manage',
    'registrations.validate',
    'agencies.manage',
    'transactions.manage',
    'billetage.access',
    'reports.manage',
    'commissions.manage',
    'audit.read',
    'internal_numbers.manage',
    'notifications.manage',
    'communication.manage',
  ];
  const userDocRef = doc(db, USERS_COLLECTION, finalUid);
  await setDoc(
    userDocRef,
    {
      uid: finalUid,
      displayName: params.displayName.trim(),
      email: params.email.trim(),
      phone: params.phone?.trim() || null,
      category: 'direction',
      role: 'directeur_general',
      status: 'active',
      isApproved: true,
      registrationStatus: 'approved',
      permissions: dgCanonicalPermissions,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 2. Mettre à jour le singleton DG de gouvernance
  const dgRecord: DirectorGeneralRecord = {
    uid: finalUid,
    displayName: params.displayName.trim(),
    email: params.email.trim(),
    phone: params.phone?.trim() || '',
    status: 'active',
    isActive: true,
    appointedBy: actor.uid,
    appointedByName: actor.name,
    appointedAt: Date.now(),
  };

  const dgDocRef = doc(db, DIRECTOR_DOC_PATH);
  await setDoc(
    dgDocRef,
    {
      ...dgRecord,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 3. Journal d'audit & Historique
  const actionType: DgGovernanceAction = previousDgUid ? 'remplacement' : 'nomination';
  await recordAuditLog({
    action: previousDgUid ? 'REMPLACEMENT_DIRECTEUR_GENERAL' : 'NOMINATION_DIRECTEUR_GENERAL',
    category: 'rbac',
    severity: 'critical',
    details: `${actor.name} a nommé ${params.displayName} (${params.email}) comme Directeur Général.${
      previousDgUid ? ` Mandat précédent (${previousDgUid}) clôturé.` : ''
    }`,
    actorName: actor.name,
    actorRole: actor.role,
    actorUid: actor.uid,
    metadata: { newDgUid: finalUid, previousDgUid },
  });

  await recordDgHistoryEntry({
    action: actionType,
    targetUid: finalUid,
    targetName: params.displayName.trim(),
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    reason: previousDgUid ? `Remplacement de l'ancien DG (${previousDgUid})` : 'Nomination initiale au poste de DG',
  });

  return dgRecord;
}

/**
 * Suspend le mandat du Directeur Général en titre.
 */
export async function suspendDirectorGeneral(
  dgUid: string,
  reason: string,
  actor: { uid: string; name: string; role: string },
): Promise<void> {
  const dgDocRef = doc(db, DIRECTOR_DOC_PATH);
  await setDoc(
    dgDocRef,
    {
      status: 'suspended',
      isActive: false,
      suspensionReason: reason,
      suspendedBy: actor.uid,
      suspendedByName: actor.name,
      suspendedAt: Date.now(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Mettre à jour le profil utilisateur correspondant
  if (dgUid) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, dgUid);
      await updateDoc(userDocRef, {
        status: 'suspended' as AccountStatus,
        isApproved: false,
        rejectionReason: reason,
        notes: `Suspendu par ${actor.name} le ${new Date().toLocaleDateString('fr-FR')} : ${reason}`,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Ets AMANI] Erreur suspension user DG :', err);
    }
  }

  // Audit et Historique
  await recordAuditLog({
    action: 'SUSPENSION_DIRECTEUR_GENERAL',
    category: 'rbac',
    severity: 'critical',
    details: `Le Directeur Général (UID: ${dgUid}) a été suspendu par ${actor.name}. Motif : ${reason}`,
    actorName: actor.name,
    actorRole: actor.role,
    actorUid: actor.uid,
    metadata: { dgUid, reason },
  });

  await recordDgHistoryEntry({
    action: 'suspension',
    targetUid: dgUid,
    targetName: 'Directeur Général',
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    reason,
  });
}

/**
 * Réactive le Directeur Général suspendu.
 */
export async function reactivateDirectorGeneral(
  dgUid: string,
  actor: { uid: string; name: string; role: string },
): Promise<void> {
  const dgDocRef = doc(db, DIRECTOR_DOC_PATH);
  await setDoc(
    dgDocRef,
    {
      status: 'active',
      isActive: true,
      suspensionReason: null,
      reactivatedBy: actor.uid,
      reactivatedByName: actor.name,
      reactivatedAt: Date.now(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (dgUid) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, dgUid);
      await updateDoc(userDocRef, {
        status: 'active' as AccountStatus,
        isApproved: true,
        notes: `Réactivé par ${actor.name} le ${new Date().toLocaleDateString('fr-FR')}`,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Ets AMANI] Erreur réactivation user DG :', err);
    }
  }

  await recordAuditLog({
    action: 'REACTIVATION_DIRECTEUR_GENERAL',
    category: 'rbac',
    severity: 'critical',
    details: `Le Directeur Général (UID: ${dgUid}) a été réactivé avec succès par ${actor.name}.`,
    actorName: actor.name,
    actorRole: actor.role,
    actorUid: actor.uid,
    metadata: { dgUid },
  });

  await recordDgHistoryEntry({
    action: 'reactivation',
    targetUid: dgUid,
    targetName: 'Directeur Général',
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    reason: 'Réactivation des prérogatives de direction',
  });
}

/**
 * Révocation / Suppression logique du mandat DG actuel.
 */
export async function revokeDirectorGeneral(
  dgUid: string,
  reason: string,
  actor: { uid: string; name: string; role: string },
): Promise<void> {
  const dgDocRef = doc(db, DIRECTOR_DOC_PATH);
  await setDoc(
    dgDocRef,
    {
      status: 'inactive',
      isActive: false,
      revocationReason: reason,
      revokedBy: actor.uid,
      revokedByName: actor.name,
      revokedAt: Date.now(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (dgUid) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, dgUid);
      await updateDoc(userDocRef, {
        status: 'disabled' as AccountStatus,
        isApproved: false,
        notes: `Mandat révoqué par ${actor.name} le ${new Date().toLocaleDateString('fr-FR')} : ${reason}`,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Ets AMANI] Erreur révocation user DG :', err);
    }
  }

  await recordAuditLog({
    action: 'REVOCATION_DIRECTEUR_GENERAL',
    category: 'rbac',
    severity: 'critical',
    details: `Mandat du Directeur Général (UID: ${dgUid}) révoqué par ${actor.name}. Motif : ${reason}`,
    actorName: actor.name,
    actorRole: actor.role,
    actorUid: actor.uid,
    metadata: { dgUid, reason },
  });

  await recordDgHistoryEntry({
    action: 'suppression',
    targetUid: dgUid,
    targetName: 'Directeur Général',
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    reason,
  });
}

/**
 * Active ou désactive une prérogative / fonctionnalité DG.
 */
export async function setDirectorGeneralFeature(
  featureId: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  const reference = getDirectorGeneralConfigReference();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const currentData = snapshot.exists()
      ? (snapshot.data() as DirectorGeneralConfig)
      : ({} as DirectorGeneralConfig);
    const currentFeatures = currentData.features ?? {};
    const updatedFeatures = {
      ...currentFeatures,
      [featureId]: enabled,
    };
    transaction.set(
      reference,
      {
        features: updatedFeatures,
        updatedBy,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

/**
 * Demandes d'inscription en attente ou en révision.
 */
export async function getPendingRegistrations(): Promise<FirestoreUserProfile[]> {
  const registrationsQuery = query(
    collection(db, USERS_COLLECTION),
    where('registrationStatus', 'in', ['pending', 'under_review']),
  );
  const snapshot = await getDocs(registrationsQuery);
  return snapshot.docs.map((document) => ({
    ...(document.data() as FirestoreUserProfile),
    uid: (document.data() as FirestoreUserProfile).uid || document.id,
  }));
}

/**
 * Met une demande en cours d'analyse.
 */
export async function markRegistrationUnderReview(
  uid: string,
  reviewerUid: string,
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    registrationStatus: 'under_review' as RegistrationStatus,
    reviewedBy: reviewerUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Validation d'une inscription.
 */
export async function approveRegistration(
  uid: string,
  approverUid: string,
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    status: 'active',
    isApproved: true,
    registrationStatus: 'approved',
    approvedBy: approverUid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rejet d'une inscription.
 */
export async function rejectRegistration(
  uid: string,
  reviewerUid: string,
  reason?: string,
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    status: 'rejected',
    isApproved: false,
    registrationStatus: 'rejected',
    rejectedBy: reviewerUid,
    rejectedAt: serverTimestamp(),
    rejectionReason: reason || 'Demande rejetée',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Récupère le profil utilisateur.
 */
export async function getUserByUid(uid: string): Promise<AppUser | null> {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as AppUser;
}
