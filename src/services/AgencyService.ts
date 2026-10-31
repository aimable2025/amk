import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { recordAuditLog } from './AuditService';

const AGENCIES_COLLECTION = 'agencies';
const AGENCIES_CACHE_KEY = 'ets_amani_agencies_cache';

export interface Agency {
  id: string;
  name: string;
  code?: string;
  city?: string;
  country?: string;
  address?: string;
  phone?: string;
  managerId?: string | null;
  managerName?: string | null;
  status?: 'active' | 'inactive' | 'suspended' | string;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface CreateAgencyInput {
  id?: string;
  name: string;
  code?: string;
  city?: string;
  country?: string;
  address?: string;
  phone?: string;
  managerId?: string | null;
  managerName?: string | null;
  status?: 'active' | 'inactive' | 'suspended';
  actor?: { uid: string; name: string; role: string };
}

export const DEFAULT_AGENCIES: Agency[] = [];

function readCachedAgencies(): Agency[] {
  try {
    const raw = localStorage.getItem(AGENCIES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedAgencies(agencies: Agency[]): void {
  try {
    localStorage.setItem(AGENCIES_CACHE_KEY, JSON.stringify(agencies));
  } catch {
    // ignore storage errors
  }
}

function mapAgencyDoc(id: string, data: Record<string, unknown>): Agency {
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : typeof data.nom === 'string' && data.nom.trim()
        ? data.nom.trim()
        : typeof data.agencyName === 'string' && data.agencyName.trim()
          ? data.agencyName.trim()
          : `Agence ${id}`;
  return {
    ...data,
    id,
    name,
    code: typeof data.code === 'string' ? data.code : undefined,
    city:
      typeof data.city === 'string'
        ? data.city
        : typeof data.ville === 'string'
          ? data.ville
          : undefined,
    country: typeof data.country === 'string' ? data.country : 'RDC',
    address: typeof data.address === 'string' ? data.address : undefined,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    managerId: typeof data.managerId === 'string' ? data.managerId : null,
    managerName: typeof data.managerName === 'string' ? data.managerName : null,
    status: typeof data.status === 'string' ? data.status : 'active',
  };
}

export async function getAgency(agencyId: string): Promise<Agency | null> {
  const normalizedAgencyId = agencyId.trim();
  if (!normalizedAgencyId) {
    return null;
  }
  try {
    const reference = doc(db, AGENCIES_COLLECTION, normalizedAgencyId);
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) {
      const agency = mapAgencyDoc(snapshot.id, snapshot.data());
      const cached = readCachedAgencies();
      const idx = cached.findIndex((a) => a.id === agency.id);
      if (idx >= 0) {
        cached[idx] = agency;
      } else {
        cached.push(agency);
      }
      writeCachedAgencies(cached);
      return agency;
    }
  } catch (error) {
    console.warn('Ets AMANI - getAgency lecture cache local :', error);
  }
  const cachedMatch = readCachedAgencies().find((a) => a.id === normalizedAgencyId);
  return cachedMatch || null;
}

export async function getAgencies(): Promise<Agency[]> {
  try {
    const reference = collection(db, AGENCIES_COLLECTION);
    const agenciesQuery = query(reference, orderBy('name'));
    const snapshot = await getDocs(agenciesQuery);
    const remoteAgencies = snapshot.docs.map((document) =>
      mapAgencyDoc(document.id, document.data())
    );
    writeCachedAgencies(remoteAgencies);
    return remoteAgencies;
  } catch (error) {
    console.warn('Ets AMANI - getAgencies lecture cache local :', error);
    return readCachedAgencies();
  }
}

export async function createAgency(input: CreateAgencyInput): Promise<Agency> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error("Le nom de l'agence est obligatoire.");
  }

  const cleanCode =
    input.code?.trim().toUpperCase() ||
    cleanName
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() +
      '-' +
      String(Date.now()).slice(-3);

  const agencyId =
    input.id?.trim() ||
    `agency-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36).slice(-4)}`;

  const payload: Agency = {
    id: agencyId,
    name: cleanName,
    code: cleanCode,
    city: input.city?.trim() || '',
    country: input.country?.trim() || 'RDC',
    address: input.address?.trim() || '',
    phone: input.phone?.trim() || '',
    managerId: input.managerId || null,
    managerName: input.managerName || null,
    status: input.status || 'active',
  };

  try {
    const ref = doc(db, AGENCIES_COLLECTION, agencyId);
    await setDoc(
      ref,
      {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Ets AMANI - createAgency enregistrement hors-ligne :', error);
  }

  const cached = readCachedAgencies().filter((a) => a.id !== agencyId);
  cached.push(payload);
  cached.sort((a, b) => a.name.localeCompare(b.name));
  writeCachedAgencies(cached);

  if (input.actor) {
    await recordAuditLog({
      action: `Création de l'agence ${cleanName} (${cleanCode})`,
      category: 'operations',
      severity: 'info',
      details: `Agence ${cleanName} (${payload.city || 'RDC'}) enregistrée avec le statut ${payload.status}.`,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      actorUid: input.actor.uid,
    });
  }

  return payload;
}

export async function updateAgency(
  agencyId: string,
  updates: Partial<Agency>,
  actor?: { uid: string; name: string; role: string }
): Promise<void> {
  const cleanId = agencyId.trim();
  if (!cleanId) return;

  const cleanUpdates: Record<string, unknown> = {};
  Object.entries(updates).forEach(([k, v]) => {
    if (v !== undefined) {
      cleanUpdates[k] = v;
    }
  });

  try {
    const ref = doc(db, AGENCIES_COLLECTION, cleanId);
    await updateDoc(ref, {
      ...cleanUpdates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Ets AMANI - updateAgency hors-ligne :', error);
  }

  const cached = readCachedAgencies();
  const idx = cached.findIndex((a) => a.id === cleanId);
  if (idx >= 0) {
    cached[idx] = { ...cached[idx], ...cleanUpdates };
    writeCachedAgencies(cached);
  }

  if (actor) {
    await recordAuditLog({
      action: `Mise à jour de l'agence ${cleanId}`,
      category: 'operations',
      severity: 'info',
      details: `Modifications appliquées sur l'agence ${cleanId}.`,
      actorName: actor.name,
      actorRole: actor.role,
      actorUid: actor.uid,
    });
  }
}

export async function deleteAgency(
  agencyId: string,
  actor?: { uid: string; name: string; role: string }
): Promise<void> {
  const cleanId = agencyId.trim();
  if (!cleanId) return;

  try {
    await deleteDoc(doc(db, AGENCIES_COLLECTION, cleanId));
  } catch (error) {
    console.warn('Ets AMANI - deleteAgency hors-ligne :', error);
  }

  const cached = readCachedAgencies().filter((a) => a.id !== cleanId);
  writeCachedAgencies(cached);

  if (actor) {
    await recordAuditLog({
      action: `Suppression de l'agence ${cleanId}`,
      category: 'operations',
      severity: 'warning',
      details: `L'agence ${cleanId} a été supprimée du réseau.`,
      actorName: actor.name,
      actorRole: actor.role,
      actorUid: actor.uid,
    });
  }
}

