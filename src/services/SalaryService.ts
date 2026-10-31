import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  db,
  type CoveredSalaryPeriod,
  type LocalSalaryAdvance,
  type LocalSalaryClaim,
  type LocalSalaryRecord,
  type SalaryAdvanceStatus,
  type SalaryClaimStatus,
  type SalaryEventEntry,
  type SalaryStatus,
} from '../lib/db';
import { db as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import { recordAuditLog } from './AuditService';
import { createBroadcast } from './EnterpriseOperationsService';
import { createOperation, updateOperationStatus } from './OperationService';

const SALARY_SETTINGS_COLLECTION = 'systemControls';
const SALARY_SETTINGS_DOC_ID = 'salarySettings';
const SALARY_SETTINGS_LOCAL_KEY = 'ets_amani_salary_settings_cache';

export interface SalaryModuleSettings {
  advanceRequestsEnabled: boolean;
  updatedByUid?: string;
  updatedByName?: string;
  updatedAt: number;
}

export const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function formatSalaryPeriodLabel(month: number, year: number): string {
  const mName = MONTH_NAMES_FR[(month - 1 + 12) % 12] || `Mois ${month}`;
  return `${mName} ${year}`;
}

export function buildSalaryPeriodKey(
  agentId: string,
  year: number,
  month: number
): string {
  return `${agentId}_${year}_${String(month).padStart(2, '0')}`;
}

function makeHistoryEvent(
  action: string,
  details: string,
  actor: AppUser
): SalaryEventEntry {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action,
    actorUid: actor.uid,
    actorName: actor.displayName || actor.email || 'Utilisateur',
    actorRole: actor.role,
    details,
    timestamp: Date.now(),
  };
}

async function enqueueSalaryEntitySync(
  entity: 'salary' | 'salaryClaim' | 'salaryAdvance',
  entityId: string,
  operation: 'create' | 'update'
): Promise<void> {
  const now = Date.now();
  await db.syncQueue.add({
    entity,
    entityId,
    operation,
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

/* =========================================================
   1. CONFIGURATION DG : ACTIVATION / DESACTIVATION AVANCES
   ========================================================= */

function readLocalSalarySettings(): SalaryModuleSettings {
  try {
    const raw = localStorage.getItem(SALARY_SETTINGS_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        advanceRequestsEnabled: Boolean(parsed.advanceRequestsEnabled),
        updatedByUid: parsed.updatedByUid,
        updatedByName: parsed.updatedByName,
        updatedAt: Number(parsed.updatedAt || Date.now()),
      };
    }
  } catch {
    // ignore
  }
  return {
    advanceRequestsEnabled: false,
    updatedAt: Date.now(),
  };
}

function writeLocalSalarySettings(settings: SalaryModuleSettings): void {
  try {
    localStorage.setItem(SALARY_SETTINGS_LOCAL_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export async function getSalaryModuleSettings(): Promise<SalaryModuleSettings> {
  const local = readLocalSalarySettings();
  if (!isFirebaseConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return local;
  }
  try {
    const ref = doc(firestoreDb, SALARY_SETTINGS_COLLECTION, SALARY_SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return local;
    }
    const data = snap.data();
    const merged: SalaryModuleSettings = {
      advanceRequestsEnabled: Boolean(data.advanceRequestsEnabled),
      updatedByUid: data.updatedByUid,
      updatedByName: data.updatedByName,
      updatedAt: Number(data.updatedAt || Date.now()),
    };
    writeLocalSalarySettings(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function setSalaryAdvancesAvailability(
  enabled: boolean,
  actor: AppUser
): Promise<SalaryModuleSettings> {
  if (
    actor.role !== 'directeur_general' &&
    actor.role !== 'administrateur_systeme'
  ) {
    throw new Error(
      'Accès refusé : seul le Directeur Général peut activer ou désactiver les demandes d’avance sur salaire.'
    );
  }

  const next: SalaryModuleSettings = {
    advanceRequestsEnabled: enabled,
    updatedByUid: actor.uid,
    updatedByName: actor.displayName || 'Direction Générale',
    updatedAt: Date.now(),
  };

  writeLocalSalarySettings(next);

  if (isFirebaseConfigured) {
    try {
      const ref = doc(firestoreDb, SALARY_SETTINGS_COLLECTION, SALARY_SETTINGS_DOC_ID);
      await setDoc(ref, next, { merge: true });
    } catch (err) {
      console.warn('[Ets AMANI] Sauvegarde salarySettings reportée en cache local :', err);
    }
  }

  await recordAuditLog({
    action: enabled
      ? 'Activation des demandes d’avance sur salaire'
      : 'Désactivation des demandes d’avance sur salaire',
    category: 'config',
    severity: 'security',
    details: `Le Directeur Général (${actor.displayName}) a ${
      enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'
    } la fonctionnalité de demande d'avance sur salaire pour les agents.`,
    actorName: actor.displayName || 'Direction Générale',
    actorRole: actor.role,
    actorUid: actor.uid,
    metadata: { advanceRequestsEnabled: enabled },
  });

  return next;
}

/* =========================================================
   2. LECTURE FILTREE SELON LE RBAC ET L'ISOLATION D'AGENCE
   ========================================================= */

export function isUserDesignatedPayerForSalary(
  user: AppUser,
  record: {
    agencyId: string | null;
    designatedPayerType?: 'user' | 'service' | null;
    designatedPayerId?: string | null;
    designatedPayerService?: string | null;
  }
): boolean {
  if (
    user.role === 'directeur_general' ||
    user.role === 'administrateur_systeme'
  ) {
    return true;
  }
  if (record.designatedPayerType === 'user' && record.designatedPayerId) {
    return record.designatedPayerId === user.uid;
  }
  if (
    record.designatedPayerType === 'service' &&
    record.designatedPayerService
  ) {
    const sameAgency =
      !record.agencyId || !user.agencyId || record.agencyId === user.agencyId;
    if (!sameAgency) return false;
    if (user.role === 'administrateur_agence') return true;
    const svc = record.designatedPayerService;
    return (
      user.function === svc ||
      Boolean(user.functions && user.functions.includes(svc as never))
    );
  }
  return false;
}

export async function getAuthorizedSalaries(
  user: AppUser | null
): Promise<LocalSalaryRecord[]> {
  if (!user) return [];
  const all = await db.salaries.toArray();
  const now = Date.now();

  // Mise à jour automatique du statut "en_retard" si la date d'échéance est dépassée et non payé
  for (const sal of all) {
    if (
      (sal.status === 'a_payer' ||
        sal.status === 'autorise' ||
        sal.status === 'en_attente_de_paiement') &&
      sal.dueDate < now
    ) {
      sal.status = 'en_retard';
      await db.salaries.update(sal.id, { status: 'en_retard', updatedAt: now });
    }
  }

  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const filtered = all.filter((s) => {
    if (isGlobal) return true;
    // Un agent voit ses propres salaires OU les paiements qu'il est désigné à payer
    if (s.agentId === user.uid) return true;
    if (isUserDesignatedPayerForSalary(user, s)) return true;
    // Un administrateur d'agence voit les salaires de son agence
    if (
      user.role === 'administrateur_agence' &&
      user.agencyId &&
      s.agencyId === user.agencyId
    ) {
      return true;
    }
    return false;
  });

  return filtered.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getAuthorizedSalaryClaims(
  user: AppUser | null
): Promise<LocalSalaryClaim[]> {
  if (!user) return [];
  const all = await db.salaryClaims.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const filtered = all.filter((c) => {
    if (isGlobal) return true;
    if (c.agentId === user.uid) return true;
    if (
      user.role === 'administrateur_agence' &&
      user.agencyId &&
      c.agencyId === user.agencyId
    ) {
      return true;
    }
    return false;
  });

  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAuthorizedSalaryAdvances(
  user: AppUser | null
): Promise<LocalSalaryAdvance[]> {
  if (!user) return [];
  const all = await db.salaryAdvances.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const filtered = all.filter((adv) => {
    if (isGlobal) return true;
    if (adv.agentId === user.uid) return true;
    if (isUserDesignatedPayerForSalary(user, adv)) return true;
    if (
      user.role === 'administrateur_agence' &&
      user.agencyId &&
      adv.agencyId === user.agencyId
    ) {
      return true;
    }
    return false;
  });

  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

/* =========================================================
   3. DEFINITION & PREPARATION DU SALAIRE PAR PERIODE (DG)
   ========================================================= */

export interface DefineSalaryPeriodInput {
  agentId: string;
  agentName: string;
  agentFunction?: string;
  agencyId: string | null;
  agencyName: string;
  year: number;
  month: number;
  plannedAmount: number;
  currency: 'USD' | 'CDF';
  dueDate?: number;
}

export async function defineOrUpdateSalaryForPeriod(
  input: DefineSalaryPeriodInput,
  dgUser: AppUser
): Promise<LocalSalaryRecord> {
  if (
    dgUser.role !== 'directeur_general' &&
    dgUser.role !== 'administrateur_systeme'
  ) {
    throw new Error(
      'Violation RBAC : seul le Directeur Général est habilité à définir ou modifier le salaire d’un agent.'
    );
  }

  if (input.plannedAmount <= 0) {
    throw new Error('Le montant du salaire doit être strictement supérieur à 0.');
  }

  const periodKey = buildSalaryPeriodKey(input.agentId, input.year, input.month);
  const existing = await db.salaries.where('periodKey').equals(periodKey).first();
  const now = Date.now();
  const periodLabel = formatSalaryPeriodLabel(input.month, input.year);

  if (existing) {
    if (existing.status === 'couvert_par_avance') {
      throw new Error(
        `Opération bloquée : la période ${periodLabel} de ${input.agentName} est déjà couverte par l'avance ${existing.coveredByAdvanceRef || existing.coveredByAdvanceId}.`
      );
    }
    if (existing.status === 'paye' || existing.status === 'confirme') {
      throw new Error(
        `Modification interdite : le salaire de ${periodLabel} pour ${input.agentName} a déjà été payé. L'historique salarial ne peut pas être écrasé.`
      );
    }

    const oldAmount = existing.plannedAmount;
    const evt = makeHistoryEvent(
      'Modification du montant prévu par le DG',
      `Montant modifié de ${oldAmount} ${existing.currency} à ${input.plannedAmount} ${input.currency} pour ${periodLabel}.`,
      dgUser
    );

    const updated: LocalSalaryRecord = {
      ...existing,
      plannedAmount: Number(input.plannedAmount),
      currency: input.currency,
      dueDate: input.dueDate || existing.dueDate,
      history: [...existing.history, evt],
      syncStatus: 'pending',
      updatedAt: now,
    };

    await db.salaries.put(updated);
    await enqueueSalaryEntitySync('salary', existing.id, 'update');

    await recordAuditLog({
      action: 'Modification salaire mensuel agent',
      category: 'operations',
      severity: 'warning',
      details: `Salaire de ${input.agentName} (${periodLabel}) modifié de ${oldAmount} à ${input.plannedAmount} ${input.currency} par ${dgUser.displayName}.`,
      actorName: dgUser.displayName || 'DG',
      actorRole: dgUser.role,
      actorUid: dgUser.uid,
      metadata: {
        salaryId: existing.id,
        agentId: input.agentId,
        periodKey,
        oldAmount,
        newAmount: input.plannedAmount,
        currency: input.currency,
      },
    });

    return updated;
  }

  // Création d'une nouvelle période de paie
  const id = `sal-${now}-${Math.random().toString(36).substring(2, 8)}`;
  const reference = `SAL-${input.year}${String(input.month).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const defaultDueDate =
    input.dueDate || new Date(input.year, input.month, 5, 23, 59, 59).getTime();

  const initEvt = makeHistoryEvent(
    'Définition du salaire par le DG',
    `Salaire fixé à ${input.plannedAmount} ${input.currency} pour la période ${periodLabel}.`,
    dgUser
  );

  const record: LocalSalaryRecord = {
    id,
    periodKey,
    reference,
    paymentCategory: 'salaire_normal',
    agentId: input.agentId,
    agentName: input.agentName,
    agentFunction: input.agentFunction || 'guichetier',
    agencyId: input.agencyId,
    agencyName: input.agencyName || 'Agence Centrale',
    year: input.year,
    month: input.month,
    plannedAmount: Number(input.plannedAmount),
    paidAmount: 0,
    currency: input.currency,
    status: 'a_payer',
    authorizedByUid: null,
    authorizedByName: null,
    authorizedAt: null,
    designatedPayerType: null,
    designatedPayerId: null,
    designatedPayerName: null,
    designatedPayerService: null,
    paidByUid: null,
    paidByName: null,
    paidByService: null,
    paidAt: null,
    linkedOperationId: null,
    linkedOperationNumber: null,
    confirmedByAgent: false,
    confirmedAt: null,
    confirmationNote: null,
    coveredByAdvanceId: null,
    coveredByAdvanceRef: null,
    dueDate: defaultDueDate,
    history: [initEvt],
    createdBy: dgUser.uid,
    createdByName: dgUser.displayName || 'Direction Générale',
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.salaries.put(record);
  await enqueueSalaryEntitySync('salary', id, 'create');

  await recordAuditLog({
    action: 'Création / Définition de salaire mensuel',
    category: 'operations',
    severity: 'info',
    details: `Salaire ${reference} défini pour ${input.agentName} (${periodLabel}) : ${input.plannedAmount} ${input.currency}.`,
    actorName: dgUser.displayName || 'DG',
    actorRole: dgUser.role,
    actorUid: dgUser.uid,
    metadata: {
      salaryId: id,
      reference,
      agentId: input.agentId,
      periodKey,
      amount: input.plannedAmount,
      currency: input.currency,
    },
  });

  return record;
}

/* =========================================================
   4. AUTORISATION DU PAIEMENT & DESIGNATION DU PAYEUR (DG)
   ========================================================= */

export interface DesignatePayerInput {
  designatedPayerType: 'user' | 'service';
  designatedPayerId?: string | null;
  designatedPayerName?: string | null;
  designatedPayerService?: string | null;
}

export async function authorizeSalaryAndDesignatePayer(
  salaryId: string,
  payerInput: DesignatePayerInput,
  dgUser: AppUser
): Promise<LocalSalaryRecord> {
  if (
    dgUser.role !== 'directeur_general' &&
    dgUser.role !== 'administrateur_systeme'
  ) {
    throw new Error(
      'Violation RBAC : seul le Directeur Général peut autoriser le paiement et désigner le payeur.'
    );
  }

  const existing = await db.salaries.get(salaryId);
  if (!existing) throw new Error('Fiche de salaire introuvable.');

  if (existing.status === 'couvert_par_avance') {
    throw new Error(
      'Ce mois est déjà couvert par une avance sur salaire et ne peut pas faire l’objet d’un second paiement normal.'
    );
  }
  if (existing.status === 'paye' || existing.status === 'confirme') {
    throw new Error('Ce salaire a déjà été payé.');
  }

  const now = Date.now();
  const payerDesc =
    payerInput.designatedPayerType === 'user'
      ? `Utilisateur : ${payerInput.designatedPayerName || payerInput.designatedPayerId}`
      : `Service : ${payerInput.designatedPayerService}`;

  const evt = makeHistoryEvent(
    'Autorisation DG & Désignation du payeur',
    `Paiement de ${existing.plannedAmount} ${existing.currency} autorisé par ${dgUser.displayName}. Payeur désigné : ${payerDesc}.`,
    dgUser
  );

  const updated: LocalSalaryRecord = {
    ...existing,
    status: 'en_attente_de_paiement',
    authorizedByUid: dgUser.uid,
    authorizedByName: dgUser.displayName || 'Direction Générale',
    authorizedAt: now,
    designatedPayerType: payerInput.designatedPayerType,
    designatedPayerId: payerInput.designatedPayerId || null,
    designatedPayerName: payerInput.designatedPayerName || null,
    designatedPayerService: payerInput.designatedPayerService || null,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaries.put(updated);
  await enqueueSalaryEntitySync('salary', salaryId, 'update');

  // Notification via le système existant
  await createBroadcast(
    {
      title: `Salaire autorisé — ${formatSalaryPeriodLabel(existing.month, existing.year)}`,
      message: `Le salaire de ${existing.agentName} (${existing.plannedAmount} ${existing.currency}) pour ${formatSalaryPeriodLabel(existing.month, existing.year)} est autorisé au paiement (${payerDesc}).`,
      severity: 'info',
      scope: existing.agencyId ? 'agence' : 'global',
      agencyId: existing.agencyId,
      agencyName: existing.agencyName,
      requiresAck: false,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    dgUser
  );

  await recordAuditLog({
    action: 'Autorisation de paiement salaire & désignation payeur',
    category: 'operations',
    severity: 'security',
    details: `Salaire ${existing.reference} (${existing.agentName}) autorisé (${existing.plannedAmount} ${existing.currency}). Payeur : ${payerDesc}.`,
    actorName: dgUser.displayName || 'DG',
    actorRole: dgUser.role,
    actorUid: dgUser.uid,
    metadata: {
      salaryId,
      reference: existing.reference,
      agentId: existing.agentId,
      designatedPayerType: payerInput.designatedPayerType,
      designatedPayerId: payerInput.designatedPayerId,
      designatedPayerService: payerInput.designatedPayerService,
    },
  });

  return updated;
}

/* =========================================================
   5. PAIEMENT EFFECTIF PAR LE PAYEUR AUTORISE + LIEN TRESORERIE
   ========================================================= */

export async function executeAuthorizedSalaryPayment(
  salaryId: string,
  payerUser: AppUser,
  paymentComments?: string
): Promise<LocalSalaryRecord> {
  const existing = await db.salaries.get(salaryId);
  if (!existing) throw new Error('Fiche de salaire introuvable.');

  if (
    existing.status !== 'autorise' &&
    existing.status !== 'en_attente_de_paiement' &&
    existing.status !== 'en_retard' &&
    existing.status !== 'reclame'
  ) {
    throw new Error(
      `Ce salaire ne peut pas être payé dans son état actuel (${existing.status}). Il doit d'abord être autorisé par le DG.`
    );
  }

  if (!existing.authorizedByUid) {
    throw new Error(
      'Paiement bloqué : aucune autorisation du Directeur Général n’est enregistrée sur ce salaire.'
    );
  }

  if (!isUserDesignatedPayerForSalary(payerUser, existing)) {
    throw new Error(
      'Violation RBAC : vous n’êtes pas le payeur ou le service désigné par le Directeur Général pour effectuer ce paiement.'
    );
  }

  if (
    payerUser.uid === existing.agentId &&
    payerUser.role !== 'directeur_general' &&
    payerUser.role !== 'administrateur_systeme' &&
    existing.designatedPayerId !== payerUser.uid
  ) {
    throw new Error(
      'Sécurité : un agent ne peut jamais se déclarer lui-même payé.'
    );
  }

  // Création d'une opération financière réelle dans OperationService (sortie de trésorerie)
  const periodLabel = formatSalaryPeriodLabel(existing.month, existing.year);
  const finOp = await createOperation({
    type: 'paiement',
    title: `Paiement Salaire ${periodLabel} — ${existing.agentName}`,
    description: `Règlement salarial ${existing.reference} autorisé par ${existing.authorizedByName}. ${paymentComments || ''}`.trim(),
    priority: 'normal',
    agencyId: existing.agencyId || payerUser.agencyId || 'CENTRALE',
    agencyName: existing.agencyName || 'Agence Centrale',
    assignedAgentIds: [existing.agentId],
    assignedAgentNames: [existing.agentName],
    createdBy: payerUser.uid,
    createdByName: payerUser.displayName || 'Payeur Autorisé',
    amount: existing.plannedAmount,
    currency: existing.currency,
    comments: `Réf Salaire: ${existing.reference}`,
  });
  await updateOperationStatus(finOp.id, 'termine');

  const now = Date.now();
  const evt = makeHistoryEvent(
    'Paiement effectué par le payeur autorisé',
    `Montant de ${existing.plannedAmount} ${existing.currency} versé par ${payerUser.displayName} (Opération Trésorerie ${finOp.operationNumber}). En attente de confirmation de réception par l'agent.`,
    payerUser
  );

  const updated: LocalSalaryRecord = {
    ...existing,
    paidAmount: existing.plannedAmount, // Le payeur ne peut jamais modifier le montant fixé par le DG
    status: 'paye',
    paidByUid: payerUser.uid,
    paidByName: payerUser.displayName || 'Payeur',
    paidByService: payerUser.function || payerUser.role,
    paidAt: now,
    linkedOperationId: finOp.id,
    linkedOperationNumber: finOp.operationNumber,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaries.put(updated);
  await enqueueSalaryEntitySync('salary', salaryId, 'update');

  // Si une réclamation était ouverte pour ce salaire, la marquer comme "payee"
  const openClaims = await db.salaryClaims
    .where('salaryId')
    .equals(salaryId)
    .toArray();
  for (const clm of openClaims) {
    if (clm.status !== 'payee') {
      await db.salaryClaims.update(clm.id, {
        status: 'payee',
        dgResponse: `Salaire réglé le ${new Date(now).toLocaleDateString('fr-FR')} (Opération ${finOp.operationNumber}).`,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await enqueueSalaryEntitySync('salaryClaim', clm.id, 'update');
    }
  }

  await createBroadcast(
    {
      title: `Salaire payé — Confirmation attendue (${periodLabel})`,
      message: `Le salaire de ${existing.agentName} (${existing.plannedAmount} ${existing.currency}) a été décaissé par ${payerUser.displayName} (Réf: ${finOp.operationNumber}). L'agent est invité à confirmer la réception dans « Mon Salaire ».`,
      severity: 'important',
      scope: existing.agencyId ? 'agence' : 'global',
      agencyId: existing.agencyId,
      agencyName: existing.agencyName,
      requiresAck: true,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    payerUser
  );

  await recordAuditLog({
    action: 'Décaissement effectif de salaire',
    category: 'operations',
    severity: 'security',
    details: `Salaire ${existing.reference} de ${existing.agentName} (${existing.plannedAmount} ${existing.currency}, ${periodLabel}) payé par ${payerUser.displayName}. Opération liée : ${finOp.operationNumber}.`,
    actorName: payerUser.displayName || 'Payeur',
    actorRole: payerUser.role,
    actorUid: payerUser.uid,
    metadata: {
      salaryId,
      reference: existing.reference,
      agentId: existing.agentId,
      amount: existing.plannedAmount,
      currency: existing.currency,
      linkedOperationId: finOp.id,
      linkedOperationNumber: finOp.operationNumber,
    },
  });

  return updated;
}

/* =========================================================
   6. CONFIRMATION DE RECEPTION PAR L'AGENT BENEFICIAIRE
   ========================================================= */

export async function confirmSalaryReceiptByAgent(
  salaryId: string,
  agentUser: AppUser,
  confirmationNote?: string
): Promise<LocalSalaryRecord> {
  const existing = await db.salaries.get(salaryId);
  if (!existing) throw new Error('Fiche de salaire introuvable.');

  if (existing.agentId !== agentUser.uid) {
    throw new Error(
      'Violation RBAC : seul l’agent bénéficiaire concerné peut confirmer la réception de son propre salaire.'
    );
  }

  if (existing.status !== 'paye') {
    throw new Error(
      'La confirmation de réception n’est possible qu’après le paiement effectif par le payeur autorisé.'
    );
  }

  const now = Date.now();
  const periodLabel = formatSalaryPeriodLabel(existing.month, existing.year);
  const noteText =
    confirmationNote?.trim() ||
    `J'ai reçu mon salaire pour le mois de ${periodLabel}.`;

  const evt = makeHistoryEvent(
    'Confirmation de réception par l’agent',
    `« ${noteText} » — Réception confirmée par ${agentUser.displayName} (Réf paiement : ${existing.linkedOperationNumber || existing.reference}).`,
    agentUser
  );

  const updated: LocalSalaryRecord = {
    ...existing,
    status: 'confirme',
    confirmedByAgent: true,
    confirmedAt: now,
    confirmationNote: noteText,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaries.put(updated);
  await enqueueSalaryEntitySync('salary', salaryId, 'update');

  await recordAuditLog({
    action: 'Confirmation de réception de salaire par l’agent',
    category: 'operations',
    severity: 'info',
    details: `${agentUser.displayName} a confirmé avoir reçu son salaire ${existing.reference} (${existing.paidAmount} ${existing.currency}) pour ${periodLabel}.`,
    actorName: agentUser.displayName || 'Agent',
    actorRole: agentUser.role,
    actorUid: agentUser.uid,
    metadata: {
      salaryId,
      reference: existing.reference,
      periodKey: existing.periodKey,
      amount: existing.paidAmount,
      currency: existing.currency,
      linkedOperationNumber: existing.linkedOperationNumber,
    },
  });

  return updated;
}

/* =========================================================
   7. RECLAMATIONS DE SALAIRE EN RETARD
   ========================================================= */

export async function submitSalaryDelayClaim(
  salaryId: string,
  reason: string,
  agentUser: AppUser
): Promise<LocalSalaryClaim> {
  const salary = await db.salaries.get(salaryId);
  if (!salary) throw new Error('Salaire concerné introuvable.');

  if (salary.agentId !== agentUser.uid) {
    throw new Error(
      'Violation RBAC : vous ne pouvez soumettre une réclamation que pour votre propre salaire.'
    );
  }

  if (
    salary.status === 'paye' ||
    salary.status === 'confirme' ||
    salary.status === 'couvert_par_avance'
  ) {
    throw new Error('Ce salaire est déjà réglé ou couvert par une avance.');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Veuillez préciser le motif de votre réclamation.');
  }

  const now = Date.now();
  const id = `clm-${now}-${Math.random().toString(36).substring(2, 7)}`;
  const reference = `REC-SAL-${salary.year}${String(salary.month).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const periodLabel = formatSalaryPeriodLabel(salary.month, salary.year);

  const evt = makeHistoryEvent(
    'Soumission d’une réclamation pour retard',
    `Réclamation ${reference} soumise par ${agentUser.displayName} : « ${reason.trim()} ».`,
    agentUser
  );

  const claim: LocalSalaryClaim = {
    id,
    reference,
    salaryId: salary.id,
    periodKey: salary.periodKey,
    year: salary.year,
    month: salary.month,
    agentId: salary.agentId,
    agentName: salary.agentName,
    agencyId: salary.agencyId,
    agencyName: salary.agencyName,
    amount: salary.plannedAmount,
    currency: salary.currency,
    reason: reason.trim(),
    status: 'reclamation_envoyee',
    dgResponse: null,
    handledByUid: null,
    handledByName: null,
    handledAt: null,
    history: [evt],
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.salaryClaims.put(claim);
  await enqueueSalaryEntitySync('salaryClaim', id, 'create');

  await db.salaries.update(salary.id, {
    status: 'reclame',
    history: [...salary.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  });
  await enqueueSalaryEntitySync('salary', salary.id, 'update');

  await createBroadcast(
    {
      title: `Réclamation salaire en retard — ${salary.agentName}`,
      message: `L'agent ${salary.agentName} a soumis une réclamation (${reference}) pour le salaire de ${periodLabel} (${salary.plannedAmount} ${salary.currency}).`,
      severity: 'important',
      scope: salary.agencyId ? 'agence' : 'global',
      agencyId: salary.agencyId,
      agencyName: salary.agencyName,
      requiresAck: false,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    agentUser
  );

  await recordAuditLog({
    action: 'Réclamation de salaire en retard',
    category: 'operations',
    severity: 'warning',
    details: `Réclamation ${reference} déposée par ${agentUser.displayName} pour ${periodLabel} (${salary.plannedAmount} ${salary.currency}).`,
    actorName: agentUser.displayName || 'Agent',
    actorRole: agentUser.role,
    actorUid: agentUser.uid,
    metadata: {
      claimId: id,
      reference,
      salaryId: salary.id,
      periodKey: salary.periodKey,
    },
  });

  return claim;
}

export async function processSalaryClaimByDg(
  claimId: string,
  nextStatus: SalaryClaimStatus,
  dgResponse: string,
  dgUser: AppUser
): Promise<LocalSalaryClaim> {
  if (
    dgUser.role !== 'directeur_general' &&
    dgUser.role !== 'administrateur_systeme'
  ) {
    throw new Error(
      'Violation RBAC : seul le Directeur Général peut statuer sur une réclamation salariale.'
    );
  }

  const existing = await db.salaryClaims.get(claimId);
  if (!existing) throw new Error('Réclamation introuvable.');

  const now = Date.now();
  const evt = makeHistoryEvent(
    `Traitement réclamation par DG (${nextStatus})`,
    `Réponse DG : « ${dgResponse.trim() || nextStatus} »`,
    dgUser
  );

  const updated: LocalSalaryClaim = {
    ...existing,
    status: nextStatus,
    dgResponse: dgResponse.trim() || null,
    handledByUid: dgUser.uid,
    handledByName: dgUser.displayName || 'Direction Générale',
    handledAt: now,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaryClaims.put(updated);
  await enqueueSalaryEntitySync('salaryClaim', claimId, 'update');

  await createBroadcast(
    {
      title: `Suivi réclamation salaire (${existing.reference})`,
      message: `Votre réclamation salariale pour ${formatSalaryPeriodLabel(existing.month, existing.year)} est passée au statut « ${nextStatus.replace(/_/g, ' ')} ». Réponse DG : ${dgResponse || 'En cours de règlement'}.`,
      severity: 'info',
      scope: existing.agencyId ? 'agence' : 'global',
      agencyId: existing.agencyId,
      agencyName: existing.agencyName,
      requiresAck: false,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    dgUser
  );

  await recordAuditLog({
    action: `Traitement réclamation salaire (${nextStatus})`,
    category: 'operations',
    severity: 'info',
    details: `Réclamation ${existing.reference} (${existing.agentName}) traitée par ${dgUser.displayName} -> ${nextStatus}.`,
    actorName: dgUser.displayName || 'DG',
    actorRole: dgUser.role,
    actorUid: dgUser.uid,
    metadata: {
      claimId,
      reference: existing.reference,
      status: nextStatus,
    },
  });

  return updated;
}

/* =========================================================
   8. DEMANDES D'AVANCE SUR SALAIRE (2 NIVEAUX DE CONTROLE)
   ========================================================= */

export interface SubmitSalaryAdvanceInput {
  requestedAmount: number;
  currency: 'USD' | 'CDF';
  requestedMonthsCount: number;
  requestedStartYear: number;
  requestedStartMonth: number;
  reason: string;
  writtenStatement: string;
  documentName: string;
  documentDataUrl: string;
  agencyName?: string;
}

export function computeConsecutivePeriods(
  agentId: string,
  startYear: number,
  startMonth: number,
  monthsCount: number,
  totalAmount: number
): CoveredSalaryPeriod[] {
  const safeCount = Math.max(1, Math.min(12, Math.floor(monthsCount)));
  const perMonth = Number((totalAmount / safeCount).toFixed(2));
  const periods: CoveredSalaryPeriod[] = [];

  for (let i = 0; i < safeCount; i++) {
    const totalMonths = startYear * 12 + (startMonth - 1) + i;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const allocated =
      i === safeCount - 1
        ? Number((totalAmount - perMonth * (safeCount - 1)).toFixed(2))
        : perMonth;
    periods.push({
      year: y,
      month: m,
      periodKey: buildSalaryPeriodKey(agentId, y, m),
      allocatedAmount: allocated,
    });
  }
  return periods;
}

export async function submitSalaryAdvanceRequest(
  input: SubmitSalaryAdvanceInput,
  agentUser: AppUser
): Promise<LocalSalaryAdvance> {
  // NIVEAU 1 : Vérification stricte de l'activation par le DG
  const settings = await getSalaryModuleSettings();
  if (!settings.advanceRequestsEnabled) {
    await recordAuditLog({
      action: 'Tentative bloquée de demande d’avance (fonctionnalité désactivée)',
      category: 'security',
      severity: 'security',
      details: `${agentUser.displayName} a tenté de soumettre une demande d'avance alors que la fonctionnalité est désactivée par le DG.`,
      actorName: agentUser.displayName || 'Agent',
      actorRole: agentUser.role,
      actorUid: agentUser.uid,
    });
    throw new Error(
      "Opération refusée : les demandes d'avance sur salaire sont actuellement désactivées par le Directeur Général."
    );
  }

  // Vérification obligatoire du document écrit de l'agent
  if (
    !input.documentName?.trim() ||
    !input.documentDataUrl?.trim() ||
    !input.writtenStatement?.trim()
  ) {
    throw new Error(
      "Document obligatoire manquant : toute demande d'avance doit impérativement comporter votre demande écrite signée et la pièce justificative jointe."
    );
  }

  if (input.requestedAmount <= 0) {
    throw new Error('Le montant demandé doit être supérieur à 0.');
  }

  const now = Date.now();
  const id = `adv-${now}-${Math.random().toString(36).substring(2, 8)}`;
  const reference = `AVA-SAL-${input.requestedStartYear}${String(input.requestedStartMonth).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const proposedPeriods = computeConsecutivePeriods(
    agentUser.uid,
    input.requestedStartYear,
    input.requestedStartMonth,
    input.requestedMonthsCount,
    input.requestedAmount
  );

  const evt = makeHistoryEvent(
    'Soumission de demande d’avance avec document écrit',
    `Demande de ${input.requestedAmount} ${input.currency} sur ${input.requestedMonthsCount} mois (document joint : ${input.documentName}).`,
    agentUser
  );

  const advance: LocalSalaryAdvance = {
    id,
    reference,
    agentId: agentUser.uid,
    agentName: agentUser.displayName || agentUser.email || 'Agent',
    agentFunction: agentUser.function || 'guichetier',
    agencyId: agentUser.agencyId || null,
    agencyName: input.agencyName || agentUser.agencyId || 'Agence Locale',
    requestedAmount: Number(input.requestedAmount),
    approvedAmount: null,
    currency: input.currency,
    requestedMonthsCount: Math.max(1, Math.floor(input.requestedMonthsCount)),
    approvedMonthsCount: null,
    requestedStartYear: input.requestedStartYear,
    requestedStartMonth: input.requestedStartMonth,
    coveredPeriods: proposedPeriods,
    reason: input.reason.trim(),
    writtenStatement: input.writtenStatement.trim(),
    documentName: input.documentName.trim(),
    documentDataUrl: input.documentDataUrl,
    status: 'soumise',
    dgDecision: 'en_attente',
    dgDecisionByUid: null,
    dgDecisionByName: null,
    dgDecisionAt: null,
    dgConditionsOrReason: null,
    designatedPayerType: null,
    designatedPayerId: null,
    designatedPayerName: null,
    designatedPayerService: null,
    paidByUid: null,
    paidByName: null,
    paidAt: null,
    linkedOperationId: null,
    linkedOperationNumber: null,
    confirmedByAgent: false,
    confirmedAt: null,
    history: [evt],
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.salaryAdvances.put(advance);
  await enqueueSalaryEntitySync('salaryAdvance', id, 'create');

  await createBroadcast(
    {
      title: `Nouvelle demande d'avance sur salaire (${reference})`,
      message: `${advance.agentName} a soumis une demande d'avance de ${advance.requestedAmount} ${advance.currency} sur ${advance.requestedMonthsCount} mois avec document écrit joint.`,
      severity: 'important',
      scope: advance.agencyId ? 'agence' : 'global',
      agencyId: advance.agencyId,
      agencyName: advance.agencyName,
      requiresAck: false,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    agentUser
  );

  await recordAuditLog({
    action: 'Demande d’avance sur salaire soumise',
    category: 'operations',
    severity: 'info',
    details: `Demande d'avance ${reference} soumise par ${advance.agentName} (${advance.requestedAmount} ${advance.currency}, ${advance.requestedMonthsCount} mois, document : ${advance.documentName}).`,
    actorName: advance.agentName,
    actorRole: agentUser.role,
    actorUid: agentUser.uid,
    metadata: {
      advanceId: id,
      reference,
      requestedAmount: advance.requestedAmount,
      currency: advance.currency,
      requestedMonthsCount: advance.requestedMonthsCount,
      documentName: advance.documentName,
    },
  });

  return advance;
}

export interface DgAdvanceDecisionInput {
  decision: 'acceptee' | 'refusee';
  approvedAmount?: number;
  approvedMonthsCount?: number;
  startYear?: number;
  startMonth?: number;
  conditionsOrReason: string;
  designatedPayerType?: 'user' | 'service';
  designatedPayerId?: string | null;
  designatedPayerName?: string | null;
  designatedPayerService?: string | null;
}

export async function decideSalaryAdvanceByDg(
  advanceId: string,
  decisionInput: DgAdvanceDecisionInput,
  dgUser: AppUser
): Promise<LocalSalaryAdvance> {
  if (
    dgUser.role !== 'directeur_general' &&
    dgUser.role !== 'administrateur_systeme'
  ) {
    throw new Error(
      'Violation RBAC : seul le Directeur Général peut approuver ou refuser une demande d’avance.'
    );
  }

  const existing = await db.salaryAdvances.get(advanceId);
  if (!existing) throw new Error("Demande d'avance introuvable.");

  if (existing.agentId === dgUser.uid && dgUser.role !== 'administrateur_systeme') {
    throw new Error('Sécurité : nul ne peut auto-approuver sa propre demande d’avance.');
  }

  const now = Date.now();

  if (decisionInput.decision === 'refusee') {
    const evt = makeHistoryEvent(
      'Refus de la demande d’avance par le DG',
      `Demande refusée par ${dgUser.displayName}. Motif : ${decisionInput.conditionsOrReason || 'Non conforme aux critères de trésorerie'}.`,
      dgUser
    );

    const refused: LocalSalaryAdvance = {
      ...existing,
      status: 'refusee',
      dgDecision: 'refusee',
      dgDecisionByUid: dgUser.uid,
      dgDecisionByName: dgUser.displayName || 'Direction Générale',
      dgDecisionAt: now,
      dgConditionsOrReason: decisionInput.conditionsOrReason.trim(),
      history: [...existing.history, evt],
      syncStatus: 'pending',
      updatedAt: now,
    };

    await db.salaryAdvances.put(refused);
    await enqueueSalaryEntitySync('salaryAdvance', advanceId, 'update');

    await createBroadcast(
      {
        title: `Décision DG — Avance ${existing.reference} refusée`,
        message: `Votre demande d'avance ${existing.reference} a été refusée par la Direction Générale. Motif : ${refused.dgConditionsOrReason}.`,
        severity: 'info',
        scope: existing.agencyId ? 'agence' : 'global',
        agencyId: existing.agencyId,
        agencyName: existing.agencyName,
        requiresAck: false,
        requiresReadConfirmation: true,
        blockingUntilAck: false,
      },
      dgUser
    );

    await recordAuditLog({
      action: 'Refus de demande d’avance sur salaire par le DG',
      category: 'operations',
      severity: 'warning',
      details: `Avance ${existing.reference} (${existing.agentName}) refusée par ${dgUser.displayName}. Motif : ${refused.dgConditionsOrReason}.`,
      actorName: dgUser.displayName || 'DG',
      actorRole: dgUser.role,
      actorUid: dgUser.uid,
      metadata: { advanceId, reference: existing.reference, decision: 'refusee' },
    });

    return refused;
  }

  // Approbation par le DG + Calcul explicite des périodes couvertes
  const finalAmount = Number(
    decisionInput.approvedAmount || existing.requestedAmount
  );
  const finalMonths = Math.max(
    1,
    Math.floor(decisionInput.approvedMonthsCount || existing.requestedMonthsCount)
  );
  const startY = decisionInput.startYear || existing.requestedStartYear;
  const startM = decisionInput.startMonth || existing.requestedStartMonth;

  const coveredPeriods = computeConsecutivePeriods(
    existing.agentId,
    startY,
    startM,
    finalMonths,
    finalAmount
  );

  // Vérifier qu'aucune des périodes couvertes n'est déjà payée normalement
  for (const cp of coveredPeriods) {
    const sal = await db.salaries.where('periodKey').equals(cp.periodKey).first();
    if (sal && (sal.status === 'paye' || sal.status === 'confirme')) {
      throw new Error(
        `Conflit de période : le mois de ${formatSalaryPeriodLabel(cp.month, cp.year)} a déjà été payé normalement à ${existing.agentName}.`
      );
    }
  }

  const periodsLabels = coveredPeriods
    .map((p) => formatSalaryPeriodLabel(p.month, p.year))
    .join(', ');

  const evt = makeHistoryEvent(
    'Approbation & Autorisation d’avance par le DG',
    `Avance accordée : ${finalAmount} ${existing.currency} couvrant ${finalMonths} mois (${periodsLabels}). Conditions : ${decisionInput.conditionsOrReason || 'Standard'}.`,
    dgUser
  );

  const approved: LocalSalaryAdvance = {
    ...existing,
    approvedAmount: finalAmount,
    approvedMonthsCount: finalMonths,
    coveredPeriods,
    status: 'autorisee_au_paiement',
    dgDecision: 'acceptee',
    dgDecisionByUid: dgUser.uid,
    dgDecisionByName: dgUser.displayName || 'Direction Générale',
    dgDecisionAt: now,
    dgConditionsOrReason: decisionInput.conditionsOrReason.trim(),
    designatedPayerType: decisionInput.designatedPayerType || 'service',
    designatedPayerId: decisionInput.designatedPayerId || null,
    designatedPayerName: decisionInput.designatedPayerName || null,
    designatedPayerService:
      decisionInput.designatedPayerService || 'guichetier',
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaryAdvances.put(approved);
  await enqueueSalaryEntitySync('salaryAdvance', advanceId, 'update');

  // Marquer explicitement chaque période couverte dans la table salaries ("couvert_par_avance")
  for (const cp of coveredPeriods) {
    const existingSal = await db.salaries
      .where('periodKey')
      .equals(cp.periodKey)
      .first();
    const covEvt = makeHistoryEvent(
      'Période couverte par avance sur salaire',
      `Mois couvert par l'avance ${existing.reference} (${cp.allocatedAmount} ${existing.currency}) accordée par ${dgUser.displayName}.`,
      dgUser
    );

    if (existingSal) {
      await db.salaries.update(existingSal.id, {
        paymentCategory: 'couvert_par_avance',
        status: 'couvert_par_avance',
        coveredByAdvanceId: existing.id,
        coveredByAdvanceRef: existing.reference,
        paidAmount: cp.allocatedAmount,
        history: [...existingSal.history, covEvt],
        syncStatus: 'pending',
        updatedAt: now,
      });
      await enqueueSalaryEntitySync('salary', existingSal.id, 'update');
    } else {
      const salId = `sal-cov-${now}-${cp.year}${cp.month}-${Math.random().toString(36).substring(2, 6)}`;
      const newSal: LocalSalaryRecord = {
        id: salId,
        periodKey: cp.periodKey,
        reference: `SAL-AVA-${cp.year}${String(cp.month).padStart(2, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
        paymentCategory: 'couvert_par_avance',
        agentId: existing.agentId,
        agentName: existing.agentName,
        agentFunction: existing.agentFunction,
        agencyId: existing.agencyId,
        agencyName: existing.agencyName,
        year: cp.year,
        month: cp.month,
        plannedAmount: cp.allocatedAmount,
        paidAmount: cp.allocatedAmount,
        currency: existing.currency,
        status: 'couvert_par_avance',
        authorizedByUid: dgUser.uid,
        authorizedByName: dgUser.displayName || 'Direction Générale',
        authorizedAt: now,
        coveredByAdvanceId: existing.id,
        coveredByAdvanceRef: existing.reference,
        confirmedByAgent: false,
        dueDate: new Date(cp.year, cp.month, 5, 23, 59, 59).getTime(),
        history: [covEvt],
        createdBy: dgUser.uid,
        createdByName: dgUser.displayName || 'Direction Générale',
        syncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await db.salaries.put(newSal);
      await enqueueSalaryEntitySync('salary', salId, 'create');
    }
  }

  await createBroadcast(
    {
      title: `Avance sur salaire acceptée (${existing.reference})`,
      message: `La Direction Générale a approuvé l'avance de ${finalAmount} ${existing.currency} pour ${existing.agentName} couvrant : ${periodsLabels}.`,
      severity: 'important',
      scope: existing.agencyId ? 'agence' : 'global',
      agencyId: existing.agencyId,
      agencyName: existing.agencyName,
      requiresAck: true,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    dgUser
  );

  await recordAuditLog({
    action: 'Approbation d’avance sur salaire & verrouillage des périodes couvertes',
    category: 'operations',
    severity: 'security',
    details: `Avance ${existing.reference} (${existing.agentName}) approuvée par ${dgUser.displayName} : ${finalAmount} ${existing.currency} sur ${finalMonths} mois (${periodsLabels}).`,
    actorName: dgUser.displayName || 'DG',
    actorRole: dgUser.role,
    actorUid: dgUser.uid,
    metadata: {
      advanceId,
      reference: existing.reference,
      approvedAmount: finalAmount,
      approvedMonthsCount: finalMonths,
      coveredPeriods,
    },
  });

  return approved;
}

export async function executeSalaryAdvancePayment(
  advanceId: string,
  payerUser: AppUser
): Promise<LocalSalaryAdvance> {
  const existing = await db.salaryAdvances.get(advanceId);
  if (!existing) throw new Error("Demande d'avance introuvable.");

  if (
    existing.dgDecision !== 'acceptee' ||
    (existing.status !== 'approuvee' && existing.status !== 'autorisee_au_paiement')
  ) {
    throw new Error(
      "Cette avance ne peut pas être payée car elle n'est pas autorisée au paiement par le DG."
    );
  }

  if (!isUserDesignatedPayerForSalary(payerUser, existing)) {
    throw new Error(
      "Violation RBAC : vous n'êtes pas le payeur désigné pour décaisser cette avance."
    );
  }

  const amountToPay = existing.approvedAmount || existing.requestedAmount;
  const periodsLabels = existing.coveredPeriods
    .map((p) => formatSalaryPeriodLabel(p.month, p.year))
    .join(', ');

  const finOp = await createOperation({
    type: 'paiement',
    title: `Paiement Avance sur Salaire (${existing.reference}) — ${existing.agentName}`,
    description: `Décaissement avance sur salaire couvrant : ${periodsLabels}. Autorisé par ${existing.dgDecisionByName}.`,
    priority: 'urgent',
    agencyId: existing.agencyId || payerUser.agencyId || 'CENTRALE',
    agencyName: existing.agencyName || 'Agence Centrale',
    assignedAgentIds: [existing.agentId],
    assignedAgentNames: [existing.agentName],
    createdBy: payerUser.uid,
    createdByName: payerUser.displayName || 'Payeur',
    amount: amountToPay,
    currency: existing.currency,
    comments: `Avance ${existing.reference}`,
  });
  await updateOperationStatus(finOp.id, 'termine');

  const now = Date.now();
  const evt = makeHistoryEvent(
    'Paiement effectif de l’avance sur salaire',
    `Avance de ${amountToPay} ${existing.currency} versée par ${payerUser.displayName} (Opération ${finOp.operationNumber}).`,
    payerUser
  );

  const updated: LocalSalaryAdvance = {
    ...existing,
    status: 'payee',
    paidByUid: payerUser.uid,
    paidByName: payerUser.displayName || 'Payeur',
    paidAt: now,
    linkedOperationId: finOp.id,
    linkedOperationNumber: finOp.operationNumber,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaryAdvances.put(updated);
  await enqueueSalaryEntitySync('salaryAdvance', advanceId, 'update');

  await createBroadcast(
    {
      title: `Avance sur salaire décaissée (${existing.reference})`,
      message: `Votre avance de ${amountToPay} ${existing.currency} a été payée par ${payerUser.displayName} (Opération ${finOp.operationNumber}). Veuillez confirmer la réception.`,
      severity: 'important',
      scope: existing.agencyId ? 'agence' : 'global',
      agencyId: existing.agencyId,
      agencyName: existing.agencyName,
      requiresAck: true,
      requiresReadConfirmation: true,
      blockingUntilAck: false,
    },
    payerUser
  );

  await recordAuditLog({
    action: 'Paiement d’une avance sur salaire',
    category: 'operations',
    severity: 'security',
    details: `Avance ${existing.reference} (${existing.agentName}) de ${amountToPay} ${existing.currency} payée par ${payerUser.displayName} (Opération ${finOp.operationNumber}).`,
    actorName: payerUser.displayName || 'Payeur',
    actorRole: payerUser.role,
    actorUid: payerUser.uid,
    metadata: {
      advanceId,
      reference: existing.reference,
      amount: amountToPay,
      linkedOperationNumber: finOp.operationNumber,
    },
  });

  return updated;
}

export async function confirmSalaryAdvanceReceiptByAgent(
  advanceId: string,
  agentUser: AppUser
): Promise<LocalSalaryAdvance> {
  const existing = await db.salaryAdvances.get(advanceId);
  if (!existing) throw new Error("Avance introuvable.");

  if (existing.agentId !== agentUser.uid) {
    throw new Error(
      'Violation RBAC : seul l’agent bénéficiaire peut confirmer la réception de son avance.'
    );
  }

  if (existing.status !== 'payee') {
    throw new Error(
      "L'avance doit d'abord être payée par le payeur autorisé avant de pouvoir être confirmée."
    );
  }

  const now = Date.now();
  const evt = makeHistoryEvent(
    'Confirmation de réception de l’avance par l’agent',
    `L'agent ${agentUser.displayName} confirme avoir reçu l'avance ${existing.reference} (${existing.approvedAmount || existing.requestedAmount} ${existing.currency}).`,
    agentUser
  );

  const updated: LocalSalaryAdvance = {
    ...existing,
    status: 'confirmee',
    confirmedByAgent: true,
    confirmedAt: now,
    history: [...existing.history, evt],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.salaryAdvances.put(updated);
  await enqueueSalaryEntitySync('salaryAdvance', advanceId, 'update');

  // Mettre à jour les périodes couvertes pour indiquer que l'avance a été confirmée par l'agent
  for (const cp of existing.coveredPeriods) {
    const sal = await db.salaries.where('periodKey').equals(cp.periodKey).first();
    if (sal) {
      await db.salaries.update(sal.id, {
        confirmedByAgent: true,
        confirmedAt: now,
        confirmationNote: `Couvert et confirmé via l'avance ${existing.reference}`,
        syncStatus: 'pending',
        updatedAt: now,
      });
      await enqueueSalaryEntitySync('salary', sal.id, 'update');
    }
  }

  await recordAuditLog({
    action: 'Confirmation de réception d’avance sur salaire par l’agent',
    category: 'operations',
    severity: 'info',
    details: `${agentUser.displayName} a confirmé la réception de l'avance ${existing.reference}.`,
    actorName: agentUser.displayName || 'Agent',
    actorRole: agentUser.role,
    actorUid: agentUser.uid,
    metadata: { advanceId, reference: existing.reference },
  });

  return updated;
}
