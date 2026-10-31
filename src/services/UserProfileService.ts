import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AccountStatus,
  AppUser,
  PublicRegistrationRole,
  RegistrationStatus,
  UserCategory,
  UserFunction,
  UserRole,
} from '../types/auth';

const USERS_COLLECTION = 'users';

export interface FirestoreUserProfile {
  uid: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  requestedRole?: PublicRegistrationRole;
  category: UserCategory;
  role: UserRole;
  function?: UserFunction;
  agencyId?: string | null;
  status: AccountStatus;
  isApproved: boolean;
  permissions: string[];
  lastName?: string;
  postName?: string;
  firstName?: string;
  gender?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  avenue?: string;
  neighborhood?: string;
  commune?: string;
  province?: string;
  nationality?: string;
  profession?: string;
  identityDocument?: string;
  registrationStatus?: RegistrationStatus;
  reviewedBy?: string;
  reviewedAt?: unknown;
  approvedBy?: string;
  approvedAt?: unknown;
  rejectedBy?: string;
  rejectedAt?: unknown;
  rejectionReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
}

export async function getUserProfile(
  uid: string
): Promise<AppUser | null> {
  const reference = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(reference);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as FirestoreUserProfile;
  return {
    uid: data.uid || uid,
    displayName: data.displayName || 'Utilisateur',
    email: data.email || undefined,
    phone: data.phone || undefined,
    photoURL: data.photoURL || undefined,
    requestedRole: data.requestedRole,
    registrationStatus: data.registrationStatus,
    reviewedBy: data.reviewedBy,
    reviewedAt: typeof data.reviewedAt === 'number' ? data.reviewedAt : undefined,
    approvedBy: data.approvedBy,
    approvedAt: typeof data.approvedAt === 'number' ? data.approvedAt : undefined,
    rejectedBy: data.rejectedBy,
    rejectedAt: typeof data.rejectedAt === 'number' ? data.rejectedAt : undefined,
    rejectionReason: data.rejectionReason,
    category: data.category,
    role: data.role,
    function: data.function,
    agencyId: data.agencyId ?? null,
    status: data.status,
    isApproved: data.isApproved === true,
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

export interface PendingUserProfileInput {
  fullName: string;
  requestedRole: PublicRegistrationRole;
  lastName: string;
  postName: string;
  firstName: string;
  gender: string;
  dateOfBirth: string;
  placeOfBirth: string;
  avenue: string;
  neighborhood: string;
  commune: string;
  province: string;
  nationality: string;
  profession: string;
  identityDocument: string;
  phone: string;
  email: string;
  profilePhoto?: File;
  photoURL?: string | null;
  agencyId?: string | null;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 256,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Impossible de lire le fichier image.'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch {
          resolve(result);
        }
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => reject(new Error('Erreur de lecture de la photo.'));
    reader.readAsDataURL(file);
  });
}

export async function createPendingUserProfile(
  uid: string,
  input: PendingUserProfileInput
): Promise<void> {
  const reference = doc(db, USERS_COLLECTION, uid);
  const isClient = input.requestedRole === 'client';
  const agencyId = isClient ? null : input.agencyId ?? null;

  let resolvedPhotoUrl = input.photoURL ?? null;
  if (!resolvedPhotoUrl && input.profilePhoto) {
    try {
      resolvedPhotoUrl = await compressImageToDataUrl(input.profilePhoto);
    } catch {
      resolvedPhotoUrl = null;
    }
  }

  const profile: Record<string, unknown> = {
    uid,
    displayName: input.fullName.trim() || 'Utilisateur',
    email: input.email ? input.email.trim().toLowerCase() : null,
    phone: input.phone.trim(),
    photoURL: resolvedPhotoUrl,
    requestedRole: input.requestedRole,
    category: input.requestedRole,
    role: input.requestedRole,
    agencyId,
    status: 'pending' as AccountStatus,
    isApproved: false,
    permissions: [],
    lastName: input.lastName.trim(),
    postName: input.postName.trim(),
    firstName: input.firstName.trim(),
    gender: input.gender.trim(),
    dateOfBirth: input.dateOfBirth.trim(),
    placeOfBirth: input.placeOfBirth.trim(),
    avenue: input.avenue.trim(),
    neighborhood: input.neighborhood.trim(),
    commune: input.commune.trim(),
    province: input.province.trim(),
    nationality: input.nationality.trim(),
    profession: input.profession.trim(),
    identityDocument: input.identityDocument.trim(),
    registrationStatus: 'pending' as RegistrationStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(reference, profile);
}

function getTimestampValue(value: unknown): number {
  if (!value) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export async function getPendingRegistrationRequests(): Promise<FirestoreUserProfile[]> {
  try {
    const usersReference = collection(db, USERS_COLLECTION);
    const pendingQuery = query(
      usersReference,
      where('registrationStatus', 'in', ['pending', 'under_review'])
    );
    const snapshot = await getDocs(pendingQuery);
    const registrations = snapshot.docs
      .map((document) => {
        const data = document.data() as FirestoreUserProfile;
        return {
          ...data,
          uid: data.uid || document.id,
        };
      })
      .filter(
        (registration) =>
          registration.requestedRole === 'client' ||
          registration.requestedRole === 'abonne'
      )
      .filter(
        (registration) =>
          registration.registrationStatus === 'pending' ||
          registration.registrationStatus === 'under_review'
      )
      .sort(
        (a, b) =>
          getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
      );

    return registrations;
  } catch (error) {
    console.warn('Ets AMANI - Erreur getPendingRegistrationRequests, retour fallback vide:', error);
    return [];
  }
}

export async function markRegistrationUnderReview(
  uid: string,
  reviewerUid: string
): Promise<void> {
  const reference = doc(db, USERS_COLLECTION, uid);
  await updateDoc(reference, {
    registrationStatus: 'under_review',
    reviewedBy: reviewerUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function approveRegistration(
  uid: string,
  approverUid: string
): Promise<void> {
  const reference = doc(db, USERS_COLLECTION, uid);
  await updateDoc(reference, {
    status: 'active',
    isApproved: true,
    registrationStatus: 'approved',
    approvedBy: approverUid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectRegistration(
  uid: string,
  reviewerUid: string,
  rejectionReason?: string
): Promise<void> {
  const reference = doc(db, USERS_COLLECTION, uid);
  await updateDoc(reference, {
    status: 'rejected',
    isApproved: false,
    registrationStatus: 'rejected',
    rejectedBy: reviewerUid,
    rejectedAt: serverTimestamp(),
    rejectionReason: rejectionReason?.trim() || 'Demande d inscription rejetée.',
    updatedAt: serverTimestamp(),
  });
}

export async function getRegistrationRequestsByRole(
  role: PublicRegistrationRole
): Promise<FirestoreUserProfile[]> {
  const usersReference = collection(db, USERS_COLLECTION);
  const registrationsQuery = query(
    usersReference,
    where('requestedRole', '==', role)
  );
  const snapshot = await getDocs(registrationsQuery);
  return snapshot.docs
    .map((document) => ({
      ...(document.data() as FirestoreUserProfile),
      uid: (document.data() as FirestoreUserProfile).uid || document.id,
    }))
    .sort(
      (a, b) =>
        getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
    );
}

export async function updateUserProfile(
  uid: string,
  changes: Partial<Omit<FirestoreUserProfile, 'uid'>>
): Promise<void> {
  const reference = doc(db, USERS_COLLECTION, uid);
  await updateDoc(reference, {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}
