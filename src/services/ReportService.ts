import { db, type LocalReport, type LocalBroadcast } from '../lib/db';
import { recordAuditLog } from './AuditService';
import type { AppUser, UserRole } from '../types/auth';
import type {
  ReportPermission,
  ReportStatus,
  ReportType,
  ReportPriority,
  ReportFormMode,
  AgentSpecificMetrics,
  ReportActivityItem,
  ReportResultItem,
  ReportQuantitativeItem,
  ReportDifficultyItem,
  ReportIncidentItem,
  ReportRecommendationItem,
  ReportDecisionItem,
  ReportAttachment,
  ReportReturnRecord,
  ReportSubmissionRecord,
  AgentCategorySpecificData,
} from '../types/report';

export interface GenerateReportInput {
  title: string;
  type: ReportType;
  period: LocalReport['period'];
  startDate?: number;
  endDate?: number;
  agencyId: string | null;
  agencyName: string;
  notes?: string;
  mode?: ReportFormMode;
  priority?: ReportPriority;
  authorFunction?: string;
  authorService?: string;
  recipientRole?: string;
  executiveSummary?: string;
  activities?: ReportActivityItem[];
  results?: ReportResultItem[];
  quantitativeData?: ReportQuantitativeItem[];
  difficulties?: ReportDifficultyItem[];
  incidents?: ReportIncidentItem[];
  recommendations?: ReportRecommendationItem[];
  decisionsNeeded?: ReportDecisionItem[];
  linkedBilletageId?: string | null;
  linkedBilletageRef?: string | null;
  linkedBilletageAmount?: number;
  linkedBilletageCurrency?: string;
  attachments?: ReportAttachment[];
  categoryData?: AgentCategorySpecificData;
}

/**
 * Contrôle centralisé des permissions RBAC pour le module Rapport.
 */
export function canPerformReportAction(
  action: ReportPermission,
  user: AppUser | null,
  report?: LocalReport
): boolean {
  if (!user || !user.isApproved || user.status === 'suspended' || user.status === 'disabled') {
    return false;
  }

  // Interdiction absolue aux profils clients et abonnés d'accéder au module Rapport interne
  if (user.role === 'client' || user.role === 'abonne') {
    return false;
  }

  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  const isAgencyAdmin = user.role === 'administrateur_agence';
  const isAgent = user.role === 'agent';

  switch (action) {
    case 'reports.read_global':
      return isGlobalRole;

    case 'reports.read_agency':
      return isGlobalRole || isAgencyAdmin;

    case 'reports.read_own':
      return true;

    case 'reports.create':
      return isGlobalRole || isAgencyAdmin || isAgent;

    case 'reports.edit_own':
      if (!report) return true;
      if (isGlobalRole) return true;
      if (report.createdBy === user.uid) {
        return report.status === 'brouillon' || report.status === 'retourne';
      }
      return false;

    case 'reports.submit':
      if (!report) return true;
      if (report.createdBy === user.uid || isGlobalRole) {
        return report.status === 'brouillon' || report.status === 'retourne';
      }
      return false;

    case 'reports.review':
    case 'reports.return':
    case 'reports.approve':
      if (isGlobalRole) return true;
      if (isAgencyAdmin) {
        return !report || report.agencyId === user.agencyId;
      }
      return false;

    case 'reports.archive':
      if (isGlobalRole) return true;
      if (isAgencyAdmin) {
        return !report || report.agencyId === user.agencyId;
      }
      return false;

    case 'reports.delete_draft':
      if (!report) return false;
      if (isGlobalRole) return true;
      return report.createdBy === user.uid && report.status === 'brouillon';

    case 'reports.consolidate_agency':
      return isGlobalRole || isAgencyAdmin;

    case 'reports.export_global':
      return isGlobalRole;

    case 'reports.export_agency':
      return isGlobalRole || isAgencyAdmin;

    case 'reports.export_own':
      return true;

    case 'reports.view_audit':
      return isGlobalRole || isAgencyAdmin;

    default:
      return isGlobalRole;
  }
}

export function generateReportReference(type: ReportType): string {
  const prefixMap: Record<ReportType, string> = {
    financier: 'RPT-FIN',
    operationnel: 'RPT-OPS',
    analytique: 'RPT-ANA',
    cloture_caisse: 'RPT-CAI',
    global: 'RPT-GLB',
    quotidien: 'RPT-QTD',
    hebdomadaire: 'RPT-HEB',
    mensuel: 'RPT-MEN',
    trimestriel: 'RPT-TRI',
    semestriel: 'RPT-SEM',
    annuel: 'RPT-ANN',
    ponctuel: 'RPT-PON',
    activite: 'RPT-ACT',
    administratif: 'RPT-ADM',
    supervision: 'RPT-SUP',
    incident: 'RPT-INC',
    autre: 'RPT-AUT',
  };
  const prefix = prefixMap[type] || 'RPT-GEN';
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

export function resolvePeriodBounds(
  period: LocalReport['period'],
  customStart?: number,
  customEnd?: number
): { startDate: number; endDate: number } {
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  if (period === 'aujourd_hui') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { startDate: start.getTime(), endDate: endOfToday.getTime() };
  }
  if (period === '7_jours') {
    return {
      startDate: now - 7 * 24 * 60 * 60 * 1000,
      endDate: endOfToday.getTime(),
    };
  }
  if (period === '30_jours') {
    return {
      startDate: now - 30 * 24 * 60 * 60 * 1000,
      endDate: endOfToday.getTime(),
    };
  }
  return {
    startDate: customStart || now - 7 * 24 * 60 * 60 * 1000,
    endDate: customEnd || endOfToday.getTime(),
  };
}

/**
 * Calcule les métriques opérationnelles personnelles d'un Agent sur une période.
 * Distingue clairement les chiffres réels des déclarations de l'agent.
 */
export async function getAgentPersonalMetrics(
  user: AppUser,
  startDate: number,
  endDate: number
): Promise<AgentSpecificMetrics> {
  const [operations, billetages] = await Promise.all([
    db.operations.toArray(),
    db.billetages.toArray(),
  ]);

  const agentOps = operations.filter((op) => {
    const inPeriod = op.createdAt >= startDate && op.createdAt <= endDate;
    const isMine =
      op.createdBy === user.uid ||
      (op.assignedAgentIds && op.assignedAgentIds.includes(user.uid));
    return inPeriod && isMine;
  });

  let operationsCompleted = 0;
  let operationsPending = 0;
  let amountUSD = 0;
  let amountCDF = 0;

  for (const op of agentOps) {
    if (op.status === 'termine' || op.status === 'valide') {
      operationsCompleted += 1;
    } else if (op.status !== 'annule' && op.status !== 'rejete') {
      operationsPending += 1;
    }
    const amt = Number(op.amount || 0);
    if (op.currency === 'USD') amountUSD += amt;
    if (op.currency === 'CDF') amountCDF += amt;
  }

  const agentBilletages = billetages.filter((b) => {
    const inPeriod = b.createdAt >= startDate && b.createdAt <= endDate;
    const isMine = b.userId === user.uid;
    return inPeriod && isMine && b.status !== 'cancelled';
  });

  let billetageTotalUSD = 0;
  let billetageTotalCDF = 0;
  let discrepancyUSD = 0;
  let discrepancyCDF = 0;

  for (const b of agentBilletages) {
    const amt = Number(b.calculatedTotal || b.declaredAmount || 0);
    const disc = Number(b.discrepancy || 0);
    if (b.currency === 'USD') {
      billetageTotalUSD += amt;
      discrepancyUSD += disc;
    } else if (b.currency === 'CDF') {
      billetageTotalCDF += amt;
      discrepancyCDF += disc;
    }
  }

  return {
    operationsCount: agentOps.length,
    operationsCompleted,
    operationsPending,
    amountUSD,
    amountCDF,
    billetagesCount: agentBilletages.length,
    billetageTotalUSD,
    billetageTotalCDF,
    discrepancyUSD,
    discrepancyCDF,
    reconciledCount: operationsCompleted,
  };
}

/**
 * Calcule les métriques réelles à partir des tables Dexie locales en respectant
 * strictement le périmètre d'agence (RBAC) et la période demandée.
 */
export async function computeReportMetrics(
  effectiveAgencyId: string | null,
  startDate: number,
  endDate: number
): Promise<LocalReport['metrics']> {
  const [billetages, operations, smsOps, debts, transfers] = await Promise.all([
    db.billetages.toArray(),
    db.operations.toArray(),
    db.smsOperations.toArray(),
    db.debts.toArray(),
    db.interAgencyTransfers.toArray(),
  ]);

  const filteredBilletages = billetages.filter((b) => {
    const inPeriod = b.createdAt >= startDate && b.createdAt <= endDate;
    const inAgency = !effectiveAgencyId || b.agencyId === effectiveAgencyId;
    return inPeriod && inAgency && b.status !== 'cancelled';
  });

  let totalBilletageUSD = 0;
  let totalBilletageCDF = 0;
  let totalDiscrepancyUSD = 0;
  let totalDiscrepancyCDF = 0;

  for (const b of filteredBilletages) {
    const amount = Number(b.calculatedTotal || b.declaredAmount || 0);
    const disc = Number(b.discrepancy || 0);
    if (b.currency === 'USD') {
      totalBilletageUSD += amount;
      totalDiscrepancyUSD += disc;
    } else if (b.currency === 'CDF') {
      totalBilletageCDF += amount;
      totalDiscrepancyCDF += disc;
    }
  }

  const filteredOps = operations.filter((op) => {
    const inPeriod = op.createdAt >= startDate && op.createdAt <= endDate;
    const inAgency = !effectiveAgencyId || op.agencyId === effectiveAgencyId;
    return inPeriod && inAgency;
  });

  let operationsCompleted = 0;
  let operationsPending = 0;
  let operationsAmountUSD = 0;
  let operationsAmountCDF = 0;

  for (const op of filteredOps) {
    if (op.status === 'termine' || op.status === 'valide') {
      operationsCompleted += 1;
    } else if (op.status !== 'annule' && op.status !== 'rejete') {
      operationsPending += 1;
    }
    const amt = Number(op.amount || 0);
    if (op.currency === 'USD') {
      operationsAmountUSD += amt;
    } else if (op.currency === 'CDF') {
      operationsAmountCDF += amt;
    }
  }

  const filteredSms = smsOps.filter((s) => {
    const inPeriod = s.receivedAt >= startDate && s.receivedAt <= endDate;
    const inAgency = !effectiveAgencyId || s.agencyId === effectiveAgencyId;
    return inPeriod && inAgency;
  });

  const filteredDebts = debts.filter((d) => {
    const inAgency = !effectiveAgencyId || d.agencyId === effectiveAgencyId;
    return inAgency && d.status !== 'rembourse';
  });

  let activeDebtsUSD = 0;
  let activeDebtsCDF = 0;
  for (const d of filteredDebts) {
    if (d.currency === 'USD') activeDebtsUSD += Number(d.remainingAmount || 0);
    if (d.currency === 'CDF') activeDebtsCDF += Number(d.remainingAmount || 0);
  }

  const filteredTransfers = transfers.filter((t) => {
    const inPeriod = t.createdAt >= startDate && t.createdAt <= endDate;
    return inPeriod && (t.status === 'valide' || t.status === 'recu');
  });

  let transfersInUSD = 0;
  let transfersOutUSD = 0;
  let transfersInCDF = 0;
  let transfersOutCDF = 0;

  for (const t of filteredTransfers) {
    const isOut = !effectiveAgencyId || t.sourceAgencyId === effectiveAgencyId;
    const isIn = !effectiveAgencyId || t.targetAgencyId === effectiveAgencyId;

    if (effectiveAgencyId) {
      if (isIn) {
        if (t.currency === 'USD') transfersInUSD += t.amount;
        if (t.currency === 'CDF') transfersInCDF += t.amount;
      }
      if (isOut) {
        if (t.currency === 'USD') transfersOutUSD += t.amount;
        if (t.currency === 'CDF') transfersOutCDF += t.amount;
      }
    } else {
      if (t.currency === 'USD') {
        transfersInUSD += t.amount;
        transfersOutUSD += t.amount;
      }
      if (t.currency === 'CDF') {
        transfersInCDF += t.amount;
        transfersOutCDF += t.amount;
      }
    }
  }

  const netTreasuryUSD =
    totalBilletageUSD +
    (effectiveAgencyId ? transfersInUSD - transfersOutUSD : 0);
  const netTreasuryCDF =
    totalBilletageCDF +
    (effectiveAgencyId ? transfersInCDF - transfersOutCDF : 0);

  return {
    totalBilletageUSD,
    totalBilletageCDF,
    totalDiscrepancyUSD,
    totalDiscrepancyCDF,
    billetageCount: filteredBilletages.length,
    operationsTotal: filteredOps.length,
    operationsCompleted,
    operationsPending,
    operationsAmountUSD,
    operationsAmountCDF,
    smsOperationsCount: filteredSms.length,
    activeDebtsUSD,
    activeDebtsCDF,
    transfersInUSD,
    transfersOutUSD,
    transfersInCDF,
    transfersOutCDF,
    netTreasuryUSD,
    netTreasuryCDF,
  };
}

/**
 * Récupère les rapports autorisés pour l'utilisateur courant selon le RBAC strict :
 * - Abonnés & Clients : AUCUN rapport interne
 * - Directeur Général & Administrateur Système : tous les rapports
 * - Administrateur d'agence : rapports de son agencyId
 * - Agent : uniquement ses propres rapports (createdBy === user.uid)
 */
export async function getAuthorizedReports(
  user: AppUser | null
): Promise<LocalReport[]> {
  if (!user) return [];

  // Refus strict pour client et abonné
  if (user.role === 'client' || user.role === 'abonne') {
    return [];
  }

  const all = await db.reports.toArray();

  if (user.role === 'administrateur_systeme' || user.role === 'directeur_general') {
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (user.role === 'administrateur_agence') {
    const agencyReports = all.filter(
      (r) => user.agencyId && r.agencyId === user.agencyId
    );
    return agencyReports.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Profil Agent : strictement limité à ses propres rapports
  const agentReports = all.filter(
    (r) => r.createdBy === user.uid
  );
  return agentReports.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Sauvegarde ou soumet un rapport adaptatif (Offline-First).
 * Empêche toute falsification de l'identité de l'auteur, de l'agence ou de la certification.
 */
export async function saveAdaptiveReport(
  input: Partial<LocalReport>,
  user: AppUser,
  isSubmitting = false
): Promise<LocalReport> {
  if (!canPerformReportAction('reports.create', user)) {
    throw new Error('Action non autorisée : permissions insuffisantes pour créer un rapport.');
  }

  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const enforcedAgencyId = isGlobalRole
    ? input.agencyId || null
    : user.agencyId || null;

  const now = Date.now();
  const isUpdate = !!input.id;
  const existing = isUpdate ? await db.reports.get(input.id!) : null;

  if (existing) {
    if (!canPerformReportAction('reports.edit_own', user, existing)) {
      throw new Error('Action non autorisée : vous ne pouvez modifier que vos brouillons ou rapports retournés.');
    }
  }

  const reportId = input.id || `rep-${now}-${Math.random().toString(36).substring(2, 8)}`;
  const reference = existing?.reference || generateReportReference(input.type || 'activite');

  const { startDate, endDate } = resolvePeriodBounds(
    input.period || 'aujourd_hui',
    input.startDate,
    input.endDate
  );

  const metrics =
    input.metrics ||
    (await computeReportMetrics(enforcedAgencyId, startDate, endDate));

  const status: ReportStatus = isSubmitting ? 'soumis' : (existing?.status === 'retourne' ? 'retourne' : 'brouillon');

  const submissionHistory: ReportSubmissionRecord[] = existing?.submissionHistory
    ? [...existing.submissionHistory]
    : [];

  if (isSubmitting) {
    submissionHistory.push({
      submittedAt: now,
      submittedByUid: user.uid,
      submittedByName: user.displayName || user.email || 'Agent',
      certificationStatement:
        'Je certifie que les informations contenues dans ce rapport sont exactes selon les informations dont je dispose.',
      version: submissionHistory.length + 1,
    });
  }

  const savedReport: LocalReport = {
    ...existing,
    id: reportId,
    reference,
    title: (input.title || `Rapport d'activité — ${new Date().toLocaleDateString('fr-FR')}`).trim(),
    type: input.type || 'activite',
    period: input.period || 'aujourd_hui',
    startDate,
    endDate,
    agencyId: enforcedAgencyId,
    agencyName: input.agencyName || (enforcedAgencyId ? enforcedAgencyId : 'Direction Centrale'),
    status,
    summary:
      input.summary?.trim() ||
      input.executiveSummary?.trim() ||
      `Rapport ${input.type || 'activite'} (${input.authorFunction || user.function || 'Agent'}) pour ${input.agencyName || enforcedAgencyId}.`,
    metrics,
    notes: input.notes?.trim() || '',
    createdBy: existing ? existing.createdBy : user.uid,
    createdByName: existing ? existing.createdByName : (user.displayName || user.email || 'Utilisateur'),
    createdByRole: existing ? existing.createdByRole : user.role,
    mode: input.mode || 'guide',
    authorFunction: existing?.authorFunction || input.authorFunction || user.function || 'agent',
    authorService: existing?.authorService || input.authorService || user.function || 'Guichet',
    selectedServices: input.selectedServices || [],
    recipientRole: input.recipientRole || 'administrateur_agence',
    recipientAgencyId: enforcedAgencyId,
    priority: input.priority || 'normal',
    executiveSummary: input.executiveSummary?.trim() || '',
    categoryData: input.categoryData || existing?.categoryData,
    activities: input.activities || [],
    results: input.results || [],
    quantitativeData: input.quantitativeData || [],
    difficulties: input.difficulties || [],
    incidents: input.incidents || [],
    recommendations: input.recommendations || [],
    decisionsNeeded: input.decisionsNeeded || [],
    linkedBilletageId: input.linkedBilletageId || null,
    linkedBilletageRef: input.linkedBilletageRef || null,
    linkedBilletageAmount: input.linkedBilletageAmount,
    linkedBilletageCurrency: input.linkedBilletageCurrency,
    attachments: input.attachments || [],
    returnHistory: existing?.returnHistory || [],
    submissionHistory,
    certifiedByAuthor: isSubmitting ? true : existing?.certifiedByAuthor || false,
    certifiedAt: isSubmitting ? now : existing?.certifiedAt,
    syncStatus: 'pending',
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  await db.reports.put(savedReport);

  await db.syncQueue.add({
    entity: 'report',
    entityId: reportId,
    operation: isUpdate ? 'update' : 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: isSubmitting ? 'Soumission officielle de rapport' : 'Sauvegarde brouillon rapport',
    category: 'operations',
    severity: isSubmitting ? 'info' : 'info',
    details: `Rapport ${reference} (« ${savedReport.title} ») ${isSubmitting ? 'soumis pour examen' : 'enregistré localement'} par ${user.displayName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId,
      reference,
      type: savedReport.type,
      agencyId: enforcedAgencyId,
      status,
      isSubmitting,
    },
  });

  // Si soumission, créer une annonce/notification locale pour le responsable d'agence
  if (isSubmitting) {
    try {
      const notifId = `notif-rep-${now}-${Math.random().toString(36).substring(2, 6)}`;
      const notif: LocalBroadcast = {
        id: notifId,
        title: `Nouveau rapport soumis : ${reference}`,
        message: `${user.displayName} (${user.function || 'Agent'}) a soumis le rapport « ${savedReport.title} » pour l'agence.`,
        severity: savedReport.priority === 'critique' ? 'critique' : 'info',
        scope: 'agence',
        agencyId: enforcedAgencyId,
        agencyName: savedReport.agencyName,
        requiresAck: savedReport.priority === 'critique',
        requiresReadConfirmation: false,
        blockingUntilAck: false,
        acknowledgedBy: [],
        readBy: [],
        authorId: user.uid,
        authorName: user.displayName || 'Agent',
        authorRole: user.role,
        syncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await db.broadcasts.put(notif);
      await db.syncQueue.add({
        entity: 'broadcast',
        entityId: notifId,
        operation: 'create',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // ignore
    }
  }

  return savedReport;
}

/**
 * Retourne un rapport à son auteur pour correction avec motif et liste de points à corriger.
 */
export async function returnReportForCorrection(
  reportId: string,
  reason: string,
  correctionPoints: string[],
  notes: string,
  user: AppUser
): Promise<void> {
  const existing = await db.reports.get(reportId);
  if (!existing) throw new Error('Rapport introuvable.');

  if (!canPerformReportAction('reports.return', user, existing)) {
    throw new Error('Action non autorisée : vous n\'avez pas les permissions pour retourner ce rapport.');
  }

  const now = Date.now();
  const returnRecord: ReportReturnRecord = {
    returnedAt: now,
    returnedByUid: user.uid,
    returnedByName: user.displayName || 'Responsable',
    returnedByRole: user.role,
    reason: reason.trim(),
    correctionPoints: correctionPoints.filter((p) => p.trim().length > 0),
    notes: notes.trim(),
  };

  const returnHistory = existing.returnHistory ? [...existing.returnHistory, returnRecord] : [returnRecord];

  await db.reports.update(reportId, {
    status: 'retourne',
    returnHistory,
    syncStatus: 'pending',
    updatedAt: now,
  });

  await db.syncQueue.add({
    entity: 'report',
    entityId: reportId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Retour de rapport pour correction',
    category: 'operations',
    severity: 'warning',
    details: `Rapport ${existing.reference} retourné à ${existing.createdByName} pour correction : ${reason}.`,
    actorName: user.displayName || 'Responsable',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId,
      reference: existing.reference,
      reason,
      correctionPoints,
      authorUid: existing.createdBy,
    },
  });

  // Notification pour l'agent auteur
  try {
    const notifId = `notif-ret-${now}-${Math.random().toString(36).substring(2, 6)}`;
    await db.broadcasts.put({
      id: notifId,
      title: `Rapport retourné : ${existing.reference}`,
      message: `Votre rapport « ${existing.title} » vous a été retourné pour correction par ${user.displayName}. Motif : ${reason}`,
      severity: 'important',
      scope: 'agence',
      agencyId: existing.agencyId,
      requiresAck: true,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
      acknowledgedBy: [],
      readBy: [],
      authorId: user.uid,
      authorName: user.displayName || 'Responsable',
      authorRole: user.role,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // ignore
  }
}

/**
 * Traite et valide officiellement un rapport.
 */
export async function approveOrProcessReport(
  reportId: string,
  user: AppUser,
  notes?: string
): Promise<void> {
  const existing = await db.reports.get(reportId);
  if (!existing) throw new Error('Rapport introuvable.');

  if (!canPerformReportAction('reports.approve', user, existing)) {
    throw new Error('Action non autorisée : vous n\'avez pas les droits pour valider ce rapport.');
  }

  const now = Date.now();
  await db.reports.update(reportId, {
    status: 'traite',
    notes: notes ? `${existing.notes ? existing.notes + '\n\n' : ''}[Validation ${user.displayName}] : ${notes}` : existing.notes,
    syncStatus: 'pending',
    updatedAt: now,
  });

  await db.syncQueue.add({
    entity: 'report',
    entityId: reportId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Validation et traitement de rapport',
    category: 'operations',
    severity: 'security',
    details: `Rapport ${existing.reference} (« ${existing.title} ») approuvé et traité par ${user.displayName}.`,
    actorName: user.displayName || 'Responsable',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId,
      reference: existing.reference,
      agencyId: existing.agencyId,
      authorUid: existing.createdBy,
    },
  });
}

/**
 * Supprime un rapport à l'état de brouillon uniquement.
 */
export async function deleteDraftReport(
  reportId: string,
  user: AppUser
): Promise<void> {
  const existing = await db.reports.get(reportId);
  if (!existing) return;

  if (!canPerformReportAction('reports.delete_draft', user, existing)) {
    throw new Error('Seuls vos propres brouillons non soumis peuvent être supprimés.');
  }

  await db.reports.delete(reportId);

  await db.syncQueue.add({
    entity: 'report',
    entityId: reportId,
    operation: 'delete',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await recordAuditLog({
    action: 'Suppression brouillon rapport',
    category: 'operations',
    severity: 'info',
    details: `Brouillon de rapport ${existing.reference} supprimé par ${user.displayName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { reportId, reference: existing.reference },
  });
}

/**
 * Consolidation des rapports de l'agence (pour Administrateur d'Agence).
 * Produit une synthèse sans modifier ni dupliquer les rapports individuels sources.
 */
export async function consolidateAgencyReports(
  agencyId: string,
  startDate: number,
  endDate: number,
  title: string,
  user: AppUser
): Promise<LocalReport> {
  if (!canPerformReportAction('reports.consolidate_agency', user)) {
    throw new Error('Action non autorisée : permissions insuffisantes pour consolider les rapports.');
  }

  const allReports = await db.reports.toArray();
  const sourceReports = allReports.filter(
    (r) =>
      r.agencyId === agencyId &&
      r.createdAt >= startDate &&
      r.createdAt <= endDate &&
      (r.status === 'soumis' || r.status === 'traite' || r.status === 'valide')
  );

  const metrics = await computeReportMetrics(agencyId, startDate, endDate);
  const now = Date.now();
  const id = `rep-consol-${now}-${Math.random().toString(36).substring(2, 6)}`;
  const reference = `RPT-CNS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

  const allActivities: ReportActivityItem[] = [];
  const allIncidents: ReportIncidentItem[] = [];
  const allDifficulties: ReportDifficultyItem[] = [];
  const allRecommendations: ReportRecommendationItem[] = [];

  for (const src of sourceReports) {
    if (src.activities) allActivities.push(...src.activities);
    if (src.incidents) allIncidents.push(...src.incidents);
    if (src.difficulties) allDifficulties.push(...src.difficulties);
    if (src.recommendations) allRecommendations.push(...src.recommendations);
  }

  const summary = `Synthèse consolidée agence (${sourceReports.length} rapport(s) agent(s) intégrés) : ${metrics.operationsCompleted} opérations exécutées sur ${metrics.operationsTotal} • Caisse nette : $${metrics.netTreasuryUSD.toLocaleString('fr-FR')} / ${metrics.netTreasuryCDF.toLocaleString('fr-FR')} CDF.`;

  const consolidatedReport: LocalReport = {
    id,
    reference,
    title: title.trim() || `Synthèse Consolidée Agence — ${new Date().toLocaleDateString('fr-FR')}`,
    type: 'global',
    period: 'personnalise',
    startDate,
    endDate,
    agencyId,
    agencyName: sourceReports[0]?.agencyName || agencyId,
    status: 'valide',
    summary,
    metrics,
    mode: 'guide',
    authorFunction: 'administrateur_agence',
    authorService: 'Administration Agence',
    recipientRole: 'directeur_general',
    priority: 'normal',
    executiveSummary: summary,
    activities: allActivities,
    incidents: allIncidents,
    difficulties: allDifficulties,
    recommendations: allRecommendations,
    consolidatedSourceReportIds: sourceReports.map((r) => r.id),
    consolidatedBy: user.uid,
    consolidatedAt: now,
    createdBy: user.uid,
    createdByName: user.displayName || 'Administrateur d\'Agence',
    createdByRole: user.role,
    certifiedByAuthor: true,
    certifiedAt: now,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.reports.put(consolidatedReport);

  await db.syncQueue.add({
    entity: 'report',
    entityId: id,
    operation: 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Consolidation de rapports d\'agence',
    category: 'operations',
    severity: 'info',
    details: `Synthèse consolidée ${reference} générée pour l'agence ${agencyId} (${sourceReports.length} rapports sources).`,
    actorName: user.displayName || 'Admin Agence',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId: id,
      reference,
      sourceReportsCount: sourceReports.length,
      agencyId,
    },
  });

  return consolidatedReport;
}

/**
 * Compatibilité existante : conserve generateAndSaveReport avec les anciens paramètres
 */
export async function generateAndSaveReport(
  input: GenerateReportInput,
  user: AppUser
): Promise<LocalReport> {
  return saveAdaptiveReport(input, user, false);
}

/**
 * Compatibilité existante : mise à jour simple de statut
 */
export async function updateReportStatus(
  reportId: string,
  nextStatus: LocalReport['status'],
  user: AppUser
): Promise<void> {
  if (nextStatus === 'retourne') {
    await returnReportForCorrection(reportId, 'Demande de correction hiérarchique', [], '', user);
  } else if (nextStatus === 'traite' || nextStatus === 'valide') {
    await approveOrProcessReport(reportId, user);
  } else {
    const existing = await db.reports.get(reportId);
    if (!existing) throw new Error('Rapport introuvable.');
    const now = Date.now();
    await db.reports.update(reportId, {
      status: nextStatus,
      syncStatus: 'pending',
      updatedAt: now,
    });
    await db.syncQueue.add({
      entity: 'report',
      entityId: reportId,
      operation: 'update',
      attempts: 0,
      lastError: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Export réel au format Excel (.csv avec BOM UTF-8)
 * Respecte strictement l'isolation RBAC et consigne l'audit.
 */
export async function exportReportsToExcel(
  reports: LocalReport[],
  user: AppUser,
  filterLabel: string
): Promise<void> {
  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  const isAgencyAdmin = user.role === 'administrateur_agence';

  const authorizedRows = isGlobalRole
    ? reports
    : isAgencyAdmin
      ? reports.filter((r) => user.agencyId && r.agencyId === user.agencyId)
      : reports.filter((r) => r.createdBy === user.uid);

  const headers = [
    'Référence',
    'Titre',
    'Type',
    'Statut',
    'Priorité',
    'Auteur',
    'Fonction',
    'Agence',
    'Période Début',
    'Période Fin',
    'Billetage USD',
    'Billetage CDF',
    'Écart Caisse USD',
    'Écart Caisse CDF',
    'Opérations Exécutées',
    'Opérations Totales',
    'Activités Déclarées',
    'Incidents Signalés',
    'Date Création',
    'Dernière Soumission',
  ];

  const escapeCsv = (val: string | number | null | undefined) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [
    headers.map(escapeCsv).join(';'),
    ...authorizedRows.map((r) =>
      [
        r.reference,
        r.title,
        r.type,
        r.status,
        r.priority || 'normal',
        r.createdByName,
        r.authorFunction || r.createdByRole,
        r.agencyName,
        new Date(r.startDate).toLocaleDateString('fr-FR'),
        new Date(r.endDate).toLocaleDateString('fr-FR'),
        r.metrics.totalBilletageUSD.toFixed(2),
        r.metrics.totalBilletageCDF.toFixed(0),
        r.metrics.totalDiscrepancyUSD.toFixed(2),
        r.metrics.totalDiscrepancyCDF.toFixed(0),
        r.metrics.operationsCompleted,
        r.metrics.operationsTotal,
        r.activities?.length || 0,
        r.incidents?.length || 0,
        new Date(r.createdAt).toLocaleString('fr-FR'),
        r.certifiedAt ? new Date(r.certifiedAt).toLocaleString('fr-FR') : 'Non soumis',
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Ets-AMANI-Rapports-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  await recordAuditLog({
    action: 'Export Excel (.CSV) des Rapports',
    category: 'operations',
    severity: 'info',
    details: `Export Excel de ${authorizedRows.length} rapport(s) effectué par ${user.displayName} (${filterLabel}).`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      exportedCount: authorizedRows.length,
      filterLabel,
      agencyId: user.agencyId || 'ALL',
    },
  });
}

/**
 * Déclenche l'export PDF officiel (impression native) et enregistre la trace d'audit.
 */
export async function auditPdfExport(
  report: LocalReport,
  user: AppUser
): Promise<void> {
  await recordAuditLog({
    action: 'Export PDF Rapport Officiel',
    category: 'operations',
    severity: 'info',
    details: `Export PDF du rapport ${report.reference} (« ${report.title} ») pour ${report.agencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId: report.id,
      reference: report.reference,
      agencyId: report.agencyId,
    },
  });
  window.print();
}
