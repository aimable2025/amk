export type UserCategory =
  | 'direction'
  | 'administrateur_agence'
  | 'agent'
  | 'abonne'
  | 'client';

export type UserRole =
  | 'administrateur_systeme'
  | 'directeur_general'
  | 'administrateur_agence'
  | 'agent'
  | 'abonne'
  | 'client';

/**
 * Rôles pouvant être demandés lors d'une inscription publique.
 * IMPORTANT :
 * requestedRole représente uniquement la demande du candidat.
 * Il ne constitue pas une autorisation et ne donne aucun privilège automatiquement.
 * Dans Ets AMANI, les seuls types de comptes accessibles depuis l'inscription publique sont :
 * - client
 * - abonne
 */
export type PublicRegistrationRole =
  | 'client'
  | 'abonne';

export type UserFunction =
  | 'comptabilite'
  | 'comptable'
  | 'caisse'
  | 'guichetier'
  | 'agent_virtuel'
  | 'agent_vodae'
  | 'agent_change'
  | 'agent_operateur_mobile'
  | 'chauffeur'
  | 'cleaner'
  | 'agent_terrain';

/**
 * État général du compte utilisateur.
 * `pending` : compte créé mais inscription encore en attente.
 * `active` : compte validé et utilisable.
 * `rejected` : inscription rejetée.
 */
export type AccountStatus =
  | 'pending'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'disabled'
  | 'rejected';

/**
 * État spécifique du traitement d'une inscription publique.
 * Cet état est volontairement séparé de AccountStatus.
 */
export type RegistrationStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface UserPermissions {
  permissions: string[];
}

/**
 * Affectation d'un service à un agent.
 */
export interface ServiceAssignment {
  id: string;
  service: UserFunction;
  type:
    | 'principal'
    | 'permanent'
    | 'temporary';
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'expired';
  active: boolean;
  startAt?: number;
  endAt?: number;
  requestedBy?: string;
  assignedBy?: string;
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  reason?: string;
  createdAt: number;
  updatedAt: number;
  assignedAt?: number;
  agencyId?: string;
}

/**
 * Profil utilisateur effectif dans Ets AMANI.
 */
export interface AppUser extends UserPermissions {
  uid: string;
  displayName: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  photoURL?: string;
  /**
   * Type de compte demandé lors de l'inscription publique.
   */
  requestedRole?: PublicRegistrationRole;
  /**
   * État du traitement de la demande d'inscription.
   */
  registrationStatus?: RegistrationStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionReason?: string;
  multiServiceEnabled?: boolean;
  category: UserCategory;
  role: UserRole;
  function?: UserFunction;
  functions?: UserFunction[];
  serviceAssignments?: ServiceAssignment[];
  agencyId?: string | null;
  authorizedAgencyIds?: string[];
  mobilityScope?:
    | 'single_agency'
    | 'multi_agency';
  status: AccountStatus;
  isApproved: boolean;
  createdAt: number;
  updatedAt: number;
}
