import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import {
  createPendingUserProfile,
  getUserProfile,
  updateUserProfile,
  type PendingUserProfileInput,
} from '../services/UserProfileService';
import type {
  AccountStatus,
  AppUser,
  PublicRegistrationRole,
  UserRole,
} from '../types/auth';

export interface PublicRegistrationFormInput {
  email: string;
  password: string;
  phone: string;
  firstName: string;
  lastName: string;
  postName?: string;
  gender?: string;
  requestedRole: PublicRegistrationRole;
  province?: string;
  profession?: string;
  agencyId?: string;
  photoURL?: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  isAdministrateurSysteme: boolean;
  isDirecteurGeneral: boolean;
  isAdministrateurAgence: boolean;
  isAgent: boolean;
  isClient: boolean;
  isAbonne: boolean;
  canAccessProtectedModules: boolean;
  hasPermission: (permission: string) => boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signInWithBiometrics: (targetUser: AppUser, options?: { biometricMethod?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (oobCode: string, newPassword: string) => Promise<void>;
  registerPublicUser: (input: PublicRegistrationFormInput) => Promise<void>;
  updateProfilePhoto: (photoDataUrl: string | null) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'ets_amani_session_user';

// Helper interne pour normaliser les rôles et permissions sans contourner les statuts de suspension
const normalizeUserPermissions = (rawUser: AppUser): AppUser => {
  const normalizedRole = rawUser.role
    ? (rawUser.role.trim().toLowerCase() as UserRole)
    : ('client' as UserRole);

  const rawStatus = rawUser.status ? rawUser.status.trim().toLowerCase() : 'pending';
  const isSuspendedOrDisabled =
    rawStatus === 'suspended' ||
    rawStatus === 'disabled' ||
    rawStatus === 'rejected';

  const effectiveStatus = isSuspendedOrDisabled
    ? (rawStatus as AccountStatus)
    : rawStatus === 'active' || rawStatus === 'approved'
    ? 'active'
    : 'pending';

  return {
    ...rawUser,
    role: normalizedRole,
    status: effectiveStatus,
    isApproved: !isSuspendedOrDisabled && rawUser.isApproved === true,
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialisation ultra-rapide via la session locale, puis mise à jour réseau
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      let hasLocalSession = false;

      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as AppUser;
          if (isMounted) {
            setUser(normalizeUserPermissions(parsed));
            hasLocalSession = true;
            // Déblocage immédiat de l'UI si on a un utilisateur en cache
            setIsLoading(false);
          }
        }
      } catch {
        // ignore
      }

      if (isFirebaseConfigured && auth) {
        onAuthStateChanged(auth, async (fbUser) => {
          if (!isMounted) return;
          setFirebaseUser(fbUser);
          if (fbUser) {
            try {
              const profile = await getUserProfile(fbUser.uid);
              if (profile && isMounted) {
                const normalized = normalizeUserPermissions(profile);
                setUser(normalized);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
              }
            } catch (err) {
              console.warn('[Ets AMANI] Erreur chargement profil Firestore :', err);
            }
          } else if (isMounted) {
            setUser(null);
            localStorage.removeItem(STORAGE_KEY);
          }

          if (isMounted && !hasLocalSession) {
            setIsLoading(false);
          }
        });
      } else if (isMounted && !hasLocalSession) {
        setIsLoading(false);
      }
    };

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback(
    async (emailInput: string, passwordInput?: string) => {
      const normalizedEmail = emailInput.trim().toLowerCase();

      if (!normalizedEmail || !passwordInput) {
        throw new Error('Veuillez renseigner votre email et votre mot de passe.');
      }

      if (isFirebaseConfigured && auth) {
        try {
          const userCredential = await signInWithEmailAndPassword(
            auth,
            normalizedEmail,
            passwordInput
          );
          setFirebaseUser(userCredential.user);
          const profile = await getUserProfile(userCredential.user.uid);
          if (profile) {
            const normalized = normalizeUserPermissions(profile);
            if (normalized.status === 'suspended' || normalized.status === 'disabled' || normalized.status === 'rejected') {
              await firebaseSignOut(auth);
              setUser(null);
              localStorage.removeItem(STORAGE_KEY);
              throw new Error('Votre compte est suspendu ou désactivé par la Direction. Veuillez contacter l administrateur.');
            }
            setUser(normalized);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            return;
          }
          throw new Error('Profil utilisateur introuvable dans la base Firestore.');
        } catch (err: unknown) {
          if (!navigator.onLine) {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
              const parsed = JSON.parse(cached) as AppUser;
              if (parsed.email?.toLowerCase() === normalizedEmail) {
                const normalized = normalizeUserPermissions(parsed);
                if (normalized.status === 'suspended' || normalized.status === 'disabled') {
                  throw new Error('Compte suspendu ou révoqué.');
                }
                setUser(normalized);
                return;
              }
            }
            throw new Error('Connexion réseau requise pour valider votre session.');
          }
          const errorMessage = err instanceof Error ? err.message : 'Identifiants incorrects.';
          throw new Error(errorMessage);
        }
      } else {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as AppUser;
          if (parsed.email?.toLowerCase() === normalizedEmail) {
            const normalized = normalizeUserPermissions(parsed);
            if (normalized.status === 'suspended' || normalized.status === 'disabled') {
              throw new Error('Compte suspendu ou révoqué.');
            }
            setUser(normalized);
            return;
          }
        }
        throw new Error('Service d authentification indisponible. Veuillez vérifier votre connexion.');
      }
    },
    []
  );

  const signInWithBiometrics = useCallback(
    async (targetUser: AppUser, options?: { biometricMethod?: string }) => {
      if (!targetUser || !targetUser.uid) {
        throw new Error('Profil utilisateur invalide pour la connexion biométrique.');
      }
      const normalized = normalizeUserPermissions(targetUser);
      if (
        normalized.status === 'suspended' ||
        normalized.status === 'disabled' ||
        normalized.status === 'rejected'
      ) {
        throw new Error(
          'Votre compte est suspendu ou désactivé par la Direction. Veuillez contacter l administrateur.'
        );
      }
      setUser(normalized);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore
      }
      setIsLoading(false);
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      if (isFirebaseConfigured && auth) {
        await firebaseSignOut(auth);
      }
    } catch {
      // ignore
    }
    setUser(null);
    setFirebaseUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const resetPassword = useCallback(async (emailInput: string) => {
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Veuillez saisir votre adresse email.');
    }

    if (isFirebaseConfigured && auth) {
      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'auth/user-not-found') {
          throw new Error('Aucun compte enregistré avec cette adresse email.');
        }
        if (code === 'auth/invalid-email') {
          throw new Error('Adresse email invalide. Veuillez vérifier votre saisie.');
        }
        if (code === 'auth/too-many-requests') {
          throw new Error('Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.');
        }
        if (!navigator.onLine) {
          throw new Error('Connexion Internet requise pour envoyer le lien de réinitialisation.');
        }
        throw new Error(
          err instanceof Error
            ? err.message
            : 'Impossible d envoyer l email de réinitialisation. Veuillez réessayer.'
        );
      }
    } else {
      throw new Error('Service de réinitialisation indisponible hors-ligne.');
    }
  }, []);

  const confirmResetPassword = useCallback(
    async (oobCode: string, newPassword: string) => {
      if (!oobCode.trim()) {
        throw new Error('Le code de réinitialisation est requis.');
      }
      if (!newPassword || newPassword.length < 6) {
        throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      }

      if (isFirebaseConfigured && auth) {
        try {
          await confirmPasswordReset(auth, oobCode.trim(), newPassword);
        } catch (err: any) {
          const code = err?.code || '';
          if (code === 'auth/expired-action-code') {
            throw new Error('Ce code ou lien de réinitialisation a expiré. Veuillez en demander un nouveau.');
          }
          if (code === 'auth/invalid-action-code') {
            throw new Error('Code de réinitialisation invalide ou déjà utilisé.');
          }
          if (code === 'auth/weak-password') {
            throw new Error('Le mot de passe choisi est trop faible (minimum 6 caractères).');
          }
          throw new Error(
            err instanceof Error
              ? err.message
              : 'Impossible de modifier le mot de passe. Veuillez réessayer.'
          );
        }
      } else {
        throw new Error('Service de réinitialisation indisponible hors-ligne.');
      }
    },
    []
  );

  const registerPublicUser = useCallback(
    async (input: PublicRegistrationFormInput) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      let uid = `candidate-${Date.now()}`;

      if (isFirebaseConfigured && auth) {
        try {
          const cred = await createUserWithEmailAndPassword(
            auth,
            normalizedEmail,
            input.password
          );
          uid = cred.user.uid;
        } catch (err: unknown) {
          console.warn('[Ets AMANI] Erreur création compte Auth :', err);
          const msg = err instanceof Error ? err.message : 'Impossible de créer le compte utilisateur.';
          throw new Error(msg);
        }
      }

      const pendingData: PendingUserProfileInput = {
        fullName: `${input.firstName} ${input.lastName}`.trim(),
        firstName: input.firstName,
        lastName: input.lastName,
        postName: input.postName || '',
        gender: input.gender || 'M',
        dateOfBirth: '2000-01-01',
        placeOfBirth: input.province || 'Nord-Kivu',
        avenue: '',
        neighborhood: '',
        commune: '',
        province: input.province || 'Nord-Kivu',
        nationality: 'Congolaise',
        profession: input.profession || 'Commerçant',
        identityDocument: 'Carte d électeur',
        phone: input.phone,
        email: normalizedEmail,
        requestedRole: input.requestedRole,
        agencyId: input.agencyId || (input.requestedRole === 'abonne' ? 'agence-goma-centre' : null),
        photoURL: input.photoURL || null,
      };

      try {
        await createPendingUserProfile(uid, pendingData);
      } catch (err: unknown) {
        console.warn('[Ets AMANI] Erreur écriture Firestore profil en attente :', err);
        const msg = err instanceof Error ? err.message : 'Erreur lors de l enregistrement de la demande.';
        throw new Error(msg);
      } finally {
        if (isFirebaseConfigured && auth) {
          try {
            await firebaseSignOut(auth);
          } catch {
            // ignore
          }
        }
      }

      setUser(null);
      setFirebaseUser(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    },
    []
  );

  const updateProfilePhoto = useCallback(
    async (photoDataUrl: string | null) => {
      if (!user) return;
      const updatedUser: AppUser = {
        ...user,
        photoURL: photoDataUrl || undefined,
        updatedAt: Date.now(),
      };
      setUser(updatedUser);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      } catch {
        // ignore
      }

      try {
        const rawManaged = localStorage.getItem('ets_amani_local_managed_users');
        if (rawManaged) {
          const list = JSON.parse(rawManaged);
          if (Array.isArray(list)) {
            const idx = list.findIndex((item: any) => item?.uid === user.uid);
            if (idx >= 0) {
              list[idx] = { ...list[idx], photoURL: photoDataUrl || null };
              localStorage.setItem('ets_amani_local_managed_users', JSON.stringify(list));
            }
          }
        }
      } catch {
        // ignore
      }

      if (isFirebaseConfigured && user.uid) {
        try {
          await updateUserProfile(user.uid, {
            photoURL: photoDataUrl || null,
          });
        } catch (err) {
          console.warn('[Ets AMANI] Mise à jour photo profil Firestore reportée (mode hors-ligne) :', err);
        }

        if (auth?.currentUser && (!photoDataUrl || photoDataUrl.length < 2000)) {
          try {
            await updateProfile(auth.currentUser, {
              photoURL: photoDataUrl || '',
            });
          } catch {
            // Data URLs > 2KB are stored in Firestore & local cache
          }
        }
      }
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    if (!user) return;
    if (isFirebaseConfigured && user.uid) {
      try {
        const fresh = await getUserProfile(user.uid);
        if (fresh) {
          const normalized = normalizeUserPermissions(fresh);
          setUser(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        }
      } catch {
        // ignore
      }
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(() => {
    const rawRole = user?.role || '';
    const normalizedRole = rawRole.trim().toLowerCase();
    const isSuspendedOrDisabled =
      user?.status === 'suspended' ||
      user?.status === 'disabled' ||
      user?.status === 'rejected';

    const isPrivileged =
      (normalizedRole === 'administrateur_systeme' ||
        normalizedRole === 'directeur_general') &&
      !isSuspendedOrDisabled &&
      user?.isApproved === true;

    const canAccessProtectedModules =
      !!user &&
      !isSuspendedOrDisabled &&
      user.isApproved === true &&
      (user.status === 'active' || user.status === 'approved');

    const hasPermission = (permission: string) => {
      if (!user || isSuspendedOrDisabled || !user.isApproved) return false;
      if (isPrivileged) return true;
      if (user.permissions?.includes('*') || user.permissions?.includes(permission)) return true;
      return false;
    };

    return {
      user,
      firebaseUser,
      isAuthenticated: !!user,
      isLoading,
      role: normalizedRole as UserRole,
      isAdministrateurSysteme: normalizedRole === 'administrateur_systeme',
      isDirecteurGeneral: normalizedRole === 'directeur_general',
      isAdministrateurAgence: normalizedRole === 'administrateur_agence',
      isAgent: normalizedRole === 'agent',
      isClient: normalizedRole === 'client',
      isAbonne: normalizedRole === 'abonne',
      canAccessProtectedModules,
      hasPermission,
      signIn,
      signInWithBiometrics,
      signOut,
      resetPassword,
      confirmResetPassword,
      registerPublicUser,
      updateProfilePhoto,
      refreshUser,
    };
  }, [
    user,
    firebaseUser,
    isLoading,
    signIn,
    signInWithBiometrics,
    signOut,
    resetPassword,
    confirmResetPassword,
    registerPublicUser,
    updateProfilePhoto,
    refreshUser,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l intérieur de AuthProvider');
  }
  return ctx;
}
