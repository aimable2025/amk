import type { UserFunction } from './auth';

export type AccountStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'disabled';

export type ManagedRole =
  | 'administrateur_systeme'
  | 'directeur_general'
  | 'administrateur_agence'
  | 'agent'
  | 'abonne'
  | 'client';

export interface ManagedUser {
  uid: string;
  displayName: string;
  email: string;
  role: ManagedRole;
  status: AccountStatus;
  isApproved: boolean;
  agencyId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DgFeatureControl {
  dashboard: boolean;
  agenciesManage: boolean;
  employeesManage: boolean;
  membersManage: boolean;
  clientsManage: boolean;
  transactionsManage: boolean;
  billetageAccess: boolean;
  internalNumbersManage: boolean;
  commissionsManage: boolean;
  reportsManage: boolean;
  communicationManage: boolean;
  supervisionAccess: boolean;
  auditRead: boolean;
  notificationsManage: boolean;
  operationalSettingsManage: boolean;
}

export type DgFeatures = DgFeatureControl;
export type DgFeatureKey = keyof DgFeatureControl;

export interface DgFeatureDefinition {
  label: string;
  module: string;
  description: string;
}

export const DG_FEATURE_DEFINITIONS: Record<DgFeatureKey, DgFeatureDefinition> = {
  dashboard: {
    label: 'Tableau de bord exécutif',
    module: 'Synthèse',
    description: 'Accès aux indicateurs financiers et statistiques clés du réseau.',
  },
  agenciesManage: {
    label: 'Réseau des Agences',
    module: 'Réseau',
    description: 'Gestion des succursales, guichets et directeurs locaux.',
  },
  employeesManage: {
    label: 'Personnel & Guichets',
    module: 'Réseau',
    description: 'Gestion des agents, polyvalence de guichet et affectations.',
  },
  membersManage: {
    label: 'Abonnés Privilégiés',
    module: 'Partenaires',
    description: 'Validation et suivi des partenaires abonnés.',
  },
  clientsManage: {
    label: 'Clients Particuliers',
    module: 'Clients',
    description: 'Gestion des dossiers clients et historique des opérations.',
  },
  transactionsManage: {
    label: 'Missions & Opérations',
    module: 'Opérations',
    description: 'Création, affectation et suivi des missions opérationnelles.',
  },
  billetageAccess: {
    label: 'Billetage & Liquidités',
    module: 'Trésorerie',
    description: 'Comptage contradictoire des devises USD et CDF en caisse.',
  },
  internalNumbersManage: {
    label: 'Numéros Flotte & SMS',
    module: 'Flotte',
    description: 'Supervision de la flotte SIM et flux SMS opérateurs.',
  },
  commissionsManage: {
    label: 'Grilles de Commissions',
    module: 'Finance',
    description: 'Calcul des commissions et barèmes de change.',
  },
  reportsManage: {
    label: 'Rapports & Clôtures',
    module: 'Finance',
    description: 'Génération des états financiers et exports comptables.',
  },
  communicationManage: {
    label: 'Chat Interne & Alertes',
    module: 'Communication',
    description: 'Messagerie opérationnelle entre agences et guichets.',
  },
  supervisionAccess: {
    label: 'Supervision Réseau',
    module: 'Contrôle',
    description: 'Surveillance des transactions suspectes et alertes de seuil.',
  },
  auditRead: {
    label: 'Journal d Audit',
    module: 'Contrôle',
    description: 'Consultation des logs d activité immuables.',
  },
  notificationsManage: {
    label: 'Centre de Notifications',
    module: 'Système',
    description: 'Diffusion d annonces prioritaires à l ensemble du réseau.',
  },
  operationalSettingsManage: {
    label: 'Paramètres Opérationnels',
    module: 'Paramètres',
    description: 'Configuration des plafonds d agence et seuils de trésorerie.',
  },
};

export { DEFAULT_DG_FEATURES } from '../utils/defaultDgFeatures';

export interface ServiceAssignmentHistory {
  id: string;
  userId: string;
  service: UserFunction;
  action:
    | 'created'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'removed';
  actorId: string;
  actorRole: string;
  timestamp: number;
  reason?: string;
}
