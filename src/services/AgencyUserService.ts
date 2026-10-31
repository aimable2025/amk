import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AccountStatus,
  UserFunction,
  UserRole,
} from '../types/auth';

const USERS_COLLECTION = 'users';
const LOCAL_USERS_KEY = 'ets_amani_local_managed_users';

export interface AgencyUser {
  uid: string;
  displayName: string;
  email?: string;
  phone?: string;
  photoURL?: string | null;
  role: UserRole;
  function?: UserFunction;
  agencyId?: string | null;
  status: AccountStatus;
  isApproved: boolean;
}

function getLocalCachedUsers(): AgencyUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => ({
      uid: typeof item.uid === 'string' ? item.uid : '',
      displayName: typeof item.displayName === 'string' ? item.displayName : 'Utilisateur',
      email: typeof item.email === 'string' ? item.email : undefined,
      phone: typeof item.phone === 'string' ? item.phone : undefined,
      photoURL: typeof item.photoURL === 'string' ? item.photoURL : null,
      role: (item.role as UserRole) || 'client',
      function: item.function as UserFunction | undefined,
      agencyId: typeof item.agencyId === 'string' ? item.agencyId : null,
      status: (item.status as AccountStatus) || 'pending',
      isApproved: item.isApproved === true,
    })).filter((u) => Boolean(u.uid));
  } catch {
    return [];
  }
}

export async function getAgencyUsers(
  agencyId: string,
): Promise<AgencyUser[]> {
  const normalizedAgencyId = agencyId.trim();
  if (!normalizedAgencyId) {
    return [];
  }

  const usersMap = new Map<string, AgencyUser>();

  getLocalCachedUsers()
    .filter((u) => u.agencyId === normalizedAgencyId)
    .forEach((u) => usersMap.set(u.uid, u));

  try {
    const reference = collection(db, USERS_COLLECTION);
    const usersQuery = query(
      reference,
      where('agencyId', '==', normalizedAgencyId),
    );

    const snapshot = await getDocs(usersQuery);
    snapshot.docs.forEach((document) => {
      const data = document.data();
      const uid = typeof data.uid === 'string' && data.uid ? data.uid : document.id;
      usersMap.set(uid, {
        uid,
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Utilisateur',
        email: typeof data.email === 'string' ? data.email : undefined,
        phone: typeof data.phone === 'string' ? data.phone : undefined,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        role: data.role as UserRole,
        function: data.function as UserFunction | undefined,
        agencyId: typeof data.agencyId === 'string' ? data.agencyId : null,
        status: data.status as AccountStatus,
        isApproved: data.isApproved === true,
      });
    });
  } catch (error) {
    console.warn('Ets AMANI - lecture locale des utilisateurs d agence :', error);
  }

  return Array.from(usersMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export async function getAgencyUsersByRole(
  agencyId: string,
  role: UserRole,
): Promise<AgencyUser[]> {
  const normalizedAgencyId = agencyId.trim();
  if (!normalizedAgencyId) {
    return [];
  }

  const usersMap = new Map<string, AgencyUser>();

  getLocalCachedUsers()
    .filter((u) => u.agencyId === normalizedAgencyId && u.role === role)
    .forEach((u) => usersMap.set(u.uid, u));

  try {
    const reference = collection(db, USERS_COLLECTION);
    const usersQuery = query(
      reference,
      where('agencyId', '==', normalizedAgencyId),
      where('role', '==', role),
    );

    const snapshot = await getDocs(usersQuery);
    snapshot.docs.forEach((document) => {
      const data = document.data();
      const uid = typeof data.uid === 'string' && data.uid ? data.uid : document.id;
      usersMap.set(uid, {
        uid,
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Utilisateur',
        email: typeof data.email === 'string' ? data.email : undefined,
        phone: typeof data.phone === 'string' ? data.phone : undefined,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        role: data.role as UserRole,
        function: data.function as UserFunction | undefined,
        agencyId: typeof data.agencyId === 'string' ? data.agencyId : null,
        status: data.status as AccountStatus,
        isApproved: data.isApproved === true,
      });
    });
  } catch (error) {
    console.warn(`Ets AMANI - lecture locale des utilisateurs (${role}) de l agence :`, error);
  }

  return Array.from(usersMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export interface AgencyUserStats {
  total: number;
  agents: number;
  subscribers: number;
  members: number; // alias for backwards compatibility
  clients: number;
  activeAgents: number;
  activeSubscribers: number;
  activeMembers: number; // alias for backwards compatibility
  activeClients: number;
}

export async function getAgencyUserStats(
  agencyId: string,
): Promise<AgencyUserStats> {
  const users = await getAgencyUsers(agencyId);
  const agents = users.filter((item) => item.role === 'agent');
  const subscribers = users.filter((item) => item.role === 'abonne');
  const clients = users.filter((item) => item.role === 'client');

  const activeAgents = agents.filter(
    (item) => item.status === 'active' && item.isApproved,
  ).length;
  const activeSubscribers = subscribers.filter(
    (item) => item.status === 'active' && item.isApproved,
  ).length;
  const activeClients = clients.filter(
    (item) => item.status === 'active' && item.isApproved,
  ).length;

  return {
    total: users.length,
    agents: agents.length,
    subscribers: subscribers.length,
    members: subscribers.length,
    clients: clients.length,
    activeAgents,
    activeSubscribers,
    activeMembers: activeSubscribers,
    activeClients,
  };
}
