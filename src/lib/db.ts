import Dexie, { type Table } from 'dexie';
import type { Operation, OperationAssignment } from '../types/operation';
import type { AgentCategorySpecificData } from '../types/report';

export interface BilletageDenomination {
  id?: number;
  billetageId: string;
  currency: string;
  denomination: number;
  quantity: number;
  subtotal: number;
  createdAt: number;
  updatedAt: number;
}

export interface Billetage {
  id: string;
  type: 'personal' | 'business';
  userId: string;
  agencyId?: string | null;
  currency: string;
  calculatedTotal: number;
  declaredAmount?: number | null;
  discrepancy?: number | null;
  status: 'draft' | 'completed' | 'validated' | 'cancelled';
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  transactionId?: string | null;
  reference?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueItem {
  id?: number;
  entity:
    | 'billetage'
    | 'operation'
    | 'operationAssignment'
    | 'report'
    | 'chatMessage'
    | 'broadcast'
    | 'debt'
    | 'interAgencyTransfer'
    | 'salary'
    | 'salaryClaim'
    | 'salaryAdvance';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  attempts: number;
  lastError?: string | null;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface OperationSyncQueueItem {
  id?: number;
  entity:
    | 'operation'
    | 'operationAssignment';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  attempts: number;
  lastError?: string | null;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';
  createdAt: number;
  updatedAt: number;
}

/**
 * Numéro interne Ets AMANI mis en cache localement.
 */
export interface LocalInternalNumber {
  id: string;
  phoneNumber: string;
  operator:
    | 'vodacom'
    | 'airtel'
    | 'orange'
    | 'africell';
  agencyId: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  label?: string;
  description?: string;
  status:
    | 'active'
    | 'inactive'
    | 'suspended'
    | 'archived';
  monitoringEnabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Opération SMS locale.
 */
export interface LocalSmsOperation {
  id: string;
  internalNumberId: string;
  receiverPhoneNumber?: string;
  agencyId: string | null;
  operator:
    | 'vodacom'
    | 'airtel'
    | 'orange'
    | 'africell';
  sender?: string;
  rawMessage: string;
  transactionReference?: string;
  amount?: number;
  currency?: string;
  transactionType?: string;
  operationDate?: number;
  receivedAt: number;
  processedAt?: number;
  collectorDeviceId?: string | null;
  collectorDeviceName?: string | null;
  status:
    | 'received'
    | 'analyzed'
    | 'identified'
    | 'matched'
    | 'validated'
    | 'pending'
    | 'processed'
    | 'flagged';
  reconciliationStatus?: 'unmatched' | 'matched' | 'discrepancy' | 'validated';
  reconciledOperationId?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: number | null;
  discrepancyReason?: string | null;
  validationNotes?: string | null;
  syncStatus:
    | 'pending'
    | 'synced'
    | 'failed';
  lastSyncError?: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Vraie file Offline-First dédiée aux opérations SMS.
 */
export interface SmsSyncQueueItem {
  id?: number;
  smsOperationId: string;
  operation: 'create' | 'update';
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';
  attempts: number;
  lastError?: string | null;
  nextAttemptAt: number;
  lastAttemptAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Rapport financier, opérationnel ou analytique stocké en mode Offline-First.
 */
export interface LocalReport {
  id: string;
  reference: string;
  title: string;
  type:
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
  period: 'aujourd_hui' | '7_jours' | '30_jours' | 'personnalise';
  startDate: number;
  endDate: number;
  agencyId: string | null;
  agencyName: string;
  status:
    | 'brouillon'
    | 'soumis'
    | 'recu'
    | 'en_examen'
    | 'traite'
    | 'valide'
    | 'retourne'
    | 'rejete'
    | 'archive';
  summary: string;
  metrics: {
    totalBilletageUSD: number;
    totalBilletageCDF: number;
    totalDiscrepancyUSD: number;
    totalDiscrepancyCDF: number;
    billetageCount: number;
    operationsTotal: number;
    operationsCompleted: number;
    operationsPending: number;
    operationsAmountUSD: number;
    operationsAmountCDF: number;
    smsOperationsCount: number;
    activeDebtsUSD: number;
    activeDebtsCDF: number;
    transfersInUSD: number;
    transfersOutUSD: number;
    transfersInCDF: number;
    transfersOutCDF: number;
    netTreasuryUSD: number;
    netTreasuryCDF: number;
  };
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;

  // Champs avancés formulaires adaptatifs & circuit hiérarchique
  mode?: 'guide' | 'personnalise';
  authorFunction?: string;
  authorService?: string;
  selectedServices?: string[];
  recipientRole?: string;
  recipientAgencyId?: string | null;
  priority?: 'normal' | 'urgent' | 'critique';
  executiveSummary?: string;
  categoryData?: AgentCategorySpecificData;

  // Sections de contenu structuré
  activities?: Array<{
    id: string;
    title: string;
    description: string;
    responsibleName: string;
    date: string;
    location: string;
    status: 'realisee' | 'partiellement_realisee' | 'non_realisee' | 'en_cours';
    result: string;
    observation?: string;
  }>;
  results?: Array<{
    id: string;
    objective: string;
    indicator: string;
    targetValue: number;
    achievedValue: number;
    rate: number;
    comment?: string;
  }>;
  quantitativeData?: Array<{
    id: string;
    indicator: string;
    planned: number;
    achieved: number;
    variance: number;
    unit?: string;
    observation?: string;
  }>;
  difficulties?: Array<{
    id: string;
    issue: string;
    date: string;
    severity: 'faible' | 'moyenne' | 'importante' | 'critique';
    impact: string;
    knownCause?: string;
    actionTaken: string;
    status: 'en_cours' | 'resolu' | 'bloquant';
  }>;
  incidents?: Array<{
    id: string;
    type: string;
    description: string;
    dateTime: string;
    location: string;
    serviceAffected: string;
    impact: string;
    measuresTaken: string;
    needsEscalation: boolean;
  }>;
  recommendations?: Array<{
    id: string;
    recommendation: string;
    justification: string;
    priority: 'basse' | 'moyenne' | 'haute';
    proposedAction: string;
    assignedTo: string;
    deadline: string;
  }>;
  decisionsNeeded?: Array<{
    id: string;
    request: string;
    justification: string;
    urgency: 'normale' | 'urgente' | 'bloquante';
    decisionMaker: string;
    desiredDeadline: string;
  }>;

  // Raccordement Billetage
  linkedBilletageId?: string | null;
  linkedBilletageRef?: string | null;
  linkedBilletageAmount?: number;
  linkedBilletageCurrency?: string;

  // Pièces jointes Offline-First
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    dataUrl?: string;
    uploadedAt: number;
  }>;

  // Circuit de retour et resoumission
  returnHistory?: Array<{
    returnedAt: number;
    returnedByUid: string;
    returnedByName: string;
    returnedByRole: string;
    reason: string;
    correctionPoints: string[];
    notes?: string;
  }>;
  submissionHistory?: Array<{
    submittedAt: number;
    submittedByUid: string;
    submittedByName: string;
    certificationStatement: string;
    version: number;
  }>;

  // Attestation d'exactitude
  certifiedByAuthor?: boolean;
  certifiedAt?: number;

  // Consolidation
  consolidatedSourceReportIds?: string[];
  consolidatedBy?: string;
  consolidatedAt?: number;

  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Commentaire attaché à un message du Chat Interne.
 */
export interface ChatMessageComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAt: number;
}

/**
 * Message du Chat Interne (privé, groupe, agence, service, global).
 */
export interface LocalChatMessage {
  id: string;
  channelType: 'prive' | 'groupe' | 'agence' | 'service' | 'global';
  channelId: string;
  channelName: string;
  agencyId: string | null;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId?: string | null;
  recipientName?: string | null;
  serviceTag?: string | null;
  groupName?: string | null;
  groupParticipantIds?: string[];
  groupParticipantNames?: string[];
  replyToMessageId?: string | null;
  replyToSenderName?: string | null;
  replyToExcerpt?: string | null;
  forwardedFromSenderName?: string | null;
  reactions?: Record<string, string[]>;
  comments?: ChatMessageComment[];
  content: string;
  attachmentType?: 'none' | 'image' | 'document';
  attachmentName?: string | null;
  attachmentDataUrl?: string | null;
  readBy: string[];
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Diffusion administrative et annonce officielle.
 */
export interface LocalBroadcast {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'important' | 'critique';
  scope: 'global' | 'agence';
  agencyId: string | null;
  agencyName?: string | null;
  requiresAck: boolean;
  requiresReadConfirmation: boolean;
  blockingUntilAck: boolean;
  acknowledgedBy: string[];
  readBy: string[];
  authorId: string;
  authorName: string;
  authorRole: string;
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Remboursement unitaire sur une dette.
 */
export interface DebtRepaymentRecord {
  id: string;
  amount: number;
  currency: 'USD' | 'CDF';
  recordedBy: string;
  recordedByName: string;
  note?: string;
  timestamp: number;
}

/**
 * Suivi des dettes (client, agent, entreprise).
 */
export interface LocalDebt {
  id: string;
  reference: string;
  category: 'client' | 'agent' | 'entreprise';
  debtorName: string;
  debtorId?: string | null;
  debtorPhone?: string | null;
  agencyId: string;
  agencyName: string;
  currency: 'USD' | 'CDF';
  initialAmount: number;
  remainingAmount: number;
  reason: string;
  dueDate: number;
  status: 'en_cours' | 'partiel' | 'rembourse' | 'en_retard';
  repayments: DebtRepaymentRecord[];
  createdBy: string;
  createdByName: string;
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Transfert inter-agence (argent physique, argent virtuel, ravitaillement).
 */
export interface LocalInterAgencyTransfer {
  id: string;
  reference: string;
  transferType: 'argent_physique' | 'argent_virtuel' | 'ravitaillement';
  sourceAgencyId: string;
  sourceAgencyName: string;
  targetAgencyId: string;
  targetAgencyName: string;
  amount: number;
  currency: 'USD' | 'CDF';
  operatorOrChannel?: string;
  reason: string;
  status: 'en_attente_validation' | 'valide' | 'recu' | 'rejete';
  initiatedBy: string;
  initiatedByName: string;
  initiatedByRole: string;
  validatedBy?: string | null;
  validatedByName?: string | null;
  validatedAt?: number | null;
  receivedBy?: string | null;
  receivedByName?: string | null;
  receivedAt?: number | null;
  rejectionReason?: string | null;
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Événement unitaire d'historique salarial (traçabilité immuable par période/demande).
 */
export interface SalaryEventEntry {
  id: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  details: string;
  timestamp: number;
}

export type SalaryStatus =
  | 'a_payer'
  | 'autorise'
  | 'en_attente_de_paiement'
  | 'paye'
  | 'confirme'
  | 'en_retard'
  | 'reclame'
  | 'couvert_par_avance';

/**
 * Enregistrement de salaire mensuel d'un agent pour une période donnée (AGENT + ANNÉE + MOIS).
 */
export interface LocalSalaryRecord {
  id: string;
  periodKey: string; // Format unique: `${agentId}_${year}_${month}`
  reference: string;
  paymentCategory: 'salaire_normal' | 'couvert_par_avance';
  agentId: string;
  agentName: string;
  agentFunction?: string;
  agencyId: string | null;
  agencyName: string;
  year: number;
  month: number; // 1 à 12
  plannedAmount: number;
  paidAmount: number;
  currency: 'USD' | 'CDF';
  status: SalaryStatus;
  authorizedByUid?: string | null;
  authorizedByName?: string | null;
  authorizedAt?: number | null;
  designatedPayerType?: 'user' | 'service' | null;
  designatedPayerId?: string | null;
  designatedPayerName?: string | null;
  designatedPayerService?: string | null;
  paidByUid?: string | null;
  paidByName?: string | null;
  paidByService?: string | null;
  paidAt?: number | null;
  linkedOperationId?: string | null;
  linkedOperationNumber?: string | null;
  confirmedByAgent: boolean;
  confirmedAt?: number | null;
  confirmationNote?: string | null;
  coveredByAdvanceId?: string | null;
  coveredByAdvanceRef?: string | null;
  dueDate: number;
  history: SalaryEventEntry[];
  createdBy: string;
  createdByName: string;
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type SalaryClaimStatus =
  | 'reclamation_envoyee'
  | 'en_examen'
  | 'traitee'
  | 'payee'
  | 'rejetee'
  | 'sans_suite';

/**
 * Réclamation d'un agent concernant un salaire en retard.
 */
export interface LocalSalaryClaim {
  id: string;
  reference: string;
  salaryId: string;
  periodKey: string;
  year: number;
  month: number;
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  amount: number;
  currency: 'USD' | 'CDF';
  reason: string;
  status: SalaryClaimStatus;
  dgResponse?: string | null;
  handledByUid?: string | null;
  handledByName?: string | null;
  handledAt?: number | null;
  history: SalaryEventEntry[];
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface CoveredSalaryPeriod {
  year: number;
  month: number;
  periodKey: string;
  allocatedAmount: number;
}

export type SalaryAdvanceStatus =
  | 'soumise'
  | 'en_examen'
  | 'approuvee'
  | 'refusee'
  | 'autorisee_au_paiement'
  | 'payee'
  | 'confirmee';

/**
 * Demande d'avance sur salaire soumise par l'agent et décidée par le DG.
 */
export interface LocalSalaryAdvance {
  id: string;
  reference: string;
  agentId: string;
  agentName: string;
  agentFunction?: string;
  agencyId: string | null;
  agencyName: string;
  requestedAmount: number;
  approvedAmount?: number | null;
  currency: 'USD' | 'CDF';
  requestedMonthsCount: number;
  approvedMonthsCount?: number | null;
  requestedStartYear: number;
  requestedStartMonth: number;
  coveredPeriods: CoveredSalaryPeriod[];
  reason: string;
  writtenStatement: string;
  documentName: string;
  documentDataUrl: string;
  status: SalaryAdvanceStatus;
  dgDecision: 'en_attente' | 'acceptee' | 'refusee';
  dgDecisionByUid?: string | null;
  dgDecisionByName?: string | null;
  dgDecisionAt?: number | null;
  dgConditionsOrReason?: string | null;
  designatedPayerType?: 'user' | 'service' | null;
  designatedPayerId?: string | null;
  designatedPayerName?: string | null;
  designatedPayerService?: string | null;
  paidByUid?: string | null;
  paidByName?: string | null;
  paidAt?: number | null;
  linkedOperationId?: string | null;
  linkedOperationNumber?: string | null;
  confirmedByAgent: boolean;
  confirmedAt?: number | null;
  history: SalaryEventEntry[];
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

/**
 * Base locale Ets AMANI.
 */
export class EtsAmaniDatabase extends Dexie {
  billetages!: Table<Billetage, string>;
  billetageDenominations!: Table<BilletageDenomination, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  operations!: Table<Operation, string>;
  operationAssignments!: Table<OperationAssignment, string>;
  internalNumbers!: Table<LocalInternalNumber, string>;
  smsOperations!: Table<LocalSmsOperation, string>;
  smsSyncQueue!: Table<SmsSyncQueueItem, number>;
  reports!: Table<LocalReport, string>;
  chatMessages!: Table<LocalChatMessage, string>;
  broadcasts!: Table<LocalBroadcast, string>;
  debts!: Table<LocalDebt, string>;
  interAgencyTransfers!: Table<LocalInterAgencyTransfer, string>;
  salaries!: Table<LocalSalaryRecord, string>;
  salaryClaims!: Table<LocalSalaryClaim, string>;
  salaryAdvances!: Table<LocalSalaryAdvance, string>;

  constructor() {
    super('EtsAmaniDB');

    this.version(1).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
    });

    this.version(2).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
      operations:
        'id, operationNumber, agencyId, status, priority, type, createdBy, createdAt, updatedAt, syncStatus',
      operationAssignments:
        'id, operationId, agencyId, agentId, status, createdAt, updatedAt, syncStatus',
    });

    this.version(3).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
      operations:
        'id, operationNumber, agencyId, status, priority, type, createdBy, createdAt, updatedAt, syncStatus',
      operationAssignments:
        'id, operationId, agencyId, agentId, status, createdAt, updatedAt, syncStatus',
      internalNumbers:
        'id, phoneNumber, operator, agencyId, assignedUserId, status, monitoringEnabled, createdAt, updatedAt',
      smsOperations:
        'id, internalNumberId, agencyId, operator, sender, transactionReference, amount, transactionType, operationDate, receivedAt, status, syncStatus, createdAt, updatedAt',
    });

    this.version(4).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
      operations:
        'id, operationNumber, agencyId, status, priority, type, createdBy, createdAt, updatedAt, syncStatus',
      operationAssignments:
        'id, operationId, agencyId, agentId, status, createdAt, updatedAt, syncStatus',
      internalNumbers:
        'id, phoneNumber, operator, agencyId, assignedUserId, status, monitoringEnabled, createdAt, updatedAt',
      smsOperations:
        'id, internalNumberId, agencyId, operator, sender, transactionReference, amount, transactionType, operationDate, receivedAt, status, syncStatus, createdAt, updatedAt',
      smsSyncQueue:
        '++id, smsOperationId, operation, status, attempts, nextAttemptAt, lastAttemptAt, createdAt, updatedAt',
    });

    this.version(5).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
      operations:
        'id, operationNumber, agencyId, status, priority, type, createdBy, createdAt, updatedAt, syncStatus',
      operationAssignments:
        'id, operationId, agencyId, agentId, status, createdAt, updatedAt, syncStatus',
      internalNumbers:
        'id, phoneNumber, operator, agencyId, assignedUserId, status, monitoringEnabled, createdAt, updatedAt',
      smsOperations:
        'id, internalNumberId, agencyId, operator, sender, transactionReference, amount, transactionType, operationDate, receivedAt, status, syncStatus, createdAt, updatedAt',
      smsSyncQueue:
        '++id, smsOperationId, operation, status, attempts, nextAttemptAt, lastAttemptAt, createdAt, updatedAt',
      reports:
        'id, reference, type, period, agencyId, status, createdBy, syncStatus, createdAt, updatedAt',
      chatMessages:
        'id, channelType, channelId, agencyId, senderId, recipientId, syncStatus, createdAt, updatedAt',
      broadcasts:
        'id, severity, scope, agencyId, authorId, syncStatus, createdAt, updatedAt',
      debts:
        'id, reference, category, agencyId, currency, status, dueDate, syncStatus, createdAt, updatedAt',
      interAgencyTransfers:
        'id, reference, transferType, sourceAgencyId, targetAgencyId, currency, status, syncStatus, createdAt, updatedAt',
    });

    this.version(6).stores({
      billetages:
        'id, userId, agencyId, type, currency, status, syncStatus, transactionId, createdAt, updatedAt',
      billetageDenominations:
        '++id, billetageId, currency, denomination, createdAt, updatedAt',
      syncQueue:
        '++id, entity, entityId, operation, status, createdAt, updatedAt',
      operations:
        'id, operationNumber, agencyId, status, priority, type, createdBy, createdAt, updatedAt, syncStatus',
      operationAssignments:
        'id, operationId, agencyId, agentId, status, createdAt, updatedAt, syncStatus',
      internalNumbers:
        'id, phoneNumber, operator, agencyId, assignedUserId, status, monitoringEnabled, createdAt, updatedAt',
      smsOperations:
        'id, internalNumberId, agencyId, operator, sender, transactionReference, amount, transactionType, operationDate, receivedAt, status, syncStatus, createdAt, updatedAt',
      smsSyncQueue:
        '++id, smsOperationId, operation, status, attempts, nextAttemptAt, lastAttemptAt, createdAt, updatedAt',
      reports:
        'id, reference, type, period, agencyId, status, createdBy, syncStatus, createdAt, updatedAt',
      chatMessages:
        'id, channelType, channelId, agencyId, senderId, recipientId, syncStatus, createdAt, updatedAt',
      broadcasts:
        'id, severity, scope, agencyId, authorId, syncStatus, createdAt, updatedAt',
      debts:
        'id, reference, category, agencyId, currency, status, dueDate, syncStatus, createdAt, updatedAt',
      interAgencyTransfers:
        'id, reference, transferType, sourceAgencyId, targetAgencyId, currency, status, syncStatus, createdAt, updatedAt',
      salaries:
        'id, &periodKey, reference, agentId, agencyId, year, month, status, designatedPayerId, designatedPayerService, syncStatus, createdAt, updatedAt',
      salaryClaims:
        'id, reference, salaryId, periodKey, agentId, agencyId, status, syncStatus, createdAt, updatedAt',
      salaryAdvances:
        'id, reference, agentId, agencyId, status, dgDecision, designatedPayerId, designatedPayerService, syncStatus, createdAt, updatedAt',
    });
  }
}

/**
 * Instance unique de la base locale.
 */
export const db = new EtsAmaniDatabase();
