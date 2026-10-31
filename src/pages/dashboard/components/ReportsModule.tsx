import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Download,
  FileCheck,
  FileEdit,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
  ArrowLeftRight,
  Briefcase,
  Calculator,
  CheckSquare,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { db, type LocalReport, type Billetage } from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import {
  approveOrProcessReport,
  auditPdfExport,
  canPerformReportAction,
  computeReportMetrics,
  consolidateAgencyReports,
  deleteDraftReport,
  exportReportsToExcel,
  getAgentPersonalMetrics,
  getAuthorizedReports,
  resolvePeriodBounds,
  returnReportForCorrection,
  saveAdaptiveReport,
} from '../../../services/ReportService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import { verifyBiometricIdentity } from '../../../services/BiometricAuthService';
import { getAgencyUsers, type AgencyUser } from '../../../services/AgencyUserService';
import ReportAdaptiveCategoryForm, {
  ReportAdaptiveCategoryView,
} from './ReportAdaptiveCategoryForm';
import type {
  ActivityStatus,
  DifficultySeverity,
  ReportActivityItem,
  ReportDecisionItem,
  ReportDifficultyItem,
  ReportIncidentItem,
  ReportPriority,
  ReportQuantitativeItem,
  ReportRecommendationItem,
  ReportResultItem,
  ReportStatus,
  ReportType,
  AgentCategorySpecificData,
  AgentReportCategory,
} from '../../../types/report';
import {
  FUNCTION_DISPLAY_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
} from '../../../types/report';
import type { UserFunction } from '../../../types/auth';

interface ReportsModuleProps {
  onClose?: () => void;
  onOpenBilletage?: () => void;
}

type TabKey = 'all' | 'drafts' | 'submitted' | 'returned' | 'processed' | 'tracking' | 'consolidation';

export default function ReportsModule({ onClose, onOpenBilletage }: ReportsModuleProps) {
  const { user } = useAuth();
  const isGlobalRole =
    user?.role === 'administrateur_systeme' || user?.role === 'directeur_general';
  const isAgencyAdmin = user?.role === 'administrateur_agence';
  const isAgent = user?.role === 'agent';

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [billetages, setBilletages] = useState<Billetage[]>([]);
  const [agencyUsers, setAgencyUsers] = useState<AgencyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtres
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [syncFilter, setSyncFilter] = useState<'all' | 'pending' | 'synced'>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>(
    isGlobalRole ? 'all' : user?.agencyId || 'all'
  );

  // Éditeur / Générateur
  const [showEditor, setShowEditor] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Formulaire d'édition adaptatif
  const [formMode, setFormMode] = useState<'guide' | 'personnalise'>('guide');
  const [formType, setFormType] = useState<ReportType>('activite');
  const [formTitle, setFormTitle] = useState('');
  const [formPeriod, setFormPeriod] = useState<LocalReport['period']>('aujourd_hui');
  const [customStart, setCustomStart] = useState<string>(
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [formPriority, setFormPriority] = useState<ReportPriority>('normal');
  const [formExecutiveSummary, setFormExecutiveSummary] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [certifiedAccepted, setCertifiedAccepted] = useState(false);

  // Catégorie métier adaptative et données spécifiques
  const [activeCategory, setActiveCategory] = useState<AgentReportCategory>('autre');
  const [categoryData, setCategoryData] = useState<AgentCategorySpecificData>({});

  // Services multiples pour agents polyvalents
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Sections interactives
  const [activities, setActivities] = useState<ReportActivityItem[]>([]);
  const [results, setResults] = useState<ReportResultItem[]>([]);
  const [quantitativeData, setQuantitativeData] = useState<ReportQuantitativeItem[]>([]);
  const [difficulties, setDifficulties] = useState<ReportDifficultyItem[]>([]);
  const [incidents, setIncidents] = useState<ReportIncidentItem[]>([]);
  const [recommendations, setRecommendations] = useState<ReportRecommendationItem[]>([]);
  const [decisionsNeeded, setDecisionsNeeded] = useState<ReportDecisionItem[]>([]);

  // Billetage lié
  const [linkedBilletageId, setLinkedBilletageId] = useState<string>('');

  // Sections repliables (accordéon mobile)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    general: false,
    summary: false,
    metrics: false,
    category: false,
    activities: false,
    results: false,
    quant: false,
    difficulties: false,
    incidents: false,
    recom: false,
    billetage: false,
    certification: false,
  });

  // Métriques opérationnelles réelles calculées
  const [personalMetrics, setPersonalMetrics] = useState<{
    operationsCompleted: number;
    operationsTotal: number;
    amountUSD: number;
    amountCDF: number;
    billetageTotalUSD: number;
    billetageTotalCDF: number;
    discrepancyUSD: number;
    discrepancyCDF: number;
  } | null>(null);

  // Consultation détaillée d'un rapport
  const [selectedReport, setSelectedReport] = useState<LocalReport | null>(null);

  // Modal de retour pour correction
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetReport, setReturnTargetReport] = useState<LocalReport | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnPoints, setReturnPoints] = useState<string[]>(['']);
  const [returnNotes, setReturnNotes] = useState('');
  const [isReturning, setIsReturning] = useState(false);

  // Modal de consolidation d'agence
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [consolidationTitle, setConsolidationTitle] = useState('');
  const [consolidationPeriod, setConsolidationPeriod] = useState<'aujourd_hui' | '7_jours' | '30_jours'>('aujourd_hui');
  const [isConsolidating, setIsConsolidating] = useState(false);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [repList, agList, bilList] = await Promise.all([
        getAuthorizedReports(user),
        getAgencies(),
        db.billetages.toArray(),
      ]);
      setReports(repList);
      setAgencies(agList);
      setBilletages(
        bilList.filter((b) => (user.agencyId ? b.agencyId === user.agencyId : true))
      );

      if (user.agencyId) {
        try {
          const uList = await getAgencyUsers(user.agencyId);
          setAgencyUsers(uList.filter((u) => u.role === 'agent'));
        } catch {
          // ignore
        }
      }

      if (selectedReport) {
        const fresh = repList.find((r) => r.id === selectedReport.id);
        if (fresh) setSelectedReport(fresh);
      }
    } catch (err) {
      console.warn('[Ets AMANI] Erreur chargement rapports :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.uid, user?.agencyId]);

  // Recalcul des métriques réelles lors de la sélection de période
  const refreshMetrics = async () => {
    if (!user) return;
    const bounds = resolvePeriodBounds(
      formPeriod,
      customStart ? new Date(customStart).getTime() : undefined,
      customEnd ? new Date(customEnd + 'T23:59:59').getTime() : undefined
    );
    if (isAgent) {
      const pMet = await getAgentPersonalMetrics(user, bounds.startDate, bounds.endDate);
      setPersonalMetrics({
        operationsCompleted: pMet.operationsCompleted,
        operationsTotal: pMet.operationsCount,
        amountUSD: pMet.amountUSD,
        amountCDF: pMet.amountCDF,
        billetageTotalUSD: pMet.billetageTotalUSD,
        billetageTotalCDF: pMet.billetageTotalCDF,
        discrepancyUSD: pMet.discrepancyUSD,
        discrepancyCDF: pMet.discrepancyCDF,
      });
    } else {
      const gMet = await computeReportMetrics(
        isGlobalRole ? null : user.agencyId || null,
        bounds.startDate,
        bounds.endDate
      );
      setPersonalMetrics({
        operationsCompleted: gMet.operationsCompleted,
        operationsTotal: gMet.operationsTotal,
        amountUSD: gMet.operationsAmountUSD,
        amountCDF: gMet.operationsAmountCDF,
        billetageTotalUSD: gMet.totalBilletageUSD,
        billetageTotalCDF: gMet.totalBilletageCDF,
        discrepancyUSD: gMet.totalDiscrepancyUSD,
        discrepancyCDF: gMet.totalDiscrepancyCDF,
      });
    }
  };

  useEffect(() => {
    if (showEditor) {
      void refreshMetrics();
    }
  }, [showEditor, formPeriod, customStart, customEnd]);

  // Initialisation d'un nouveau rapport avec adaptation par fonction
  const handleOpenNewReport = () => {
    setEditingReportId(null);
    setFormMode('guide');
    setFormType(isAgent ? 'activite' : 'financier');
    setFormTitle(
      `Rapport ${isAgent ? FUNCTION_DISPLAY_LABELS[user?.function as UserFunction] || 'Agent' : 'd\'Activité'} — ${new Date().toLocaleDateString('fr-FR')}`
    );
    setFormPeriod('aujourd_hui');
    setFormPriority('normal');
    setFormExecutiveSummary('');
    setFormNotes('');
    setCertifiedAccepted(false);
    setLinkedBilletageId('');
    setSelectedServices(
      user?.functions && user.functions.length > 0
        ? user.functions
        : user?.function
          ? [user.function]
          : []
    );

    // Déterminer la catégorie métier adaptative
    let cat: AgentReportCategory = 'guichetier';
    const userFunc = user?.function;
    if (userFunc === 'comptable' || userFunc === 'comptabilite') {
      cat = 'comptable';
    } else if (userFunc === 'caisse') {
      cat = 'caisse';
    } else if (userFunc === 'guichetier') {
      cat = 'guichetier';
    } else if (userFunc === 'agent_virtuel' || userFunc === 'agent_vodae' || userFunc === 'agent_operateur_mobile') {
      cat = 'agent_virtuel';
    } else if (userFunc === 'agent_change') {
      cat = 'agent_change';
    } else if (userFunc === 'agent_terrain' || userFunc === 'chauffeur' || userFunc === 'cleaner') {
      cat = 'agent_terrain';
    }
    if (user?.multiServiceEnabled || (user?.functions && user.functions.length > 1)) {
      cat = 'polyvalent';
    }
    setActiveCategory(cat);

    setCategoryData({
      accountingPeriodName: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      filesProcessedCount: 0,
      operationsBookedCount: personalMetrics?.operationsCompleted || 0,
      reconciliationsDoneCount: personalMetrics?.operationsCompleted || 0,
      discrepanciesCount: (personalMetrics?.discrepancyUSD !== 0 || personalMetrics?.discrepancyCDF !== 0) ? 1 : 0,
      missingReceiptsCount: 0,
      accountingCorrectiveActions: '',
      accountingObservations: '',

      cashRegisterIdentifier: `Caisse-${user?.displayName?.split(' ')[0] || '1'}`,
      cashOperationsCount: personalMetrics?.operationsCompleted || 0,
      authorizedReceiptsUSD: personalMetrics?.amountUSD || 0,
      authorizedReceiptsCDF: personalMetrics?.amountCDF || 0,
      authorizedDisbursementsUSD: 0,
      authorizedDisbursementsCDF: 0,
      cashDiscrepancyReason: '',
      cashIncidentsNotes: '',

      tellerOperationsCount: personalMetrics?.operationsCompleted || 0,
      clientsServedCount: personalMetrics?.operationsCompleted || 0,
      pendingTransactionsCount: Math.max(0, (personalMetrics?.operationsTotal || 0) - (personalMetrics?.operationsCompleted || 0)),
      cancelledOrRejectedCount: 0,
      tellerAnomaliesNotes: '',
      technicalDifficultiesNotes: '',

      virtualOperationsCount: personalMetrics?.operationsCompleted || 0,
      requestsReceivedCount: personalMetrics?.operationsTotal || 0,
      requestsResolvedCount: personalMetrics?.operationsCompleted || 0,
      pendingVirtualFilesCount: 0,
      technicalIncidentsCount: 0,
      connectionIssuesCount: 0,
      virtualActionsTaken: '',

      exchangeCurrencies: ['USD', 'CDF'],
      exchangeOperationsCount: 0,
      exchangeVolumeUSD: 0,
      exchangeVolumeCDF: 0,
      exchangeAnomaliesNotes: '',
      pendingExchangeOpsCount: 0,

      assignedMissionTitle: '',
      missionObjective: '',
      interventionLocation: user?.agencyId || 'Secteur Local',
      fieldActivitiesCompleted: '',
      fieldResultsObtained: '',
      fieldRecommendations: '',
      fieldProofDocumentName: '',

      activeSelectedCategories: user?.functions && user.functions.length > 0 ? (user.functions as string[]) : ['guichetier', 'caisse'],
    });

    // Initialiser les sections adaptées à la fonction
    if (userFunc === 'caisse' || userFunc === 'guichetier') {
      setActivities([
        {
          id: `act-${Date.now()}-1`,
          title: 'Tenue de guichet & accueil des clients',
          description: 'Exécution des opérations de dépôt, retrait et vérification des pièces d\'identité.',
          responsibleName: user?.displayName || 'Agent',
          date: new Date().toISOString().slice(0, 10),
          location: user?.agencyId || 'Agence',
          status: 'realisee',
          result: 'Opérations exécutées conformément aux procédures.',
        },
      ]);
      setQuantitativeData([
        {
          id: `q-${Date.now()}-1`,
          indicator: 'Opérations de caisse traitées',
          planned: 20,
          achieved: 0,
          variance: 0,
          unit: 'opérations',
        },
        {
          id: `q-${Date.now()}-2`,
          indicator: 'Clients servis au guichet',
          planned: 25,
          achieved: 0,
          variance: 0,
          unit: 'clients',
        },
      ]);
    } else if (userFunc === 'comptable' || userFunc === 'comptabilite') {
      setActivities([
        {
          id: `act-${Date.now()}-1`,
          title: 'Rapprochement des écritures & contrôle de caisse',
          description: 'Pointage des opérations réelles vs déclarations de billetage et SMS reçus.',
          responsibleName: user?.displayName || 'Comptable',
          date: new Date().toISOString().slice(0, 10),
          location: user?.agencyId || 'Centrale',
          status: 'realisee',
          result: 'Rapprochement effectué sans anomalie bloquante.',
        },
      ]);
    } else {
      setActivities([]);
      setQuantitativeData([]);
    }

    setResults([]);
    setDifficulties([]);
    setIncidents([]);
    setRecommendations([]);
    setDecisionsNeeded([]);
    setShowEditor(true);
    setSelectedReport(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Éditer un brouillon ou rapport retourné
  const handleEditReport = (rep: LocalReport) => {
    setEditingReportId(rep.id);
    setFormMode(rep.mode || 'guide');
    setFormType(rep.type);
    setFormTitle(rep.title);
    setFormPeriod(rep.period);
    setFormPriority(rep.priority || 'normal');
    setFormExecutiveSummary(rep.executiveSummary || rep.summary || '');
    setFormNotes(rep.notes || '');
    setCertifiedAccepted(rep.certifiedByAuthor || false);
    setLinkedBilletageId(rep.linkedBilletageId || '');
    setSelectedServices(rep.selectedServices || []);
    setActivities(rep.activities || []);
    setResults(rep.results || []);
    setQuantitativeData(rep.quantitativeData || []);
    setDifficulties(rep.difficulties || []);
    setIncidents(rep.incidents || []);
    setRecommendations(rep.recommendations || []);
    setDecisionsNeeded(rep.decisionsNeeded || []);

    if (rep.categoryData) {
      setCategoryData(rep.categoryData);
      if (rep.categoryData.activeSelectedCategories && rep.categoryData.activeSelectedCategories.length > 1) {
        setActiveCategory('polyvalent');
      } else {
        const cat = (rep.categoryData.activeSelectedCategories?.[0] || rep.authorFunction || 'autre') as AgentReportCategory;
        setActiveCategory(cat);
      }
    } else {
      let cat: AgentReportCategory = 'guichetier';
      const f = rep.authorFunction;
      if (f === 'comptable' || f === 'comptabilite') cat = 'comptable';
      else if (f === 'caisse') cat = 'caisse';
      else if (f === 'agent_virtuel' || f === 'agent_vodae') cat = 'agent_virtuel';
      else if (f === 'agent_change') cat = 'agent_change';
      else if (f === 'agent_terrain') cat = 'agent_terrain';
      setActiveCategory(cat);
      setCategoryData({});
    }

    setShowEditor(true);
    setSelectedReport(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sauvegarde (Brouillon ou Soumission)
  const handleSaveReport = async (isSubmitting: boolean) => {
    if (!user) return;
    setErrorMsg(null);
    setIsSaving(true);

    if (isSubmitting && !certifiedAccepted) {
      setErrorMsg('Veuillez cocher la déclaration d\'exactitude avant de soumettre officiellement votre rapport.');
      setIsSaving(false);
      return;
    }

    if (isSubmitting && !formTitle.trim()) {
      setErrorMsg('L\'intitulé officiel du rapport est obligatoire pour la soumission.');
      setIsSaving(false);
      return;
    }

    try {
      // Couche de vérification biométrique anti-usurpation lors de la soumission officielle
      if (isSubmitting) {
        await verifyBiometricIdentity({
          user,
          actionTitle: 'Soumission Officielle de Rapport',
          actionDescription: `Signature électronique de l'agent pour le rapport « ${formTitle.trim()} »`,
        });
      }

      const selectedBilletage = billetages.find((b) => b.id === linkedBilletageId);
      const bounds = resolvePeriodBounds(
        formPeriod,
        customStart ? new Date(customStart).getTime() : undefined,
        customEnd ? new Date(customEnd + 'T23:59:59').getTime() : undefined
      );

      const saved = await saveAdaptiveReport(
        {
          id: editingReportId || undefined,
          title: formTitle.trim(),
          type: formType,
          period: formPeriod,
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          agencyId: user.agencyId || null,
          priority: formPriority,
          mode: formMode,
          authorFunction: user.function || user.role,
          authorService: user.function || 'Opérations',
          selectedServices,
          executiveSummary: formExecutiveSummary.trim(),
          notes: formNotes.trim(),
          categoryData: {
            ...categoryData,
            activeSelectedCategories: activeCategory === 'polyvalent'
              ? (categoryData.activeSelectedCategories && categoryData.activeSelectedCategories.length > 0
                  ? categoryData.activeSelectedCategories
                  : ['guichetier', 'caisse'])
              : [activeCategory],
          },
          activities,
          results,
          quantitativeData,
          difficulties,
          incidents,
          recommendations,
          decisionsNeeded,
          linkedBilletageId: linkedBilletageId || null,
          linkedBilletageRef: selectedBilletage?.reference || null,
          linkedBilletageAmount: selectedBilletage?.calculatedTotal,
          linkedBilletageCurrency: selectedBilletage?.currency,
        },
        user,
        isSubmitting
      );

      setLastSavedTime(new Date().toLocaleTimeString('fr-FR'));

      if (isSubmitting) {
        setFeedback(`Rapport ${saved.reference} soumis avec succès pour examen hiérarchique.`);
        setShowEditor(false);
        setSelectedReport(saved);
        setTimeout(() => setFeedback(null), 4500);
      } else {
        setEditingReportId(saved.id);
        setFeedback(`Brouillon ${saved.reference} sauvegardé localement en Offline-First.`);
        setTimeout(() => setFeedback(null), 3000);
      }

      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement du rapport.');
    } finally {
      setIsSaving(false);
    }
  };

  // Traitement / Approbation
  const handleApprove = async (rep: LocalReport) => {
    if (!user) return;
    try {
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Validation & Approbation Rapport',
        actionDescription: `Validation hiérarchique et certification du rapport ${rep.reference}`,
      });
      await approveOrProcessReport(rep.id, user);
      setFeedback(`Rapport ${rep.reference} validé et certifié avec succès.`);
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la validation.');
    }
  };

  // Ouverture du modal de retour pour correction
  const handleOpenReturnModal = (rep: LocalReport) => {
    setReturnTargetReport(rep);
    setReturnReason('');
    setReturnPoints(['']);
    setReturnNotes('');
    setShowReturnModal(true);
  };

  const handleConfirmReturn = async () => {
    if (!user || !returnTargetReport) return;
    if (!returnReason.trim()) {
      setErrorMsg('Veuillez indiquer le motif du retour pour correction.');
      return;
    }
    setIsReturning(true);
    try {
      await returnReportForCorrection(
        returnTargetReport.id,
        returnReason,
        returnPoints,
        returnNotes,
        user
      );
      setFeedback(`Rapport ${returnTargetReport.reference} retourné à l'agent avec instructions.`);
      setShowReturnModal(false);
      setReturnTargetReport(null);
      setTimeout(() => setFeedback(null), 4000);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Impossible de retourner le rapport.');
    } finally {
      setIsReturning(false);
    }
  };

  // Suppression d'un brouillon
  const handleDeleteDraft = async (rep: LocalReport) => {
    if (!user) return;
    if (!confirm(`Supprimer définitivement le brouillon « ${rep.title} » ?`)) return;
    try {
      await deleteDraftReport(rep.id, user);
      setFeedback(`Brouillon ${rep.reference} supprimé.`);
      if (selectedReport?.id === rep.id) setSelectedReport(null);
      if (editingReportId === rep.id) setShowEditor(false);
      setTimeout(() => setFeedback(null), 3000);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  // Consolidation d'agence
  const handleConsolidateAgency = async () => {
    if (!user || !user.agencyId) return;
    setIsConsolidating(true);
    try {
      const bounds = resolvePeriodBounds(consolidationPeriod);
      const res = await consolidateAgencyReports(
        user.agencyId,
        bounds.startDate,
        bounds.endDate,
        consolidationTitle,
        user
      );
      setFeedback(`Synthèse consolidée ${res.reference} créée avec succès.`);
      setShowConsolidateModal(false);
      setSelectedReport(res);
      setTimeout(() => setFeedback(null), 4000);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de consolidation.');
    } finally {
      setIsConsolidating(false);
    }
  };

  // Filtrage des rapports selon l'onglet et les critères
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Filtrage par onglet métier
      if (activeTab === 'drafts' && r.status !== 'brouillon') return false;
      if (activeTab === 'submitted' && r.status !== 'soumis' && r.status !== 'recu' && r.status !== 'en_examen') return false;
      if (activeTab === 'returned' && r.status !== 'retourne') return false;
      if (activeTab === 'processed' && r.status !== 'traite' && r.status !== 'valide') return false;
      if (activeTab === 'consolidation' && (!r.consolidatedSourceReportIds || r.consolidatedSourceReportIds.length === 0)) return false;

      // Filtres sélectifs
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (syncFilter === 'pending' && r.syncStatus !== 'pending') return false;
      if (syncFilter === 'synced' && r.syncStatus !== 'synced') return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.agencyName.toLowerCase().includes(q) ||
        r.createdByName.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q)
      );
    });
  }, [reports, activeTab, typeFilter, statusFilter, syncFilter, search]);

  const draftCount = reports.filter((r) => r.status === 'brouillon').length;
  const returnedCount = reports.filter((r) => r.status === 'retourne').length;
  const submittedCount = reports.filter((r) => r.status === 'soumis' || r.status === 'recu' || r.status === 'en_examen').length;
  const processedCount = reports.filter((r) => r.status === 'traite' || r.status === 'valide').length;

  return (
    <div className="space-y-6">
      {/* Bandeau d'en-tête du Module Rapport */}
      <div className="no-print rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
              <FileText className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 truncate">
                  {isAgent ? 'Mes Rapports d\'Activité' : 'Centre des Rapports & Synthèses'}
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 shrink-0">
                  Offline-First • V1 Certifiée
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {isAgent
                  ? `Agent : ${user?.displayName} (${FUNCTION_DISPLAY_LABELS[user?.function as UserFunction] || user?.function || 'Guichetier'}) • Formulaires adaptatifs guidés & brouillons sécurisés`
                  : isAgencyAdmin
                    ? `Périmètre Agence : ${user?.agencyId} • Validation hiérarchique, retours d'instructions et synthèse consolidée`
                    : 'Supervision globale de l\'ensemble des rapports opérationnels et financiers du réseau Ets AMANI'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canPerformReportAction('reports.create', user) && (
              <button
                type="button"
                onClick={showEditor ? () => setShowEditor(false) : handleOpenNewReport}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500"
              >
                {showEditor ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                <span>{showEditor ? 'Fermer le formulaire' : 'Nouveau Rapport'}</span>
              </button>
            )}

            {isAgencyAdmin && (
              <button
                type="button"
                onClick={() => {
                  setConsolidationTitle(`Synthèse Agence ${user?.agencyId} — ${new Date().toLocaleDateString('fr-FR')}`);
                  setShowConsolidateModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Synthèse Consolidée</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => exportReportsToExcel(filteredReports, user!, `Onglet ${activeTab}`)}
              disabled={filteredReports.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              title="Exporter au format Excel CSV"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Actualiser les données locales"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
                title="Fermer le module"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications / Feedback */}
        {feedback && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{feedback}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Alerte si des rapports sont retournés pour correction */}
        {returnedCount > 0 && !showEditor && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-900 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-black">
                  {returnedCount} rapport(s) retourné(s) pour correction
                </p>
                <p className="font-normal text-amber-700">
                  La Direction ou l'Administrateur a émis des demandes d'ajustement. Cliquez sur l'onglet pour corriger et resoumettre.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('returned')}
              className="rounded-xl bg-amber-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-800"
            >
              Voir les retours
            </button>
          </div>
        )}

        {/* Barre d'onglets de navigation métier */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setShowEditor(false);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === 'all' && !showEditor
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Tous les rapports</span>
              <span className="ml-1 rounded-full bg-slate-200/50 px-1.5 py-0.2 text-[10px]">
                {reports.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('drafts');
                setShowEditor(false);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === 'drafts' && !showEditor
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileEdit className="h-3.5 w-3.5 text-amber-500" />
              <span>Brouillons</span>
              {draftCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-900 font-black">
                  {draftCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('submitted');
                setShowEditor(false);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === 'submitted' && !showEditor
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span>Soumis / En examen</span>
              {submittedCount > 0 && (
                <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] text-blue-900 font-black">
                  {submittedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('returned');
                setShowEditor(false);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === 'returned' && !showEditor
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              <span>Retournés pour correction</span>
              {returnedCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.2 text-[10px] text-amber-900 font-black">
                  {returnedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('processed');
                setShowEditor(false);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === 'processed' && !showEditor
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Traités & Validés</span>
              {processedCount > 0 && (
                <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-900">
                  {processedCount}
                </span>
              )}
            </button>

            {(isAgencyAdmin || isGlobalRole) && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tracking');
                  setShowEditor(false);
                }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                  activeTab === 'tracking' && !showEditor
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Users className="h-3.5 w-3.5 text-purple-400" />
                <span>Suivi des Agents ({agencyUsers.length})</span>
              </button>
            )}

            {(isAgencyAdmin || isGlobalRole) && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('consolidation');
                  setShowEditor(false);
                }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                  activeTab === 'consolidation' && !showEditor
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                <span>Synthèses Consolidées</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FORMULAIRE D'ÉDITION ADAPTATIF PROFESSIONNEL */}
      {showEditor && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-md space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                  {editingReportId ? 'Modification de rapport' : 'Création de rapport professionnel'}
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  Fonction : {FUNCTION_DISPLAY_LABELS[user?.function as UserFunction] || user?.function || 'Agent'}
                </span>
                {lastSavedTime && (
                  <span className="text-[11px] text-slate-400">
                    Dernière sauvegarde : {lastSavedTime}
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-lg sm:text-xl font-black text-slate-900">
                Formulaire Adaptatif Guidé — Ets AMANI
              </h3>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setFormMode(formMode === 'guide' ? 'personnalise' : 'guide')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                {formMode === 'guide' ? 'Mode Personnalisé' : 'Mode Guidé Standard'}
              </button>
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Section 1 : Informations Générales & Période */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <button
              type="button"
              onClick={() => toggleSection('general')}
              className="flex w-full items-center justify-between font-bold text-slate-900 text-sm"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-600" />
                <span>1. Informations Générales & Identification</span>
              </div>
              {collapsedSections.general ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {!collapsedSections.general && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Intitulé / Objet du rapport *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ex: Rapport d'activité journalier du guichet..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Type de rapport
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ReportType)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none"
                  >
                    <option value="activite">Rapport d'Activité Professionnelle</option>
                    <option value="quotidien">Rapport Quotidien</option>
                    <option value="financier">Synthèse Financière & Trésorerie</option>
                    <option value="operationnel">Synthèse Opérationnelle & Guichet</option>
                    <option value="cloture_caisse">Procès-Verbal de Clôture de Caisse</option>
                    <option value="incident">Rapport d'Incident / Anomalie</option>
                    <option value="autre">Autre rapport</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Période d'activité
                  </label>
                  <select
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value as LocalReport['period'])}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none"
                  >
                    <option value="aujourd_hui">Aujourd'hui</option>
                    <option value="7_jours">7 derniers jours</option>
                    <option value="30_jours">30 derniers jours (Mois)</option>
                    <option value="personnalise">Période personnalisée</option>
                  </select>
                </div>

                {formPeriod === 'personnalise' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Date de début
                      </label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Date de fin
                      </label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Niveau de priorité
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as ReportPriority)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="critique">Critique (Escalade hiérarchique)</option>
                  </select>
                </div>

                {/* Données d'auteur authentifié vérifiées (lecture seule) */}
                <div className="rounded-xl bg-slate-100 p-2.5 text-xs text-slate-600">
                  <span className="font-bold text-slate-800">Auteur certifié : </span>
                  <span>{user?.displayName} ({user?.agencyId || 'Centrale'})</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2 : Résumé Exécutif */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <button
              type="button"
              onClick={() => toggleSection('summary')}
              className="flex w-full items-center justify-between font-bold text-slate-900 text-sm"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span>2. Résumé Exécutif & Synthèse globale</span>
              </div>
              {collapsedSections.summary ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {!collapsedSections.summary && (
              <div className="pt-2 space-y-2">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={formExecutiveSummary}
                  onChange={(e) => setFormExecutiveSummary(e.target.value)}
                  placeholder="Points saillants, résumé de la journée, faits marquants..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Synthèse concise destinée à la hiérarchie</span>
                  <span>{formExecutiveSummary.length} / 500 caractères</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3 : Métriques opérationnelles réelles (Dexie Offline-First) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>3. Données Opérationnelles Vérifiées (Calcul Automatique)</span>
              </div>
              <button
                type="button"
                onClick={refreshMetrics}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Recalculer</span>
              </button>
            </div>

            {personalMetrics && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">Missions exécutées</span>
                  <p className="mt-0.5 text-base font-black text-slate-900">
                    {personalMetrics.operationsCompleted} / {personalMetrics.operationsTotal}
                  </p>
                  <p className="text-[10px] text-slate-400">Taux : {personalMetrics.operationsTotal > 0 ? Math.round((personalMetrics.operationsCompleted / personalMetrics.operationsTotal) * 100) : 100}%</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">Flux Traités (USD)</span>
                  <p className="mt-0.5 text-base font-black text-emerald-700">
                    ${personalMetrics.amountUSD.toLocaleString('fr-FR')}
                  </p>
                  <p className="text-[10px] text-slate-400">Devise USD</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">Flux Traités (CDF)</span>
                  <p className="mt-0.5 text-base font-black text-blue-700">
                    {personalMetrics.amountCDF.toLocaleString('fr-FR')} CDF
                  </p>
                  <p className="text-[10px] text-slate-400">Devise CDF</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">Écart Caisse</span>
                  <p className={`mt-0.5 text-base font-black ${personalMetrics.discrepancyUSD !== 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    ${personalMetrics.discrepancyUSD} / {personalMetrics.discrepancyCDF} CDF
                  </p>
                  <p className="text-[10px] text-slate-400">{personalMetrics.discrepancyUSD === 0 && personalMetrics.discrepancyCDF === 0 ? 'Caisse équilibrée' : 'Écart constaté'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Section 4 : Volet Adaptatif & Spécifique au Métier */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <button
              type="button"
              onClick={() => toggleSection('category')}
              className="flex w-full items-center justify-between font-bold text-slate-900 text-sm"
            >
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-600" />
                <span>4. Déclarations Spécifiques & Volet Métier Adaptatif</span>
              </div>
              {collapsedSections.category ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {!collapsedSections.category && (
              <div className="pt-1">
                <ReportAdaptiveCategoryForm
                  category={activeCategory}
                  onCategoryChange={setActiveCategory}
                  data={categoryData}
                  onChange={setCategoryData}
                />
              </div>
            )}
          </div>

          {/* Section 5 : Activités Réalisées */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection('activities')}
                className="flex items-center gap-2 font-bold text-slate-900 text-sm"
              >
                <Check className="h-4 w-4 text-emerald-600" />
                <span>5. Activités Réalisées ({activities.length})</span>
                {collapsedSections.activities ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  setActivities((cur) => [
                    ...cur,
                    {
                      id: `act-${Date.now()}-${cur.length + 1}`,
                      title: '',
                      description: '',
                      responsibleName: user?.displayName || 'Agent',
                      date: new Date().toISOString().slice(0, 10),
                      location: user?.agencyId || 'Agence',
                      status: 'realisee',
                      result: '',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" />
                <span>Ajouter une activité</span>
              </button>
            </div>

            {!collapsedSections.activities && (
              <div className="space-y-3 pt-2">
                {activities.length === 0 ? (
                  <p className="py-3 text-center text-xs text-slate-400">
                    Aucune activité ajoutée. Cliquez sur « Ajouter une activité » pour détailler vos tâches.
                  </p>
                ) : (
                  activities.map((act, idx) => (
                    <div key={act.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Activité #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setActivities((cur) => cur.filter((a) => a.id !== act.id))}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={act.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActivities((cur) => cur.map((a) => (a.id === act.id ? { ...a, title: val } : a)));
                          }}
                          placeholder="Intitulé de l'activité (ex: Accueil client & opérations de versement)"
                          className="rounded-lg border border-slate-200 p-2 text-xs"
                        />
                        <select
                          value={act.status}
                          onChange={(e) => {
                            const val = e.target.value as ActivityStatus;
                            setActivities((cur) => cur.map((a) => (a.id === act.id ? { ...a, status: val } : a)));
                          }}
                          className="rounded-lg border border-slate-200 p-2 text-xs font-semibold"
                        >
                          <option value="realisee">Réalisée</option>
                          <option value="partiellement_realisee">Partiellement réalisée</option>
                          <option value="en_cours">En cours</option>
                          <option value="non_realisee">Non réalisée</option>
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        value={act.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActivities((cur) => cur.map((a) => (a.id === act.id ? { ...a, description: val } : a)));
                        }}
                        placeholder="Description des tâches accomplies, résultat obtenu..."
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Section 6 : Résultats Obtenus & Taux de Réalisation */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection('results')}
                className="flex items-center gap-2 font-bold text-slate-900 text-sm"
              >
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span>6. Résultats Obtenus & Objectifs ({results.length})</span>
                {collapsedSections.results ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  setResults((cur) => [
                    ...cur,
                    {
                      id: `res-${Date.now()}-${cur.length + 1}`,
                      objective: '',
                      indicator: '',
                      targetValue: 10,
                      achievedValue: 10,
                      rate: 100,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" />
                <span>Ajouter un objectif</span>
              </button>
            </div>

            {!collapsedSections.results && (
              <div className="space-y-3 pt-2">
                {results.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">
                    Optionnel : ajoutez des objectifs chiffrés pour calculer automatiquement votre taux d'accomplissement.
                  </p>
                ) : (
                  results.map((res) => (
                    <div key={res.id} className="rounded-xl border border-slate-200 bg-white p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <input
                        type="text"
                        value={res.objective}
                        onChange={(e) => {
                          const val = e.target.value;
                          setResults((cur) => cur.map((r) => (r.id === res.id ? { ...r, objective: val } : r)));
                        }}
                        placeholder="Objectif (ex: Servir 30 clients)"
                        className="rounded-lg border border-slate-200 p-2 text-xs sm:col-span-2"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={res.targetValue}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const rate = val > 0 ? Math.round((res.achievedValue / val) * 100) : 0;
                            setResults((cur) => cur.map((r) => (r.id === res.id ? { ...r, targetValue: val, rate } : r)));
                          }}
                          placeholder="Prévu"
                          className="w-1/2 rounded-lg border border-slate-200 p-2 text-xs"
                        />
                        <input
                          type="number"
                          value={res.achievedValue}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const rate = res.targetValue > 0 ? Math.round((val / res.targetValue) * 100) : 0;
                            setResults((cur) => cur.map((r) => (r.id === res.id ? { ...r, achievedValue: val, rate } : r)));
                          }}
                          placeholder="Réalisé"
                          className="w-1/2 rounded-lg border border-slate-200 p-2 text-xs font-bold"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                          Taux : {res.rate}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setResults((cur) => cur.filter((r) => r.id !== res.id))}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Section 7 : Difficultés & Incidents */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection('difficulties')}
                className="flex items-center gap-2 font-bold text-slate-900 text-sm"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>7. Difficultés & Incidents Rencontrés ({difficulties.length + incidents.length})</span>
                {collapsedSections.difficulties ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  setDifficulties((cur) => [
                    ...cur,
                    {
                      id: `diff-${Date.now()}-${cur.length + 1}`,
                      issue: '',
                      date: new Date().toISOString().slice(0, 10),
                      severity: 'moyenne',
                      impact: '',
                      actionTaken: '',
                      status: 'en_cours',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" />
                <span>Signaler une difficulté</span>
              </button>
            </div>

            {!collapsedSections.difficulties && (
              <div className="space-y-3 pt-2">
                {difficulties.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">
                    Aucune difficulté ni incident signalé.
                  </p>
                ) : (
                  difficulties.map((diff) => (
                    <div key={diff.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <select
                          value={diff.severity}
                          onChange={(e) => {
                            const val = e.target.value as DifficultySeverity;
                            setDifficulties((cur) => cur.map((d) => (d.id === diff.id ? { ...d, severity: val } : d)));
                          }}
                          className="rounded-lg border border-slate-200 p-1.5 text-xs font-bold"
                        >
                          <option value="faible">Gravité Faible</option>
                          <option value="moyenne">Gravité Moyenne</option>
                          <option value="importante">Gravité Importante</option>
                          <option value="critique">Critique / Bloquant</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setDifficulties((cur) => cur.filter((d) => d.id !== diff.id))}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={diff.issue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDifficulties((cur) => cur.map((d) => (d.id === diff.id ? { ...d, issue: val } : d)));
                        }}
                        placeholder="Description du problème (ex: coupure réseau, manque de liquidités USD...)"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                      />
                      <input
                        type="text"
                        value={diff.actionTaken}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDifficulties((cur) => cur.map((d) => (d.id === diff.id ? { ...d, actionTaken: val } : d)));
                        }}
                        placeholder="Action corrective entreprise..."
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-600"
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Section 8 : Recommandations & Décisions demandées */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection('recom')}
                className="flex items-center gap-2 font-bold text-slate-900 text-sm"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>8. Recommandations & Décisions Demandées ({recommendations.length})</span>
                {collapsedSections.recom ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  setRecommendations((cur) => [
                    ...cur,
                    {
                      id: `rec-${Date.now()}-${cur.length + 1}`,
                      recommendation: '',
                      justification: '',
                      priority: 'moyenne',
                      proposedAction: '',
                      assignedTo: 'Responsable Agence',
                      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" />
                <span>Ajouter recommandation</span>
              </button>
            </div>

            {!collapsedSections.recom && (
              <div className="space-y-3 pt-2">
                {recommendations.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">
                    Optionnel : formulez des suggestions d'amélioration ou besoins matériels.
                  </p>
                ) : (
                  recommendations.map((rec) => (
                    <div key={rec.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={rec.recommendation}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRecommendations((cur) => cur.map((r) => (r.id === rec.id ? { ...r, recommendation: val } : r)));
                          }}
                          placeholder="Recommandation / proposition..."
                          className="w-full rounded-lg border border-slate-200 p-2 text-xs font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setRecommendations((cur) => cur.filter((r) => r.id !== rec.id))}
                          className="ml-2 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Section 9 : Raccordement au Billetage Officiel */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Coins className="h-4 w-4 text-amber-600" />
                <span>9. Raccordement au Billetage de Caisse</span>
              </div>
              {onOpenBilletage && (
                <button
                  type="button"
                  onClick={onOpenBilletage}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Coins className="h-3.5 w-3.5 text-amber-500" />
                  <span>Ouvrir le Billetage</span>
                </button>
              )}
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Associer un enregistrement de billetage existant (Optionnel)
              </label>
              <select
                value={linkedBilletageId}
                onChange={(e) => setLinkedBilletageId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900"
              >
                <option value="">Aucun billetage directement lié</option>
                {billetages.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.reference || b.id} — Total : {b.calculatedTotal?.toLocaleString('fr-FR')} {b.currency} ({new Date(b.createdAt).toLocaleDateString('fr-FR')})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Lier un billetage conserve la référence officielle dans le rapport sans modifier l'opération de caisse d'origine.
              </p>
            </div>
          </div>

          {/* Section 10 : Attestation d'exactitude & Certification */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <input
                id="cert-check"
                type="checkbox"
                checked={certifiedAccepted}
                onChange={(e) => setCertifiedAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="cert-check" className="text-xs text-emerald-950 font-medium">
                <strong>Attestation sur l'honneur :</strong> « Je certifie que les informations contenues dans ce rapport sont exactes selon les informations dont je dispose. »
              </label>
            </div>
            <p className="text-[10px] text-emerald-800/80">
              Conformément à la politique d'audit Ets AMANI, votre identité authentifiée ({user?.displayName || user?.email}), l'horodatage et l'adresse réseau sont consignés dans les journaux d'audit officiels.
            </p>
          </div>

          {/* Actions de sauvegarde & soumission */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveReport(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 disabled:opacity-50"
              >
                <FileEdit className="h-4 w-4 text-amber-500" />
                <span>{isSaving ? 'Enregistrement...' : 'Enregistrer le brouillon'}</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveReport(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 disabled:opacity-50"
              >
                <Send className="h-4 w-4 text-emerald-400" />
                <span>{isSaving ? 'Transmission...' : 'Soumettre officiellement'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECHERCHE & FILTRES */}
      {!showEditor && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par référence, titre, auteur..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Tous les types de rapports</option>
              {Object.entries(REPORT_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Tous les statuts</option>
              {Object.entries(REPORT_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={syncFilter}
              onChange={(e) => setSyncFilter(e.target.value as 'all' | 'pending' | 'synced')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Tous statuts de sync</option>
              <option value="pending">En attente de sync (Local)</option>
              <option value="synced">Synchronisé (Serveur)</option>
            </select>

            {isGlobalRole ? (
              <select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="all">Toutes les agences</option>
                {agencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                <Building2 className="h-4 w-4 text-slate-500" />
                <span className="truncate">{user?.agencyId || 'Agence Locale'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLEAU DE SUIVI DES AGENTS & RAPPORTS ATTENDUS (POUR ADMIN AGENCE ET DG) */}
      {!showEditor && activeTab === 'tracking' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Tableau de Bord : Rapports Attendus & Reçus par Agent
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Suivi nominatif de la conformité des déclarations, rapports soumis, validés ou retournés de l'agence.
              </p>
            </div>

            {isAgencyAdmin && (
              <button
                type="button"
                onClick={() => {
                  setConsolidationTitle(`Synthèse Agence ${user?.agencyId} — ${new Date().toLocaleDateString('fr-FR')}`);
                  setShowConsolidateModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 transition shadow-xs"
              >
                <Layers className="h-4 w-4 text-blue-300" />
                <span>Générer Synthèse Consolidée</span>
              </button>
            )}
          </div>

          {/* Synthèse des compteurs d'agence */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="text-[11px] font-semibold text-slate-500">Agents inscrits</span>
              <p className="mt-1 text-xl font-black text-slate-900">{agencyUsers.length}</p>
              <p className="text-[10px] text-slate-400">Effectif opérationnel</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5">
              <span className="text-[11px] font-semibold text-blue-700">Rapports Soumis</span>
              <p className="mt-1 text-xl font-black text-blue-950">
                {reports.filter((r) => r.status === 'soumis' || r.status === 'recu' || r.status === 'en_examen').length}
              </p>
              <p className="text-[10px] text-blue-600">En attente d'examen</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <span className="text-[11px] font-semibold text-emerald-700">Rapports Validés</span>
              <p className="mt-1 text-xl font-black text-emerald-950">
                {reports.filter((r) => r.status === 'traite' || r.status === 'valide').length}
              </p>
              <p className="text-[10px] text-emerald-600">Certifiés conformes</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
              <span className="text-[11px] font-semibold text-amber-700">Retournés / À corriger</span>
              <p className="mt-1 text-xl font-black text-amber-950">
                {reports.filter((r) => r.status === 'retourne').length}
              </p>
              <p className="text-[10px] text-amber-600">En cours d'ajustement</p>
            </div>
          </div>

          {/* Liste nominative des agents */}
          {agencyUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Aucun agent opérationnel répertorié pour cette agence dans le cache local.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 border-b border-slate-200 uppercase">
                  <tr>
                    <th className="p-3">Agent</th>
                    <th className="p-3">Fonction</th>
                    <th className="p-3">Statut Rapport</th>
                    <th className="p-3">Dernière Référence</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agencyUsers.map((ag) => {
                    const agentReps = reports.filter((r) => r.createdBy === ag.uid);
                    const latest = agentReps.length > 0 ? agentReps[0] : null;

                    return (
                      <tr key={ag.uid} className="hover:bg-slate-50/70 transition">
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">
                              {ag.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span>{ag.displayName}</span>
                              {ag.email && <p className="text-[10px] text-slate-400 font-normal">{ag.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-[11px]">
                            {FUNCTION_DISPLAY_LABELS[ag.function as UserFunction] || ag.function || 'Agent'}
                          </span>
                        </td>
                        <td className="p-3">
                          {latest ? (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                latest.status === 'traite' || latest.status === 'valide'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : latest.status === 'retourne'
                                    ? 'bg-amber-100 text-amber-900 font-black'
                                    : latest.status === 'soumis' || latest.status === 'recu'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {REPORT_STATUS_LABELS[latest.status] || latest.status}
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                              Rapport Manquant
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {latest ? (
                            <div>
                              <span className="font-bold text-blue-700">{latest.reference}</span>
                              <span className="text-slate-400 text-[10px] block">
                                {new Date(latest.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Aucun rapport soumis</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {latest && (
                              <button
                                type="button"
                                onClick={() => setSelectedReport(latest)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                              >
                                Consulter
                              </button>
                            )}
                            {latest && (latest.status === 'soumis' || latest.status === 'recu' || latest.status === 'en_examen') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(latest)}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                                >
                                  Valider
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenReturnModal(latest)}
                                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-500"
                                >
                                  Retourner
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LISTE DES RAPPORTS */}
      {!showEditor && activeTab !== 'tracking' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              {activeTab === 'drafts'
                ? `Mes Brouillons en cours (${filteredReports.length})`
                : activeTab === 'returned'
                  ? `Rapports retournés pour correction (${filteredReports.length})`
                  : activeTab === 'submitted'
                    ? `Rapports soumis en attente (${filteredReports.length})`
                    : activeTab === 'processed'
                      ? `Rapports traités & validés (${filteredReports.length})`
                      : `Tous les rapports (${filteredReports.length})`}
            </h3>
            <span className="text-xs text-slate-400">
              {filteredReports.length} élément(s) affiché(s)
            </span>
          </div>

          {filteredReports.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">Aucun rapport trouvé dans cette vue</p>
              <p className="text-xs text-slate-400 mt-1">
                {activeTab === 'returned'
                  ? 'Vous n\'avez aucun rapport en attente de correction.'
                  : activeTab === 'drafts'
                    ? 'Aucun brouillon non enregistré.'
                    : 'Cliquez sur « Nouveau Rapport » pour initier une déclaration.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredReports.map((rep) => {
                const isMine = rep.createdBy === user?.uid;
                const canEdit = canPerformReportAction('reports.edit_own', user, rep);
                const canReview = canPerformReportAction('reports.review', user, rep);

                return (
                  <div
                    key={rep.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs hover:bg-slate-50/50 p-2 rounded-xl transition"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {rep.reference}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-bold ${
                            rep.status === 'traite' || rep.status === 'valide'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rep.status === 'retourne'
                                ? 'bg-amber-200 text-amber-900 font-black'
                                : rep.status === 'soumis' || rep.status === 'recu'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {REPORT_STATUS_LABELS[rep.status] || rep.status}
                        </span>
                        {rep.priority === 'critique' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-black text-red-800">
                            Critique
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                          {REPORT_TYPE_LABELS[rep.type] || rep.type}
                        </span>
                      </div>

                      <p className="font-bold text-sm text-slate-900 truncate">{rep.title}</p>
                      <p className="text-slate-500 text-xs line-clamp-1">{rep.summary}</p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span>Auteur : <strong>{rep.createdByName}</strong> ({rep.authorFunction || rep.createdByRole})</span>
                        <span>•</span>
                        <span>Agence : <strong>{rep.agencyName}</strong></span>
                        <span>•</span>
                        <span>Date : {new Date(rep.createdAt).toLocaleDateString('fr-FR')}</span>
                        {rep.activities && rep.activities.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{rep.activities.length} activité(s)</span>
                          </>
                        )}
                      </div>

                      {/* Motif de retour si le rapport a été renvoyé */}
                      {rep.status === 'retourne' && rep.returnHistory && rep.returnHistory.length > 0 && (
                        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200">
                          <span className="font-bold">Instructions du responsable ({rep.returnHistory[rep.returnHistory.length - 1].returnedByName}) : </span>
                          <span>{rep.returnHistory[rep.returnHistory.length - 1].reason}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(rep)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                      >
                        Consulter
                      </button>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleEditReport(rep)}
                          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
                        >
                          {rep.status === 'retourne' ? 'Corriger' : 'Modifier'}
                        </button>
                      )}

                      {canReview && (rep.status === 'soumis' || rep.status === 'recu' || rep.status === 'en_examen') && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(rep)}
                            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenReturnModal(rep)}
                            className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition"
                          >
                            Retourner
                          </button>
                        </>
                      )}

                      {isMine && rep.status === 'brouillon' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDraft(rep)}
                          className="rounded-xl border border-red-200 p-1.5 text-red-600 hover:bg-red-50 transition"
                          title="Supprimer ce brouillon"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VUE DÉTAILLÉE & IMPRESSION PDF OFFICIELLE DU RAPPORT */}
      {selectedReport && !showEditor && (
        <div className="rounded-3xl border border-slate-300 bg-white p-6 sm:p-8 shadow-lg space-y-6">
          <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
            <button
              type="button"
              onClick={() => setSelectedReport(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour à la liste des rapports</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => auditPdfExport(selectedReport, user!)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimer / PDF Officiel</span>
              </button>

              {canPerformReportAction('reports.edit_own', user, selectedReport) && (
                <button
                  type="button"
                  onClick={() => handleEditReport(selectedReport)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition"
                >
                  Modifier ce rapport
                </button>
              )}
            </div>
          </div>

          {/* En-tête officiel du document */}
          <div className="border-b-2 border-slate-900 pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Ets AMANI"
                  className="h-12 w-12 object-contain rounded-xl bg-white p-1 border border-slate-200 shadow-xs"
                />
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    ETS AMANI — RAPPORT OFFICIEL
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Système Intégré de Supervision Financière & Opérationnelle
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-sm font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">
                  {selectedReport.reference}
                </span>
                <p className="mt-1 text-[11px] text-slate-400">
                  Statut : {REPORT_STATUS_LABELS[selectedReport.status]}
                </p>
              </div>
            </div>
          </div>

          {/* Fiche signalétique du rapport */}
          <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-xs">
            <div>
              <span className="text-slate-400">Intitulé : </span>
              <span className="font-bold text-slate-900">{selectedReport.title}</span>
            </div>
            <div>
              <span className="text-slate-400">Type de rapport : </span>
              <span className="font-bold text-slate-900">{REPORT_TYPE_LABELS[selectedReport.type]}</span>
            </div>
            <div>
              <span className="text-slate-400">Agence de rattachement : </span>
              <span className="font-bold text-slate-900">{selectedReport.agencyName}</span>
            </div>
            <div>
              <span className="text-slate-400">Période concernée : </span>
              <span className="font-bold text-slate-900">
                Du {new Date(selectedReport.startDate).toLocaleDateString('fr-FR')} au {new Date(selectedReport.endDate).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Auteur certifié : </span>
              <span className="font-bold text-slate-900">
                {selectedReport.createdByName} ({selectedReport.authorFunction || selectedReport.createdByRole})
              </span>
            </div>
            <div>
              <span className="text-slate-400">Horodatage de création : </span>
              <span className="font-bold text-slate-900">{new Date(selectedReport.createdAt).toLocaleString('fr-FR')}</span>
            </div>
          </div>

          {/* Résumé exécutif */}
          {selectedReport.executiveSummary && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Résumé Exécutif</h4>
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800">
                {selectedReport.executiveSummary}
              </p>
            </div>
          )}

          {/* Volet Métier Adaptatif & Déclarations Spécifiques */}
          {selectedReport.categoryData && (
            <ReportAdaptiveCategoryView data={selectedReport.categoryData} />
          )}

          {/* Activités réalisées */}
          {selectedReport.activities && selectedReport.activities.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Activités Réalisées</h4>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {selectedReport.activities.map((act) => (
                  <div key={act.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{act.title}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {act.status}
                      </span>
                    </div>
                    {act.description && <p className="text-slate-600">{act.description}</p>}
                    {act.result && <p className="text-emerald-700 font-semibold">Résultat : {act.result}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Données de Billetage lié */}
          {selectedReport.linkedBilletageRef && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs border border-amber-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-950">Billetage de Caisse Certifié Associé : </span>
                <span className="font-mono text-amber-900 font-bold">{selectedReport.linkedBilletageRef}</span>
              </div>
              {selectedReport.linkedBilletageAmount !== undefined && (
                <span className="font-bold text-emerald-800">
                  Montant : {selectedReport.linkedBilletageAmount?.toLocaleString('fr-FR')} {selectedReport.linkedBilletageCurrency}
                </span>
              )}
            </div>
          )}

          {/* Attestation officielle */}
          <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
            <div>
              <p className="font-semibold text-slate-800">Attestation d'exactitude :</p>
              <p>« Je certifie que les informations contenues dans ce rapport sont exactes selon les informations dont je dispose. »</p>
            </div>
            <div className="mt-2 sm:mt-0 text-right">
              <span className="font-bold text-slate-900">{selectedReport.createdByName}</span>
              <p className="text-[10px] text-slate-400">Signataire certifié Offline-First</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RETOUR POUR CORRECTION */}
      {showReturnModal && returnTargetReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Retourner le rapport pour correction
              </h3>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Rapport : <strong>{returnTargetReport.reference}</strong> (« {returnTargetReport.title} »)
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motif principal du retour *
              </label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Ex: Écart de caisse non justifié, pièces justificatives manquantes..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Instructions détaillées et actions attendues
              </label>
              <textarea
                rows={3}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Indiquez clairement à l'agent les corrections requises avant la resoumission..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isReturning}
                onClick={handleConfirmReturn}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
              >
                {isReturning ? 'Transmission...' : 'Confirmer le retour à l\'agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONSOLIDATION D'AGENCE */}
      {showConsolidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Générer la Synthèse Consolidée de l'Agence
              </h3>
              <button
                type="button"
                onClick={() => setShowConsolidateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Agrège automatiquement l'ensemble des rapports individuels validés ou soumis de votre agence sans modifier les rapports sources.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Titre officiel de la synthèse *
              </label>
              <input
                type="text"
                value={consolidationTitle}
                onChange={(e) => setConsolidationTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Période de consolidation
              </label>
              <select
                value={consolidationPeriod}
                onChange={(e) => setConsolidationPeriod(e.target.value as 'aujourd_hui' | '7_jours' | '30_jours')}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold"
              >
                <option value="aujourd_hui">Aujourd'hui</option>
                <option value="7_jours">7 derniers jours</option>
                <option value="30_jours">30 derniers jours (Mois)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConsolidateModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isConsolidating}
                onClick={handleConsolidateAgency}
                className="rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
              >
                {isConsolidating ? 'Consolidation en cours...' : 'Générer la Synthèse d\'Agence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
