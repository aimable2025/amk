import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  CalendarCheck2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  RotateCcw,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  WalletCards,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DgFeatures } from '../../../types/management';

export type DgModuleCategory =
  | 'operations'
  | 'finance'
  | 'network'
  | 'oversight'
  | 'settings';

export interface DgModuleItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  category: DgModuleCategory;
  badge?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  isAvailable?: (features?: DgFeatures) => boolean;
}

export const DG_MODULES: DgModuleItem[] = [
  {
    id: 'operations-management',
    title: 'Opérations Réseau',
    description: 'Création, affectation et suivi des missions opérationnelles d agence.',
    icon: Activity,
    category: 'operations',
    variant: 'primary',
  },
  {
    id: 'billetage',
    title: 'Billetage & Liquidités',
    description: 'Comptage contradictoire, réconciliation des devises USD / CDF et contrôle caisse.',
    icon: WalletCards,
    category: 'operations',
    variant: 'success',
    isAvailable: (f) => f?.billetageAccess ?? true,
  },
  {
    id: 'salaries-management',
    title: 'Salaires, Avances & Paie',
    description: 'Fixation des salaires par période, autorisation, désignation du payeur, réclamations et avances.',
    icon: Wallet,
    category: 'finance',
    variant: 'success',
    badge: 'Paie DG',
  },
  {
    id: 'reports-center',
    title: 'Rapports & Exports Certifiés',
    description: 'Synthèses financières, opérationnelles et analytiques avec exports PDF et Excel.',
    icon: FileText,
    category: 'finance',
    variant: 'success',
    badge: 'PDF / Excel',
    isAvailable: (f) => f?.reportsManage ?? true,
  },
  {
    id: 'inter-agency-transfers',
    title: 'Transferts Inter-Agences',
    description: 'Mouvements de fonds inter-succursales (argent physique, virtuel et ravitaillements).',
    icon: ArrowLeftRight,
    category: 'finance',
    variant: 'primary',
    isAvailable: (f) => f?.transactionsManage ?? true,
  },
  {
    id: 'debts-management',
    title: 'Suivi des Dettes & Créances',
    description: 'Gestion des dettes clients, agents et entreprise, échéances et remboursements.',
    icon: Scale,
    category: 'finance',
    variant: 'warning',
    isAvailable: (f) => f?.transactionsManage ?? true,
  },
  {
    id: 'internal-chat',
    title: 'Chat Interne, Annonces & IA',
    description: 'Messagerie multi-canaux (privé, agence, service, global), diffusions et assistant métier.',
    icon: MessageSquare,
    category: 'network',
    variant: 'primary',
    isAvailable: (f) => f?.communicationManage ?? true,
  },
  {
    id: 'internal-numbers',
    title: 'Numéros Flotte & Supervision',
    description: 'Gestion de la flotte téléphonique interne et suivi des flux SMS opérateurs.',
    icon: Smartphone,
    category: 'operations',
    variant: 'warning',
    isAvailable: (f) => f?.internalNumbersManage ?? true,
  },
  {
    id: 'connectivity-sync',
    title: 'Moteur Offline-First',
    description: 'État du réseau, latence, volume Dexie IndexedDB et synchronisation cloud.',
    icon: Wifi,
    category: 'network',
    variant: 'primary',
  },
  {
    id: 'agencies',
    title: 'Gestion des Agences',
    description: 'Supervision des agences, état opérationnel, responsables, agents rattachés, opérations et rapports.',
    icon: Building2,
    category: 'network',
    isAvailable: (f) => f?.agenciesManage ?? true,
  },
  {
    id: 'agency-admins-management',
    title: "Administrateurs d'Agence",
    description: "Supervision, création, affectations d'agences et modifications de statut des Administrateurs d'Agence.",
    icon: UserPlus,
    category: 'network',
    variant: 'primary',
  },
  {
    id: 'agents-management',
    title: 'Gestion des Agents',
    description: 'Vision globale des agents, fonctions/services, polyvalence au guichet, missions et rapports.',
    icon: Users,
    category: 'network',
  },
  {
    id: 'registration-requests',
    title: 'Validations Inscriptions',
    description: 'Approbation ou rejet des demandes de comptes clients et abonnés.',
    icon: UserCheck,
    category: 'oversight',
    variant: 'primary',
    isAvailable: (f) => (f ? f.membersManage || f.clientsManage : true),
  },
  {
    id: 'audit-logs',
    title: 'Journal d Audit',
    description: 'Traçabilité immuable de l ensemble des actions système et modifications de statut.',
    icon: ShieldCheck,
    category: 'oversight',
    variant: 'danger',
    isAvailable: (f) => f?.auditRead ?? true,
  },
  {
    id: 'dg-config',
    title: 'Configuration DG',
    description: 'Paramètres des modules opérationnels, délais de rétention et identité.',
    icon: Settings,
    category: 'settings',
  },
];
