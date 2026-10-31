import type { UserFunction, UserRole } from './auth';

export type ReportType =
  | 'financier'
  | 'operationnel'
  | 'analytique'
  | 'cloture_caisse'
  | 'global'
  | 'quotidien'
  | 'hebdomadaire'
  | 'mensuel'
  | 'trimestriel'
  | 'semestriel'
  | 'annuel'
  | 'ponctuel'
  | 'activite'
  | 'administratif'
  | 'supervision'
  | 'incident'
  | 'autre';

export type ReportStatus =
  | 'brouillon'
  | 'soumis'
  | 'recu'
  | 'en_examen'
  | 'traite'
  | 'valide'
  | 'retourne'
  | 'rejete'
  | 'archive';

export type ReportSyncStatus = 'local' | 'pending' | 'synced' | 'error';

export type ReportPriority = 'normal' | 'urgent' | 'critique';

export type ReportFormMode = 'guide' | 'personnalise';

export type ActivityStatus = 'realisee' | 'partiellement_realisee' | 'non_realisee' | 'en_cours';

export type DifficultySeverity = 'faible' | 'moyenne' | 'importante' | 'critique';

export interface ReportActivityItem {
  id: string;
  title: string;
  description: string;
  responsibleName: string;
  date: string;
  location: string;
  status: ActivityStatus;
  result: string;
  observation?: string;
}

export interface ReportResultItem {
  id: string;
  objective: string;
  indicator: string;
  targetValue: number;
  achievedValue: number;
  rate: number; // percentage (achieved / target * 100)
  comment?: string;
}

export interface ReportQuantitativeItem {
  id: string;
  indicator: string;
  planned: number;
  achieved: number;
  variance: number; // achieved - planned
  unit?: string;
  observation?: string;
}

export interface ReportDifficultyItem {
  id: string;
  issue: string;
  date: string;
  severity: DifficultySeverity;
  impact: string;
  knownCause?: string;
  actionTaken: string;
  status: 'en_cours' | 'resolu' | 'bloquant';
}

export interface ReportIncidentItem {
  id: string;
  type: string;
  description: string;
  dateTime: string;
  location: string;
  serviceAffected: string;
  impact: string;
  measuresTaken: string;
  needsEscalation: boolean;
}

export interface ReportRecommendationItem {
  id: string;
  recommendation: string;
  justification: string;
  priority: 'basse' | 'moyenne' | 'haute';
  proposedAction: string;
  assignedTo: string;
  deadline: string;
}

export interface ReportDecisionItem {
  id: string;
  request: string;
  justification: string;
  urgency: 'normale' | 'urgente' | 'bloquante';
  decisionMaker: string;
  desiredDeadline: string;
}

export interface ReportAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  uploadedAt: number;
}

export interface ReportReturnRecord {
  returnedAt: number;
  returnedByUid: string;
  returnedByName: string;
  returnedByRole: string;
  reason: string;
  correctionPoints: string[];
  notes?: string;
}

export interface ReportSubmissionRecord {
  submittedAt: number;
  submittedByUid: string;
  submittedByName: string;
  certificationStatement: string;
  version: number;
}

export type AgentReportCategory =
  | 'comptable'
  | 'caisse'
  | 'guichetier'
  | 'agent_virtuel'
  | 'agent_change'
  | 'agent_terrain'
  | 'polyvalent'
  | 'autre';

export interface AgentCategorySpecificData {
  // Agent Comptable
  accountingPeriodName?: string;
  filesProcessedCount?: number;
  operationsBookedCount?: number;
  reconciliationsDoneCount?: number;
  discrepanciesCount?: number;
  missingReceiptsCount?: number;
  accountingCorrectiveActions?: string;
  accountingObservations?: string;

  // Caissier
  cashRegisterIdentifier?: string;
  cashOperationsCount?: number;
  authorizedReceiptsUSD?: number;
  authorizedReceiptsCDF?: number;
  authorizedDisbursementsUSD?: number;
  authorizedDisbursementsCDF?: number;
  cashDiscrepancyReason?: string;
  cashIncidentsNotes?: string;

  // Guichetier
  tellerOperationsCount?: number;
  clientsServedCount?: number;
  pendingTransactionsCount?: number;
  cancelledOrRejectedCount?: number;
  tellerAnomaliesNotes?: string;
  technicalDifficultiesNotes?: string;

  // Agent Virtuel
  virtualOperationsCount?: number;
  requestsReceivedCount?: number;
  requestsResolvedCount?: number;
  pendingVirtualFilesCount?: number;
  technicalIncidentsCount?: number;
  connectionIssuesCount?: number;
  virtualActionsTaken?: string;

  // Agent de Change
  exchangeCurrencies?: string[];
  exchangeOperationsCount?: number;
  exchangeVolumeUSD?: number;
  exchangeVolumeCDF?: number;
  exchangeAnomaliesNotes?: string;
  pendingExchangeOpsCount?: number;

  // Agent de Terrain
  assignedMissionTitle?: string;
  missionObjective?: string;
  interventionLocation?: string;
  fieldActivitiesCompleted?: string;
  fieldResultsObtained?: string;
  fieldRecommendations?: string;
  fieldProofDocumentName?: string;

  // Polyvalent
  activeSelectedCategories?: string[];
}

export interface AgentSpecificMetrics {
  operationsCount: number;
  operationsCompleted: number;
  operationsPending: number;
  amountUSD: number;
  amountCDF: number;
  billetagesCount: number;
  billetageTotalUSD: number;
  billetageTotalCDF: number;
  discrepancyUSD: number;
  discrepancyCDF: number;
  reconciledCount: number;
}

/**
 * Permissions RBAC pour les rapports.
 */
export type ReportPermission =
  | 'reports.read_own'
  | 'reports.create'
  | 'reports.edit_own'
  | 'reports.submit'
  | 'reports.read_assigned'
  | 'reports.read_agency'
  | 'reports.read_global'
  | 'reports.review'
  | 'reports.return'
  | 'reports.approve'
  | 'reports.archive'
  | 'reports.delete_draft'
  | 'reports.export_own'
  | 'reports.export_agency'
  | 'reports.export_global'
  | 'reports.view_audit'
  | 'reports.consolidate_agency';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  financier: 'Synthèse Financière & Trésorerie',
  operationnel: 'Synthèse Opérationnelle & Missions',
  analytique: 'Rapport Analytique & Performance',
  cloture_caisse: 'Procès-Verbal de Clôture de Caisse',
  global: 'Rapport Exécutif Consolidé Réseau',
  quotidien: 'Rapport Quotidien d\'Activité',
  hebdomadaire: 'Rapport Hebdomadaire',
  mensuel: 'Rapport Mensuel d\'Activité',
  trimestriel: 'Rapport Trimestriel',
  semestriel: 'Rapport Semestriel',
  annuel: 'Rapport Annuel',
  ponctuel: 'Rapport Ponctuel de Mission',
  activite: 'Rapport d\'Activité Professionnelle',
  administratif: 'Rapport Administratif',
  supervision: 'Rapport de Supervision Réseau',
  incident: 'Rapport d\'Incident / Anomalie',
  autre: 'Autre Rapport (Préciser)',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  brouillon: 'Brouillon',
  soumis: 'Soumis (En attente d\'examen)',
  recu: 'Reçu par l\'Agence',
  en_examen: 'En cours d\'examen',
  traite: 'Traité & Validé',
  valide: 'Validé & Certifié',
  retourne: 'Retourné pour correction',
  rejete: 'Rejeté',
  archive: 'Archivé',
};

export const FUNCTION_DISPLAY_LABELS: Record<UserFunction, string> = {
  comptabilite: 'Agent Comptable',
  comptable: 'Agent Comptable',
  caisse: 'Caissier',
  guichetier: 'Guichetier',
  agent_virtuel: 'Agent Virtuel',
  agent_vodae: 'Agent Vodae / Mobile',
  agent_change: 'Agent de Change',
  agent_operateur_mobile: 'Opérateur Mobile Money',
  chauffeur: 'Chauffeur / Logistique',
  cleaner: 'Agent d\'Entretien',
  agent_terrain: 'Agent de Terrain / Supervision',
};
