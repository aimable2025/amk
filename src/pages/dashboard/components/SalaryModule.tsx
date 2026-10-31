import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Eye,
  FileCheck2,
  FileText,
  History,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  LocalSalaryAdvance,
  LocalSalaryClaim,
  LocalSalaryRecord,
  SalaryClaimStatus,
} from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import {
  authorizeSalaryAndDesignatePayer,
  confirmSalaryAdvanceReceiptByAgent,
  confirmSalaryReceiptByAgent,
  decideSalaryAdvanceByDg,
  defineOrUpdateSalaryForPeriod,
  executeAuthorizedSalaryPayment,
  executeSalaryAdvancePayment,
  formatSalaryPeriodLabel,
  getAuthorizedSalaries,
  getAuthorizedSalaryAdvances,
  getAuthorizedSalaryClaims,
  getSalaryModuleSettings,
  isUserDesignatedPayerForSalary,
  MONTH_NAMES_FR,
  processSalaryClaimByDg,
  setSalaryAdvancesAvailability,
  submitSalaryAdvanceRequest,
  submitSalaryDelayClaim,
  type SalaryModuleSettings,
} from '../../../services/SalaryService';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import { verifyBiometricIdentity } from '../../../services/BiometricAuthService';

interface SalaryModuleProps {
  mode?: 'dg' | 'agent' | 'payer';
  onClose?: () => void;
}

type DgTab =
  | 'overview'
  | 'define'
  | 'claims'
  | 'advances'
  | 'payer_desk'
  | 'history';

type AgentTab =
  | 'my_salaries'
  | 'my_claims'
  | 'my_advances'
  | 'payer_desk';

export default function SalaryModule({ mode, onClose }: SalaryModuleProps) {
  const { user } = useAuth();
  const isDgOrSys =
    user?.role === 'directeur_general' || user?.role === 'administrateur_systeme';

  const effectiveMode = mode || (isDgOrSys ? 'dg' : 'agent');

  const [salaries, setSalaries] = useState<LocalSalaryRecord[]>([]);
  const [claims, setClaims] = useState<LocalSalaryClaim[]>([]);
  const [advances, setAdvances] = useState<LocalSalaryAdvance[]>([]);
  const [settings, setSettings] = useState<SalaryModuleSettings>({
    advanceRequestsEnabled: false,
    updatedAt: Date.now(),
  });
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Onglets
  const [dgTab, setDgTab] = useState<DgTab>('overview');
  const [agentTab, setAgentTab] = useState<AgentTab>('my_salaries');

  // Filtres DG
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [selectedHistorySalary, setSelectedHistorySalary] =
    useState<LocalSalaryRecord | null>(null);

  // Formulaire DG : Définition de salaire par période
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedAgentUid, setSelectedAgentUid] = useState<string>('');
  const [periodYear, setPeriodYear] = useState<number>(currentYear);
  const [periodMonth, setPeriodMonth] = useState<number>(currentMonth);
  const [plannedAmount, setPlannedAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [dueDateStr, setDueDateStr] = useState<string>(
    new Date(currentYear, currentMonth - 1, 28).toISOString().slice(0, 10)
  );

  // Modal DG : Autorisation & Désignation du payeur
  const [authorizingSalary, setAuthorizingSalary] =
    useState<LocalSalaryRecord | null>(null);
  const [payerType, setPayerType] = useState<'service' | 'user'>('service');
  const [payerService, setPayerService] = useState<string>('guichetier');
  const [payerUserId, setPayerUserId] = useState<string>('');

  // Modal DG : Traitement d'une réclamation
  const [processingClaim, setProcessingClaim] =
    useState<LocalSalaryClaim | null>(null);
  const [claimNextStatus, setClaimNextStatus] =
    useState<SalaryClaimStatus>('en_examen');
  const [claimDgResponse, setClaimDgResponse] = useState<string>('');

  // Modal DG : Examen & Décision sur une demande d'avance
  const [examiningAdvance, setExaminingAdvance] =
    useState<LocalSalaryAdvance | null>(null);
  const [advDecision, setAdvDecision] = useState<'acceptee' | 'refusee'>('acceptee');
  const [advApprovedAmount, setAdvApprovedAmount] = useState<string>('');
  const [advApprovedMonths, setAdvApprovedMonths] = useState<number>(1);
  const [advStartYear, setAdvStartYear] = useState<number>(currentYear);
  const [advStartMonth, setAdvStartMonth] = useState<number>(currentMonth);
  const [advConditions, setAdvConditions] = useState<string>('');
  const [advPayerType, setAdvPayerType] = useState<'service' | 'user'>('service');
  const [advPayerService, setAdvPayerService] = useState<string>('guichetier');
  const [advPayerUserId, setAdvPayerUserId] = useState<string>('');

  // Formulaire Agent : Réclamation de salaire en retard
  const [claimingSalary, setClaimingSalary] =
    useState<LocalSalaryRecord | null>(null);
  const [claimReason, setClaimReason] = useState<string>('');

  // Formulaire Agent : Demande d'avance sur salaire + Document écrit obligatoire
  const [reqAdvAmount, setReqAdvAmount] = useState<string>('');
  const [reqAdvCurrency, setReqAdvCurrency] = useState<'USD' | 'CDF'>('USD');
  const [reqAdvMonths, setReqAdvMonths] = useState<number>(1);
  const [reqAdvStartYear, setReqAdvStartYear] = useState<number>(currentYear);
  const [reqAdvStartMonth, setReqAdvStartMonth] = useState<number>(currentMonth);
  const [reqAdvReason, setReqAdvReason] = useState<string>('');
  const [reqAdvWrittenStatement, setReqAdvWrittenStatement] = useState<string>('');
  const [reqAdvDocName, setReqAdvDocName] = useState<string>('');
  const [reqAdvDocDataUrl, setReqAdvDocDataUrl] = useState<string>('');

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [salList, clmList, advList, modSettings, allUsers, allAgencies] =
        await Promise.all([
          getAuthorizedSalaries(user),
          getAuthorizedSalaryClaims(user),
          getAuthorizedSalaryAdvances(user),
          getSalaryModuleSettings(),
          getAllSystemUsers(),
          getAgencies(),
        ]);
      setSalaries(salList);
      setClaims(clmList);
      setAdvances(advList);
      setSettings(modSettings);
      setUsersList(allUsers);
      setAgencies(allAgencies);
    } catch (err) {
      console.warn('[Ets AMANI] Chargement module Salaire :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [user?.uid, user?.agencyId]);

  const agentsList = useMemo(() => {
    return usersList.filter((u) => u.role === 'agent' && u.status === 'active');
  }, [usersList]);

  // Mes salaires personnels (pour l'Agent)
  const myPersonalSalaries = useMemo(() => {
    if (!user) return [];
    return salaries.filter((s) => s.agentId === user.uid);
  }, [salaries, user]);

  // Paiements assignés au payeur connecté (Salaires normaux + Avances autorisées)
  const assignedSalariesToPay = useMemo(() => {
    if (!user) return [];
    return salaries.filter(
      (s) =>
        (s.status === 'autorise' ||
          s.status === 'en_attente_de_paiement' ||
          s.status === 'en_retard' ||
          s.status === 'reclame') &&
        Boolean(s.authorizedByUid) &&
        isUserDesignatedPayerForSalary(user, s)
    );
  }, [salaries, user]);

  const assignedAdvancesToPay = useMemo(() => {
    if (!user) return [];
    return advances.filter(
      (a) =>
        a.dgDecision === 'acceptee' &&
        (a.status === 'approuvee' || a.status === 'autorisee_au_paiement') &&
        isUserDesignatedPayerForSalary(user, a)
    );
  }, [advances, user]);

  // Statistiques DG
  const dgStats = useMemo(() => {
    const toPay = salaries.filter(
      (s) => s.status === 'a_payer' || s.status === 'autorise' || s.status === 'en_attente_de_paiement'
    ).length;
    const paidUnconfirmed = salaries.filter((s) => s.status === 'paye').length;
    const confirmed = salaries.filter((s) => s.status === 'confirme').length;
    const lateOrClaimed = salaries.filter(
      (s) => s.status === 'en_retard' || s.status === 'reclame'
    ).length;
    const coveredByAdvance = salaries.filter(
      (s) => s.status === 'couvert_par_avance'
    ).length;
    const pendingClaims = claims.filter(
      (c) => c.status === 'reclamation_envoyee' || c.status === 'en_examen'
    ).length;
    const pendingAdvances = advances.filter(
      (a) => a.dgDecision === 'en_attente'
    ).length;
    return {
      toPay,
      paidUnconfirmed,
      confirmed,
      lateOrClaimed,
      coveredByAdvance,
      pendingClaims,
      pendingAdvances,
    };
  }, [salaries, claims, advances]);

  const filteredSalaries = useMemo(() => {
    return salaries.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (agencyFilter !== 'all' && s.agencyId !== agencyFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.agentName.toLowerCase().includes(q) ||
        s.reference.toLowerCase().includes(q) ||
        s.agencyName.toLowerCase().includes(q) ||
        formatSalaryPeriodLabel(s.month, s.year).toLowerCase().includes(q)
      );
    });
  }, [salaries, statusFilter, agencyFilter, search]);

  const resolveAgencyName = (agId?: string | null): string => {
    if (!agId) return 'Agence Centrale';
    const found = agencies.find((a) => a.id === agId);
    return found ? `${found.name} (${found.code})` : agId;
  };

  /* =========================================================
     ACTIONS DIRECTEUR GENERAL
     ========================================================= */

  const handleToggleAdvances = async () => {
    if (!user || !isDgOrSys) return;
    setErrorMsg(null);
    try {
      const next = await setSalaryAdvancesAvailability(
        !settings.advanceRequestsEnabled,
        user
      );
      setSettings(next);
      setFeedback(
        next.advanceRequestsEnabled
          ? "Demandes d'avance sur salaire ACTIVÉES pour les agents (Audité)."
          : "Demandes d'avance sur salaire DÉSACTIVÉES et verrouillées côté Agent (Audité)."
      );
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de configuration.');
    }
  };

  const handleDefineSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    try {
      const targetAgent = usersList.find((u) => u.uid === selectedAgentUid);
      if (!targetAgent) {
        throw new Error('Veuillez sélectionner un agent valide.');
      }
      const record = await defineOrUpdateSalaryForPeriod(
        {
          agentId: targetAgent.uid,
          agentName: targetAgent.displayName,
          agentFunction: targetAgent.function || 'guichetier',
          agencyId: targetAgent.agencyId || null,
          agencyName: resolveAgencyName(targetAgent.agencyId),
          year: Number(periodYear),
          month: Number(periodMonth),
          plannedAmount: Number(plannedAmount),
          currency,
          dueDate: dueDateStr ? new Date(dueDateStr + 'T23:59:59').getTime() : undefined,
        },
        user
      );
      setPlannedAmount('');
      setDgTab('overview');
      setFeedback(
        `Salaire ${record.reference} défini pour ${record.agentName} (${formatSalaryPeriodLabel(record.month, record.year)}) : ${record.plannedAmount} ${record.currency}.`
      );
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la définition.');
    }
  };

  const handleAuthorizeSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !authorizingSalary) return;
    setErrorMsg(null);
    try {
      const selectedPayer = usersList.find((u) => u.uid === payerUserId);
      await authorizeSalaryAndDesignatePayer(
        authorizingSalary.id,
        {
          designatedPayerType: payerType,
          designatedPayerId: payerType === 'user' ? payerUserId : null,
          designatedPayerName:
            payerType === 'user' ? selectedPayer?.displayName || null : null,
          designatedPayerService: payerType === 'service' ? payerService : null,
        },
        user
      );
      setAuthorizingSalary(null);
      setFeedback('Paiement autorisé et payeur désigné avec succès.');
      setTimeout(() => setFeedback(null), 3500);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur d’autorisation.');
    }
  };

  const handleProcessClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !processingClaim) return;
    setErrorMsg(null);
    try {
      await processSalaryClaimByDg(
        processingClaim.id,
        claimNextStatus,
        claimDgResponse,
        user
      );
      setProcessingClaim(null);
      setClaimDgResponse('');
      setFeedback('Réclamation traitée et réponse transmise à l’agent.');
      setTimeout(() => setFeedback(null), 3500);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur traitement réclamation.');
    }
  };

  const handleDecideAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !examiningAdvance) return;
    setErrorMsg(null);
    try {
      const selectedPayer = usersList.find((u) => u.uid === advPayerUserId);
      await decideSalaryAdvanceByDg(
        examiningAdvance.id,
        {
          decision: advDecision,
          approvedAmount: Number(
            advApprovedAmount || examiningAdvance.requestedAmount
          ),
          approvedMonthsCount: Number(advApprovedMonths),
          startYear: Number(advStartYear),
          startMonth: Number(advStartMonth),
          conditionsOrReason: advConditions,
          designatedPayerType: advPayerType,
          designatedPayerId: advPayerType === 'user' ? advPayerUserId : null,
          designatedPayerName:
            advPayerType === 'user' ? selectedPayer?.displayName || null : null,
          designatedPayerService:
            advPayerType === 'service' ? advPayerService : null,
        },
        user
      );
      setExaminingAdvance(null);
      setAdvConditions('');
      setFeedback(
        advDecision === 'acceptee'
          ? 'Avance approuvée, périodes couvertes verrouillées et paiement autorisé.'
          : 'Demande d’avance refusée et notifiée à l’agent.'
      );
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur décision avance.');
    }
  };

  /* =========================================================
     ACTIONS PAYEUR AUTORISE & AGENT
     ========================================================= */

  const handleExecuteSalaryPayment = async (sal: LocalSalaryRecord) => {
    if (!user) return;
    setErrorMsg(null);
    try {
      // Vérification biométrique pour autoriser le décaissement de salaire
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Décaissement Salaire Agent',
        actionDescription: `Autorisation de décaissement de ${sal.plannedAmount} ${sal.currency} pour l'agent ${sal.agentName}`,
      });

      await executeAuthorizedSalaryPayment(sal.id, user);
      setFeedback(
        `Paiement de ${sal.plannedAmount} ${sal.currency} pour ${sal.agentName} enregistré en trésorerie. En attente de confirmation par l'agent.`
      );
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur paiement salaire.');
    }
  };

  const handleExecuteAdvancePayment = async (adv: LocalSalaryAdvance) => {
    if (!user) return;
    setErrorMsg(null);
    try {
      // Vérification biométrique pour décaissement d'avance
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Décaissement Avance sur Salaire',
        actionDescription: `Décaissement de l'avance ${adv.reference} (${adv.approvedAmount || adv.requestedAmount} ${adv.currency}) pour ${adv.agentName}`,
      });

      await executeSalaryAdvancePayment(adv.id, user);
      setFeedback(
        `Avance ${adv.reference} décaissée avec succès. En attente de confirmation par l'agent.`
      );
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur paiement avance.');
    }
  };

  const handleConfirmReceiptByAgent = async (sal: LocalSalaryRecord) => {
    if (!user) return;
    setErrorMsg(null);
    try {
      // Signature biométrique de l'agent attestant la réception effective des fonds
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Attestation de Réception Salaire',
        actionDescription: `Signature d'accusé de réception pour le salaire de ${formatSalaryPeriodLabel(sal.month, sal.year)}`,
      });

      await confirmSalaryReceiptByAgent(
        sal.id,
        user,
        `J'ai reçu mon salaire pour le mois de ${formatSalaryPeriodLabel(sal.month, sal.year)}.`
      );
      setFeedback(
        `Confirmation enregistrée : « J'ai reçu mon salaire pour le mois de ${formatSalaryPeriodLabel(sal.month, sal.year)}. »`
      );
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de confirmation.');
    }
  };

  const handleConfirmAdvanceByAgent = async (adv: LocalSalaryAdvance) => {
    if (!user) return;
    setErrorMsg(null);
    try {
      await confirmSalaryAdvanceReceiptByAgent(adv.id, user);
      setFeedback(`Réception de l'avance ${adv.reference} confirmée avec succès.`);
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de confirmation.');
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !claimingSalary) return;
    setErrorMsg(null);
    try {
      const created = await submitSalaryDelayClaim(
        claimingSalary.id,
        claimReason,
        user
      );
      setClaimingSalary(null);
      setClaimReason('');
      setFeedback(`Réclamation ${created.reference} transmise à la Direction Générale.`);
      setTimeout(() => setFeedback(null), 4000);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur envoi réclamation.');
    }
  };

  const handleAdvanceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReqAdvDocName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReqAdvDocDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitAdvanceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    try {
      // Si l'agent a rédigé sa lettre écrite et n'a pas importé de fichier externe, générer un document écrit officiel traçable
      let finalDocName = reqAdvDocName.trim();
      let finalDocDataUrl = reqAdvDocDataUrl.trim();
      if (!finalDocName && reqAdvWrittenStatement.trim()) {
        finalDocName = `Demande-Ecrite-Avance-${user.displayName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.txt`;
        finalDocDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(
          `DEMANDE ÉCRITE D'AVANCE SUR SALAIRE — ETS AMANI\nAgent : ${user.displayName}\nDate : ${new Date().toLocaleString('fr-FR')}\nMontant demandé : ${reqAdvAmount} ${reqAdvCurrency} (${reqAdvMonths} mois)\nMotif : ${reqAdvReason}\n\nEngagement écrit de l'agent :\n${reqAdvWrittenStatement}`
        )}`;
      }

      const created = await submitSalaryAdvanceRequest(
        {
          requestedAmount: Number(reqAdvAmount),
          currency: reqAdvCurrency,
          requestedMonthsCount: Number(reqAdvMonths),
          requestedStartYear: Number(reqAdvStartYear),
          requestedStartMonth: Number(reqAdvStartMonth),
          reason: reqAdvReason,
          writtenStatement: reqAdvWrittenStatement,
          documentName: finalDocName,
          documentDataUrl: finalDocDataUrl,
          agencyName: resolveAgencyName(user.agencyId),
        },
        user
      );

      setReqAdvAmount('');
      setReqAdvReason('');
      setReqAdvWrittenStatement('');
      setReqAdvDocName('');
      setReqAdvDocDataUrl('');
      setFeedback(
        `Demande d'avance ${created.reference} soumise avec votre document écrit pour examen par le Directeur Général.`
      );
      setTimeout(() => setFeedback(null), 4500);
      await loadAll();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Demande refusée.');
    }
  };

  const statusBadge = (status: LocalSalaryRecord['status']) => {
    switch (status) {
      case 'confirme':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Payé & Confirmé par l'agent
          </span>
        );
      case 'paye':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
            <Clock className="h-3 w-3" /> Payé (Attente confirmation agent)
          </span>
        );
      case 'en_attente_de_paiement':
      case 'autorise':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
            Autorisé au paiement
          </span>
        );
      case 'couvert_par_avance':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
            Couvert par Avance
          </span>
        );
      case 'en_retard':
      case 'reclame':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800">
            <AlertTriangle className="h-3 w-3" />{' '}
            {status === 'reclame' ? 'Réclamé (En retard)' : 'En retard'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
            À payer
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* EN-TÊTE PRINCIPAL DU MODULE SALAIRE */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <img
              src="/logo.png"
              alt="Ets AMANI"
              className="h-12 w-12 shrink-0 object-contain rounded-2xl border border-slate-200 bg-white p-1 shadow-xs"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  {effectiveMode === 'dg'
                    ? 'Gestion des Salaires Mensuels, Avances & Réclamations (DG)'
                    : 'Mon Salaire, Confirmations & Demandes d’Avance'}
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  Traçabilité & Audit Actifs
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {effectiveMode === 'dg'
                  ? 'Autorité décisionnelle Direction Générale : fixation par période, autorisation, désignation du payeur, réclamations et contrôle des avances.'
                  : 'Consultez votre salaire par période, confirmez la réception effective de votre paie et suivez vos demandes.'}
              </p>
            </div>
          </div>

          {/* Contrôle critique DG : ACTIVER / DÉSACTIVER les demandes d'avance */}
          <div className="flex flex-wrap items-center gap-3">
            {isDgOrSys && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Demandes d'avance Agents
                  </span>
                  <span
                    className={`text-xs font-black ${
                      settings.advanceRequestsEnabled
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {settings.advanceRequestsEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAdvances}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    settings.advanceRequestsEnabled
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {settings.advanceRequestsEnabled ? (
                    <>
                      <ToggleRight className="h-4 w-4" />
                      Désactiver
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4" />
                      Activer
                    </>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={loadAll}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation par onglets selon le rôle */}
        {effectiveMode === 'dg' ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setDgTab('overview')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'overview'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Vue Générale & Paie ({salaries.length})
            </button>
            <button
              type="button"
              onClick={() => setDgTab('define')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'define'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              Définir un Salaire (Période)
            </button>
            <button
              type="button"
              onClick={() => setDgTab('claims')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'claims'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-800 hover:bg-red-100'
              }`}
            >
              Réclamations ({dgStats.pendingClaims})
            </button>
            <button
              type="button"
              onClick={() => setDgTab('advances')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'advances'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              Avances sur Salaire ({dgStats.pendingAdvances} en attente)
            </button>
            <button
              type="button"
              onClick={() => setDgTab('payer_desk')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'payer_desk'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              Guichet Payeur ({assignedSalariesToPay.length + assignedAdvancesToPay.length})
            </button>
            <button
              type="button"
              onClick={() => setDgTab('history')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                dgTab === 'history'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Historique & Traçabilité
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setAgentTab('my_salaries')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                agentTab === 'my_salaries'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Mon Salaire & Historique ({myPersonalSalaries.length})
            </button>
            <button
              type="button"
              onClick={() => setAgentTab('my_claims')}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                agentTab === 'my_claims'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Mes Réclamations ({claims.filter((c) => c.agentId === user?.uid).length})
            </button>
            <button
              type="button"
              onClick={() => setAgentTab('my_advances')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                agentTab === 'my_advances'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              {!settings.advanceRequestsEnabled && <Lock className="h-3.5 w-3.5" />}
              Demande d'Avance ({advances.filter((a) => a.agentId === user?.uid).length})
            </button>
            {(assignedSalariesToPay.length > 0 ||
              assignedAdvancesToPay.length > 0 ||
              user?.role === 'administrateur_agence') && (
              <button
                type="button"
                onClick={() => setAgentTab('payer_desk')}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  agentTab === 'payer_desk'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                }`}
              >
                Paiements Assignés ({assignedSalariesToPay.length + assignedAdvancesToPay.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* =========================================================
          INTERFACE DIRECTEUR GENERAL
         ========================================================= */}
      {effectiveMode === 'dg' && (
        <>
          {/* KPIs DG */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-slate-400">
                À payer / Autorisés
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                {dgStats.toPay}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-blue-700">
                Payés (Non confirmés)
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-blue-950">
                {dgStats.paidUnconfirmed}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-emerald-700">
                Payés & Confirmés
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-950">
                {dgStats.confirmed}
              </p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-purple-700">
                Mois couverts / Avance
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-purple-950">
                {dgStats.coveredByAdvance}
              </p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-red-700">
                En retard / Réclamés
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-red-950">
                {dgStats.lateOrClaimed}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase text-amber-800">
                Avances à examiner
              </span>
              <p className="mt-1 text-2xl font-black tabular-nums text-amber-950">
                {dgStats.pendingAdvances}
              </p>
            </div>
          </div>

          {/* DG ONGLET 1 : VUE GENERALE DES SALAIRES PAR PERIODE */}
          {dgTab === 'overview' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un agent, mois, référence..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-xs"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                >
                  <option value="all">Tous les statuts salariaux</option>
                  <option value="a_payer">À payer</option>
                  <option value="en_attente_de_paiement">Autorisé (En attente de paiement)</option>
                  <option value="paye">Payé mais non encore confirmé</option>
                  <option value="confirme">Payé et confirmé par l'agent</option>
                  <option value="couvert_par_avance">Couvert par avance</option>
                  <option value="en_retard">En retard</option>
                  <option value="reclame">Réclamé</option>
                </select>
                <select
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                >
                  <option value="all">Toutes les agences</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              {filteredSalaries.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Aucune période de salaire enregistrée pour ces critères. Cliquez sur « Définir un Salaire (Période) » pour préparer la paie d'un agent.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSalaries.map((sal) => (
                    <div
                      key={sal.id}
                      className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {sal.reference}
                          </span>
                          <span className="rounded bg-blue-50 px-2.5 py-0.5 font-black text-blue-900">
                            {formatSalaryPeriodLabel(sal.month, sal.year)}
                          </span>
                          {statusBadge(sal.status)}
                          <span className="text-[11px] text-slate-400">
                            • {sal.agencyName}
                          </span>
                        </div>
                        <p className="text-sm font-black text-slate-900">
                          {sal.agentName}{' '}
                          <span className="font-normal text-slate-500">
                            — Montant fixé :{' '}
                            <strong className="text-slate-950 tabular-nums">
                              {sal.plannedAmount.toLocaleString('fr-FR')} {sal.currency}
                            </strong>
                          </span>
                        </p>
                        {sal.designatedPayerType && (
                          <p className="text-[11px] text-slate-600">
                            Payeur désigné par DG :{' '}
                            <strong>
                              {sal.designatedPayerType === 'user'
                                ? sal.designatedPayerName
                                : `Service ${sal.designatedPayerService}`}
                            </strong>
                            {sal.paidByName && (
                              <>
                                {' '}
                                • Payé par <strong>{sal.paidByName}</strong> (Op:{' '}
                                {sal.linkedOperationNumber})
                              </>
                            )}
                          </p>
                        )}
                        {sal.confirmedByAgent && (
                          <p className="text-[11px] font-semibold text-emerald-700">
                            ✓ Confirmé par l'agent le{' '}
                            {sal.confirmedAt
                              ? new Date(sal.confirmedAt).toLocaleString('fr-FR')
                              : ''}{' '}
                            : « {sal.confirmationNote} »
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {(sal.status === 'a_payer' ||
                          sal.status === 'en_retard' ||
                          sal.status === 'reclame') && (
                          <button
                            type="button"
                            onClick={() => setAuthorizingSalary(sal)}
                            className="rounded-xl bg-blue-600 px-3.5 py-2 font-bold text-white hover:bg-blue-500"
                          >
                            Autoriser & Désigner Payeur
                          </button>
                        )}
                        {(sal.status === 'en_attente_de_paiement' ||
                          sal.status === 'autorise') && (
                          <button
                            type="button"
                            onClick={() => handleExecuteSalaryPayment(sal)}
                            className="rounded-xl bg-emerald-600 px-3.5 py-2 font-bold text-white hover:bg-emerald-500"
                          >
                            Décaisser maintenant
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedHistorySalary(sal)}
                          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <History className="h-3.5 w-3.5" />
                          Historique ({sal.history?.length || 0})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DG ONGLET 2 : DEFINITION DU SALAIRE PAR PERIODE */}
          {dgTab === 'define' && (
            <form
              onSubmit={handleDefineSalary}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Définir ou ajuster le salaire d'un agent pour une période donnée
                </h3>
                <p className="text-xs text-slate-500">
                  Chaque période (Agent + Année + Mois) conserve son propre montant validé sans jamais écraser les mois précédents.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Agent bénéficiaire
                  </label>
                  <select
                    required
                    value={selectedAgentUid}
                    onChange={(e) => setSelectedAgentUid(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold"
                  >
                    <option value="">Sélectionner un agent actif...</option>
                    {agentsList.map((ag) => (
                      <option key={ag.uid} value={ag.uid}>
                        {ag.displayName} ({resolveAgencyName(ag.agencyId)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mois de paie
                  </label>
                  <select
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold"
                  >
                    {MONTH_NAMES_FR.map((mName, idx) => (
                      <option key={mName} value={idx + 1}>
                        {mName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Année
                  </label>
                  <input
                    type="number"
                    min="2024"
                    max="2035"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Montant du salaire pour cette période
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={plannedAmount}
                    onChange={(e) => setPlannedAmount(e.target.value)}
                    placeholder="Ex: 150"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Devise
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'CDF')}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF (Franc Congolais)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date d'échéance prévue (suivi retard)
                  </label>
                  <input
                    type="date"
                    value={dueDateStr}
                    onChange={(e) => setDueDateStr(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDgTab('overview')}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Enregistrer le Salaire de la Période
                </button>
              </div>
            </form>
          )}

          {/* DG ONGLET 3 : RECLAMATIONS DE SALAIRE EN RETARD */}
          {dgTab === 'claims' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-base font-black text-slate-900">
                Réclamations Salariales des Agents ({claims.length})
              </h3>
              {claims.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  Aucune réclamation de salaire en retard enregistrée.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {claims.map((clm) => (
                    <div
                      key={clm.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                            {clm.reference}
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatSalaryPeriodLabel(clm.month, clm.year)}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-900">
                            {clm.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm font-black text-slate-900">
                          {clm.agentName} ({clm.agencyName}) —{' '}
                          <span className="tabular-nums text-red-700">
                            {clm.amount.toLocaleString('fr-FR')} {clm.currency}
                          </span>
                        </p>
                        <p className="text-slate-700">Motif : « {clm.reason} »</p>
                        {clm.dgResponse && (
                          <p className="text-emerald-700 font-semibold">
                            Décision / Réponse DG : {clm.dgResponse}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProcessingClaim(clm);
                          setClaimNextStatus(clm.status);
                          setClaimDgResponse(clm.dgResponse || '');
                        }}
                        className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 shrink-0"
                      >
                        Examiner / Répondre
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DG ONGLET 4 : EXAMEN & DECISION SUR LES DEMANDES D'AVANCE */}
          {dgTab === 'advances' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Demandes d'Avance sur Salaire ({advances.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Examinez la demande écrite obligatoire de l'agent, décidez d'accepter ou refuser et fixez les mois couverts.
                  </p>
                </div>
              </div>

              {advances.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  Aucune demande d'avance sur salaire soumise.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {advances.map((adv) => (
                    <div
                      key={adv.id}
                      className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between text-xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded">
                            {adv.reference}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-bold ${
                              adv.dgDecision === 'acceptee'
                                ? 'bg-emerald-100 text-emerald-800'
                                : adv.dgDecision === 'refusee'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            Décision DG : {adv.dgDecision.replace('_', ' ')} ({adv.status.replace(/_/g, ' ')})
                          </span>
                          <span className="text-slate-400">• {adv.agencyName}</span>
                        </div>

                        <p className="text-sm font-black text-slate-900">
                          {adv.agentName} — Demandé :{' '}
                          <span className="tabular-nums text-purple-700">
                            {adv.requestedAmount.toLocaleString('fr-FR')} {adv.currency}
                          </span>{' '}
                          sur {adv.requestedMonthsCount} mois
                          {adv.approvedAmount && (
                            <span className="ml-2 text-emerald-700">
                              (Accordé : {adv.approvedAmount.toLocaleString('fr-FR')} {adv.currency} sur{' '}
                              {adv.approvedMonthsCount} mois)
                            </span>
                          )}
                        </p>

                        <p className="text-slate-700">
                          <strong>Motif :</strong> {adv.reason}
                        </p>
                        <p className="text-slate-600 italic">
                          <strong>Demande écrite :</strong> « {adv.writtenStatement} »
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={adv.documentDataUrl}
                            download={adv.documentName}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                          >
                            <Paperclip className="h-3 w-3" />
                            Consulter Document Écrit ({adv.documentName})
                          </a>
                          <span className="text-[11px] text-slate-500">
                            Périodes couvertes :{' '}
                            <strong>
                              {adv.coveredPeriods
                                ?.map((p) => formatSalaryPeriodLabel(p.month, p.year))
                                .join(', ')}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {adv.dgDecision === 'en_attente' && (
                          <button
                            type="button"
                            onClick={() => {
                              setExaminingAdvance(adv);
                              setAdvApprovedAmount(String(adv.requestedAmount));
                              setAdvApprovedMonths(adv.requestedMonthsCount);
                              setAdvStartYear(adv.requestedStartYear);
                              setAdvStartMonth(adv.requestedStartMonth);
                            }}
                            className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800"
                          >
                            Examiner & Décider (DG)
                          </button>
                        )}
                        {adv.dgDecision === 'acceptee' &&
                          adv.status === 'autorisee_au_paiement' && (
                            <button
                              type="button"
                              onClick={() => handleExecuteAdvancePayment(adv)}
                              className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500"
                            >
                              Payer l'Avance
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DG ONGLET 5 : HISTORIQUE & TRACABILITE COMPLETE */}
          {dgTab === 'history' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Journal Global de Traçabilité des Salaires, Avances & Réclamations
                </h3>
                <p className="text-xs text-slate-500">
                  Chronologie complète de toutes les décisions DG, autorisations, décaissements et confirmations des agents.
                </p>
              </div>
              {salaries.length === 0 && advances.length === 0 && claims.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  Aucun événement salarial enregistré pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[
                    ...salaries.flatMap((s) =>
                      (s.history || []).map((h) => ({
                        ...h,
                        ref: s.reference,
                        agentName: s.agentName,
                        period: formatSalaryPeriodLabel(s.month, s.year),
                      }))
                    ),
                    ...advances.flatMap((a) =>
                      (a.history || []).map((h) => ({
                        ...h,
                        ref: a.reference,
                        agentName: a.agentName,
                        period: `Avance (${a.requestedMonthsCount} mois)`,
                      }))
                    ),
                    ...claims.flatMap((c) =>
                      (c.history || []).map((h) => ({
                        ...h,
                        ref: c.reference,
                        agentName: c.agentName,
                        period: formatSalaryPeriodLabel(c.month, c.year),
                      }))
                    ),
                  ]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((item) => (
                      <div key={`${item.ref}_${item.id}`} className="py-3.5 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                              {item.ref}
                            </span>
                            <span className="font-black text-slate-900">{item.action}</span>
                            <span className="text-slate-500">
                              • {item.agentName} ({item.period})
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(item.timestamp).toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-slate-700">{item.details}</p>
                        <p className="text-[11px] text-slate-500">
                          Exécuté par : <strong>{item.actorName}</strong> ({item.actorRole})
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* =========================================================
          INTERFACE AGENT : MON SALAIRE, MES RECLAMATIONS, MES AVANCES
         ========================================================= */}
      {effectiveMode === 'agent' && (
        <>
          {agentTab === 'my_salaries' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Mes Bulletins & Périodes de Salaire
                  </h3>
                  <p className="text-xs text-slate-500">
                    Consultez vos salaires autorisés, confirmez la réception après paiement ou signalez un retard.
                  </p>
                </div>
              </div>

              {myPersonalSalaries.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  Aucune fiche de salaire enregistrée pour votre compte pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {myPersonalSalaries.map((sal) => (
                    <div
                      key={sal.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {sal.reference}
                          </span>
                          <span className="rounded bg-blue-50 px-2.5 py-0.5 font-black text-blue-900">
                            {formatSalaryPeriodLabel(sal.month, sal.year)}
                          </span>
                          {statusBadge(sal.status)}
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                            {sal.paymentCategory === 'couvert_par_avance'
                              ? 'Couvert par Avance'
                              : 'Paiement Normal'}
                          </span>
                        </div>
                        <p className="text-sm font-black text-slate-900 tabular-nums">
                          Montant : {sal.plannedAmount.toLocaleString('fr-FR')} {sal.currency}
                        </p>
                        {sal.paidAt && (
                          <p className="text-slate-600">
                            Payé le {new Date(sal.paidAt).toLocaleString('fr-FR')} par{' '}
                            <strong>{sal.paidByName}</strong> (Réf Opération :{' '}
                            {sal.linkedOperationNumber})
                          </p>
                        )}
                        {sal.confirmedByAgent && (
                          <p className="font-bold text-emerald-700">
                            ✓ Confirmé le{' '}
                            {sal.confirmedAt
                              ? new Date(sal.confirmedAt).toLocaleString('fr-FR')
                              : ''}{' '}
                            : « {sal.confirmationNote} »
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {sal.status === 'paye' && !sal.confirmedByAgent && (
                          <button
                            type="button"
                            onClick={() => handleConfirmReceiptByAgent(sal)}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-500"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            J'ai reçu mon salaire ({formatSalaryPeriodLabel(sal.month, sal.year)})
                          </button>
                        )}
                        {(sal.status === 'a_payer' ||
                          sal.status === 'en_retard' ||
                          sal.status === 'en_attente_de_paiement') && (
                          <button
                            type="button"
                            onClick={() => setClaimingSalary(sal)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 font-bold text-red-700 hover:bg-red-100"
                          >
                            Réclamer un retard
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {agentTab === 'my_claims' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-base font-black text-slate-900">
                Suivi de mes Réclamations Salariales
              </h3>
              {claims.filter((c) => c.agentId === user?.uid).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Vous n'avez soumis aucune réclamation de salaire.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {claims
                    .filter((c) => c.agentId === user?.uid)
                    .map((clm) => (
                      <div key={clm.id} className="py-4 space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            {clm.reference}
                          </span>
                          <span className="font-bold text-blue-800">
                            {formatSalaryPeriodLabel(clm.month, clm.year)}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-900">
                            {clm.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-slate-700">Votre motif : « {clm.reason} »</p>
                        {clm.dgResponse && (
                          <p className="font-bold text-emerald-700">
                            Réponse Direction Générale : {clm.dgResponse}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {agentTab === 'my_advances' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              {!settings.advanceRequestsEnabled ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-xs text-amber-950 flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-black text-sm">
                      Demandes d'avance sur salaire actuellement désactivées par la Direction Générale
                    </h4>
                    <p className="text-amber-800">
                      Conformément aux règles de gestion Ets AMANI, la soumission de nouvelles demandes d'avance est temporairement fermée par le Directeur Général. Vous pouvez toujours consulter ci-dessous l'historique et les décisions de vos demandes précédentes.
                    </p>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmitAdvanceRequest}
                  className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5 space-y-4"
                >
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Soumettre une Demande d'Avance sur Salaire
                    </h3>
                    <p className="text-xs text-slate-600">
                      La demande écrite signée / pièce justificative est obligatoire. Toute demande reste soumise à l'examen et à la décision finale du Directeur Général.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Montant demandé
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={reqAdvAmount}
                        onChange={(e) => setReqAdvAmount(e.target.value)}
                        placeholder="Ex: 300"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Devise
                      </label>
                      <select
                        value={reqAdvCurrency}
                        onChange={(e) =>
                          setReqAdvCurrency(e.target.value as 'USD' | 'CDF')
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="CDF">CDF</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nombre de mois concernés
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        required
                        value={reqAdvMonths}
                        onChange={(e) => setReqAdvMonths(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        À partir du mois de
                      </label>
                      <div className="flex gap-1">
                        <select
                          value={reqAdvStartMonth}
                          onChange={(e) => setReqAdvStartMonth(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-semibold"
                        >
                          {MONTH_NAMES_FR.map((m, idx) => (
                            <option key={m} value={idx + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={reqAdvStartYear}
                          onChange={(e) => setReqAdvStartYear(Number(e.target.value))}
                          className="w-20 rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Motif synthétique de la demande
                    </label>
                    <input
                      type="text"
                      required
                      value={reqAdvReason}
                      onChange={(e) => setReqAdvReason(e.target.value)}
                      placeholder="Ex: Frais médicaux familiaux / Scolarité..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lettre / Document écrit obligatoire de l'agent (Engagement signé)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={reqAdvWrittenStatement}
                      onChange={(e) => setReqAdvWrittenStatement(e.target.value)}
                      placeholder="Je soussigné(e) ..., sollicite auprès de la Direction Générale Ets AMANI une avance sur salaire de ..."
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <Paperclip className="h-4 w-4 text-purple-700" />
                      <span>
                        {reqAdvDocName
                          ? `Pièce jointe : ${reqAdvDocName}`
                          : 'Joindre scan / PDF / photo de la lettre écrite'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
                        className="hidden"
                        onChange={handleAdvanceFileChange}
                      />
                    </label>

                    <button
                      type="submit"
                      className="rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-purple-600"
                    >
                      Envoyer la demande d'avance au DG
                    </button>
                  </div>
                </form>
              )}

              {/* Liste des demandes d'avance de l'agent */}
              <div className="space-y-3">
                <h4 className="text-sm font-black text-slate-900">
                  Historique de mes Demandes d'Avance & Décisions du DG
                </h4>
                {advances.filter((a) => a.agentId === user?.uid).length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Aucune demande d'avance enregistrée.
                  </p>
                ) : (
                  advances
                    .filter((a) => a.agentId === user?.uid)
                    .map((adv) => (
                      <div
                        key={adv.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-purple-800">
                              {adv.reference}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-bold ${
                                adv.dgDecision === 'acceptee'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : adv.dgDecision === 'refusee'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              Décision DG : {adv.dgDecision} ({adv.status.replace(/_/g, ' ')})
                            </span>
                          </div>
                          <p className="font-bold text-slate-900">
                            Montant demandé : {adv.requestedAmount.toLocaleString('fr-FR')}{' '}
                            {adv.currency} ({adv.requestedMonthsCount} mois)
                            {adv.approvedAmount && (
                              <span className="text-emerald-700">
                                {' '}
                                • Accordé par DG : {adv.approvedAmount.toLocaleString('fr-FR')}{' '}
                                {adv.currency} ({adv.approvedMonthsCount} mois)
                              </span>
                            )}
                          </p>
                          <p className="text-slate-600">
                            Périodes couvertes :{' '}
                            {adv.coveredPeriods
                              ?.map((p) => formatSalaryPeriodLabel(p.month, p.year))
                              .join(', ')}
                          </p>
                          {adv.dgConditionsOrReason && (
                            <p className="font-semibold text-slate-800">
                              Note / Décision du DG : {adv.dgConditionsOrReason}
                            </p>
                          )}
                        </div>

                        {adv.status === 'payee' && !adv.confirmedByAgent && (
                          <button
                            type="button"
                            onClick={() => handleConfirmAdvanceByAgent(adv)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 shrink-0"
                          >
                            Confirmer réception de l'avance
                          </button>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* =========================================================
          INTERFACE DU PAYEUR AUTORISE (GUICHET / CAISSE)
         ========================================================= */}
      {((effectiveMode === 'dg' && dgTab === 'payer_desk') ||
        (effectiveMode === 'agent' && agentTab === 'payer_desk')) && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Guichet du Payeur Autorisé — Décaissements Salariaux Assignés
            </h3>
            <p className="text-xs text-slate-500">
              Seuls les salaires et avances autorisés par le Directeur Général et assignés à votre profil ou service apparaissent ici. Le montant fixé par le DG est verrouillé.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Salaires Mensuels Autorisés à Décaisser ({assignedSalariesToPay.length})
            </h4>
            {assignedSalariesToPay.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Aucun salaire en attente de paiement ne vous est assigné actuellement.
              </p>
            ) : (
              assignedSalariesToPay.map((sal) => (
                <div
                  key={sal.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-700">
                        {sal.reference}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatSalaryPeriodLabel(sal.month, sal.year)}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900">
                      Bénéficiaire : {sal.agentName} ({sal.agencyName})
                    </p>
                    <p className="font-bold text-emerald-700 tabular-nums">
                      Montant autorisé par le DG ({sal.authorizedByName}) :{' '}
                      {sal.plannedAmount.toLocaleString('fr-FR')} {sal.currency}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExecuteSalaryPayment(sal)}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-500 shrink-0"
                  >
                    Confirmer le Paiement Effectué
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Avances sur Salaire Approuvées à Décaisser ({assignedAdvancesToPay.length})
            </h4>
            {assignedAdvancesToPay.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                Aucune avance approuvée en attente de décaissement.
              </p>
            ) : (
              assignedAdvancesToPay.map((adv) => (
                <div
                  key={adv.id}
                  className="flex flex-col gap-3 rounded-2xl border border-purple-200 bg-purple-50/40 p-4 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="space-y-1">
                    <span className="font-mono font-bold text-purple-800">
                      {adv.reference}
                    </span>
                    <p className="text-sm font-black text-slate-900">
                      Bénéficiaire : {adv.agentName} ({adv.agencyName})
                    </p>
                    <p className="font-bold text-purple-900 tabular-nums">
                      Montant d'avance accordé par le DG :{' '}
                      {(adv.approvedAmount || adv.requestedAmount).toLocaleString('fr-FR')}{' '}
                      {adv.currency}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExecuteAdvancePayment(adv)}
                    className="rounded-xl bg-purple-700 px-4 py-2.5 font-bold text-white hover:bg-purple-600 shrink-0"
                  >
                    Décaisser l'Avance
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          MODALES CONTEXTUELLES (AUTORISATION, RECLAMATION, AVANCE, HISTORIQUE)
         ========================================================= */}

      {/* Modal DG : Autoriser le salaire & Désigner le payeur */}
      {authorizingSalary && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleAuthorizeSalary}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Autoriser le paiement & Désigner le payeur
              </h3>
              <button type="button" onClick={() => setAuthorizingSalary(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-slate-600">
              Agent : <strong>{authorizingSalary.agentName}</strong> • Période :{' '}
              <strong>
                {formatSalaryPeriodLabel(authorizingSalary.month, authorizingSalary.year)}
              </strong>{' '}
              • Montant :{' '}
              <strong>
                {authorizingSalary.plannedAmount.toLocaleString('fr-FR')}{' '}
                {authorizingSalary.currency}
              </strong>
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Mode de désignation du payeur
              </label>
              <select
                value={payerType}
                onChange={(e) => setPayerType(e.target.value as 'service' | 'user')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
              >
                <option value="service">Par Service habilité (Guichet / Caisse / Comptabilité)</option>
                <option value="user">Par Utilisateur nominatif précis</option>
              </select>
            </div>
            {payerType === 'service' ? (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Service chargé du paiement
                </label>
                <select
                  value={payerService}
                  onChange={(e) => setPayerService(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                >
                  <option value="guichetier">Guichetier / Caissier d'Agence</option>
                  <option value="comptable">Service Comptabilité</option>
                  <option value="agent_change">Caisse Change USD/CDF</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Sélectionner l'utilisateur payeur
                </label>
                <select
                  required
                  value={payerUserId}
                  onChange={(e) => setPayerUserId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                >
                  <option value="">Choisir un utilisateur...</option>
                  {usersList.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAuthorizingSalary(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500"
              >
                Valider l'Autorisation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal DG : Examen & Décision finale sur une Demande d'Avance */}
      {examiningAdvance && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleDecideAdvance}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Décision du Directeur Général — Avance {examiningAdvance.reference}
              </h3>
              <button type="button" onClick={() => setExaminingAdvance(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3.5 space-y-1">
              <p>
                <strong>Agent :</strong> {examiningAdvance.agentName} ({examiningAdvance.agencyName})
              </p>
              <p>
                <strong>Demande :</strong>{' '}
                {examiningAdvance.requestedAmount.toLocaleString('fr-FR')}{' '}
                {examiningAdvance.currency} sur {examiningAdvance.requestedMonthsCount} mois
              </p>
              <p>
                <strong>Motif :</strong> {examiningAdvance.reason}
              </p>
              <p className="italic text-slate-600">
                « {examiningAdvance.writtenStatement} »
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Décision finale du DG
              </label>
              <select
                value={advDecision}
                onChange={(e) =>
                  setAdvDecision(e.target.value as 'acceptee' | 'refusee')
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
              >
                <option value="acceptee">ACCEPTER l'avance et verrouiller les mois couverts</option>
                <option value="refusee">REFUSER la demande d'avance</option>
              </select>
            </div>

            {advDecision === 'acceptee' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Montant accordé ({examiningAdvance.currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={advApprovedAmount}
                      onChange={(e) => setAdvApprovedAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nombre de mois couverts
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      required
                      value={advApprovedMonths}
                      onChange={(e) => setAdvApprovedMonths(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Premier mois couvert
                    </label>
                    <select
                      value={advStartMonth}
                      onChange={(e) => setAdvStartMonth(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                    >
                      {MONTH_NAMES_FR.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Année de départ
                    </label>
                    <input
                      type="number"
                      value={advStartYear}
                      onChange={(e) => setAdvStartYear(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Mode de désignation du payeur de l'avance
                  </label>
                  <select
                    value={advPayerType}
                    onChange={(e) =>
                      setAdvPayerType(e.target.value as 'service' | 'user')
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                  >
                    <option value="service">Par Service habilité (Guichet / Comptabilité)</option>
                    <option value="user">Par Utilisateur nominatif précis</option>
                  </select>
                </div>

                {advPayerType === 'service' ? (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Service désigné pour décaisser l'avance
                    </label>
                    <select
                      value={advPayerService}
                      onChange={(e) => setAdvPayerService(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                    >
                      <option value="guichetier">Guichetier / Caissier d'Agence</option>
                      <option value="comptable">Service Comptabilité</option>
                      <option value="agent_change">Caisse Change USD/CDF</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Utilisateur désigné pour décaisser l'avance
                    </label>
                    <select
                      required
                      value={advPayerUserId}
                      onChange={(e) => setAdvPayerUserId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-semibold"
                    >
                      <option value="">Choisir un utilisateur...</option>
                      {usersList.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {advDecision === 'acceptee'
                  ? 'Conditions de l’avance / Instructions de paie'
                  : 'Motif du refus'}
              </label>
              <textarea
                rows={2}
                required
                value={advConditions}
                onChange={(e) => setAdvConditions(e.target.value)}
                placeholder={
                  advDecision === 'acceptee'
                    ? 'Ex: Couvre intégralement les mois sélectionnés sans nouvelle paie normale.'
                    : 'Préciser le motif du refus...'
                }
                className="w-full rounded-xl border border-slate-300 p-2.5"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExaminingAdvance(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className={`rounded-xl px-4 py-2 font-bold text-white ${
                  advDecision === 'acceptee'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                Enregistrer la Décision DG
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal DG : Traitement d'une réclamation */}
      {processingClaim && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleProcessClaim}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Traiter la Réclamation {processingClaim.reference}
              </h3>
              <button type="button" onClick={() => setProcessingClaim(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <select
              value={claimNextStatus}
              onChange={(e) => setClaimNextStatus(e.target.value as SalaryClaimStatus)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
            >
              <option value="en_examen">En examen</option>
              <option value="traitee">Traitée</option>
              <option value="payee">Payée</option>
              <option value="rejetee">Rejetée</option>
              <option value="sans_suite">Sans suite</option>
            </select>
            <textarea
              rows={3}
              required
              value={claimDgResponse}
              onChange={(e) => setClaimDgResponse(e.target.value)}
              placeholder="Réponse ou décision du Directeur Général..."
              className="w-full rounded-xl border border-slate-300 p-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProcessingClaim(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"
              >
                Valider
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Agent : Soumettre une réclamation de retard */}
      {claimingSalary && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleSubmitClaim}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Réclamation de salaire —{' '}
                {formatSalaryPeriodLabel(claimingSalary.month, claimingSalary.year)}
              </h3>
              <button type="button" onClick={() => setClaimingSalary(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              rows={3}
              required
              value={claimReason}
              onChange={(e) => setClaimReason(e.target.value)}
              placeholder="Expliquez le motif de votre réclamation (ex: échéance dépassée, salaire non reçu au guichet)..."
              className="w-full rounded-xl border border-slate-300 p-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClaimingSalary(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500"
              >
                Envoyer la Réclamation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Historique Complet d'une période de salaire */}
      {selectedHistorySalary && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Traçabilité & Historique — {selectedHistorySalary.reference}
                </h3>
                <p className="text-slate-500">
                  {selectedHistorySalary.agentName} •{' '}
                  {formatSalaryPeriodLabel(
                    selectedHistorySalary.month,
                    selectedHistorySalary.year
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistorySalary(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(selectedHistorySalary.history || []).map((evt) => (
                <div
                  key={evt.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">{evt.action}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(evt.timestamp).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-slate-700">{evt.details}</p>
                  <p className="text-[10px] text-slate-500">
                    Acteur : <strong>{evt.actorName}</strong> ({evt.actorRole})
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
