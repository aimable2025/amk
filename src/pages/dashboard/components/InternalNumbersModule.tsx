import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  Hash,
  Info,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import {
  getAgencies,
  type Agency,
} from '../../../services/AgencyService';
import {
  getAgencyUsersByRole,
  type AgencyUser,
} from '../../../services/AgencyUserService';
import {
  assignInternalNumber,
  createInternalNumber,
  deleteInternalNumber,
  getInternalNumbers,
  setMonitoringState,
  unassignInternalNumber,
  updateInternalNumberStatus,
} from '../../../services/InternalNumberService';
import {
  fetchRemoteSmsOperations,
  getRecentSmsOperations,
  subscribeToRemoteSmsOperations,
  saveSmsOperationLocally,
  processSmsSyncQueue,
} from '../../../services/SmsOperationService';
import {
  getLocalCollectorConfig,
  setLocalCollectorConfig,
  normalizePhoneNumber,
  type CollectorDeviceConfig,
} from '../../../services/InternalNumberResolver';
import SmsReader from '../../../plugins/SmsReader';
import { verifyBiometricIdentity } from '../../../services/BiometricAuthService';
import type {
  InternalNumber,
  InternalNumberStatus,
  MobileOperator,
} from '../../../types/internalNumber';
import type { SmsOperation } from '../../../types/smsOperation';

interface InternalNumbersModuleProps {
  onClose?: () => void;
}

type TabKey = 'sms_supervision' | 'numbers_fleet' | 'collector_config' | 'collab_chat';

const OPERATORS: {
  value: MobileOperator;
  label: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  { value: 'vodacom', label: 'Vodacom (M-Pesa)', badgeBg: 'bg-red-50 text-red-700 border-red-200', badgeText: 'Vodacom' },
  { value: 'airtel', label: 'Airtel Money', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200', badgeText: 'Airtel' },
  { value: 'orange', label: 'Orange Money', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200', badgeText: 'Orange' },
  { value: 'africell', label: 'Africell Money', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200', badgeText: 'Africell' },
];

const STATUS_OPTIONS: {
  value: InternalNumberStatus;
  label: string;
}[] = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'archived', label: 'Archivé' },
];

const TARGET_VODACOM_NUMBER = '03220590';

function operatorLabel(operator: MobileOperator): string {
  return OPERATORS.find((item) => item.value === operator)?.badgeText ?? operator;
}

function operatorBadgeClasses(operator: MobileOperator): string {
  return OPERATORS.find((item) => item.value === operator)?.badgeBg ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

function statusLabel(status: InternalNumberStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function statusClasses(status: InternalNumberStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'suspended':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'archived':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'inactive':
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
}

interface CollaborationMessage {
  id: string;
  channelId: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  senderPhotoURL?: string | null;
  text: string;
  createdAt: number;
}

const COLLAB_CHANNELS = [
  { id: 'direction-generale', label: 'Direction & Supervision', roleBadge: 'DG' },
  { id: 'guichet-operations', label: 'Guichet & Opérations', roleBadge: 'AG' },
  { id: 'tresorerie-billetage', label: 'Trésorerie & Billetage', roleBadge: 'CA' },
];

const LOCAL_COLLAB_KEY = 'ets_amani_internal_collab_messages_v1';

function loadCollabMessages(): CollaborationMessage[] {
  try {
    const raw = localStorage.getItem(LOCAL_COLLAB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function InternalNumbersModule({
  onClose,
}: InternalNumbersModuleProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('sms_supervision');

  const [numbers, setNumbers] = useState<InternalNumber[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agents, setAgents] = useState<Record<string, AgencyUser[]>>({});
  const [teamMembers, setTeamMembers] = useState<ManagedUser[]>([]);
  const [smsOperations, setSmsOperations] = useState<SmsOperation[]>([]);

  // Filtres Supervision SMS
  const [filterInternalNumber, setFilterInternalNumber] = useState<string>('all');
  const [filterAgency, setFilterAgency] = useState<string>('all');
  const [filterOperator, setFilterOperator] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [filterSyncStatus, setFilterSyncStatus] = useState<string>('all');
  const [filterReconciliation, setFilterReconciliation] = useState<string>('all');
  const [smsSearch, setSmsSearch] = useState<string>('');

  // Détail d'un SMS sélectionné
  const [selectedSms, setSelectedSms] = useState<SmsOperation | null>(null);

  // Configuration Appareil Collecteur local
  const [collectorConfig, setCollectorConfigState] = useState<CollectorDeviceConfig | null>(() =>
    getLocalCollectorConfig()
  );
  const [collectorInternalNumberId, setCollectorInternalNumberId] = useState<string>('');
  const [collectorDeviceLabel, setCollectorDeviceLabel] = useState<string>('');
  const [permissionStatus, setPermissionStatus] = useState<{
    receiveSms?: boolean;
    readSms?: boolean;
    granted?: boolean;
  } | null>(null);

  // Création d'un numéro interne
  const [showForm, setShowForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [operator, setOperator] = useState<MobileOperator>('vodacom');
  const [agencyId, setAgencyId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  // Collaboration Chat
  const [activeChannelId, setActiveChannelId] = useState<string>('direction-generale');
  const [collabMessages, setCollabMessages] = useState<CollaborationMessage[]>(() =>
    loadCollabMessages()
  );
  const [messageInput, setMessageInput] = useState('');

  // États UI
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [smsRefreshing, setSmsRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteNumber, setConfirmDeleteNumber] = useState<InternalNumber | null>(null);

  const isDG = user?.role === 'directeur_general' || user?.role === 'administrateur_systeme';
  const userAgencyId = user?.agencyId ?? null;

  // Détection du numéro Vodacom 03220590
  const vodacomTargetNumber = useMemo(() => {
    const targetNorm = normalizePhoneNumber(TARGET_VODACOM_NUMBER);
    return numbers.find(
      (n) => n.operator === 'vodacom' && normalizePhoneNumber(n.phoneNumber) === targetNorm
    );
  }, [numbers]);

  // Chargement des données de flotte et agents
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [internalNumbers, agencyList, allUsers] = await Promise.all([
        getInternalNumbers(),
        getAgencies(),
        getAllSystemUsers().catch(() => []),
      ]);
      setNumbers(internalNumbers);
      setAgencies(agencyList);
      setTeamMembers(allUsers);

      const agentEntries = await Promise.all(
        agencyList.map(async (agency) => {
          try {
            const agencyAgents = await getAgencyUsersByRole(agency.id, 'agent');
            return [
              agency.id,
              agencyAgents.filter(
                (agent) =>
                  agent.status !== 'disabled' &&
                  agent.status !== 'suspended' &&
                  agent.isApproved
              ),
            ] as const;
          } catch {
            return [agency.id, []] as const;
          }
        })
      );
      setAgents(Object.fromEntries(agentEntries));

      // Charger la configuration de collecteur
      const currentConfig = getLocalCollectorConfig();
      setCollectorConfigState(currentConfig);
      if (currentConfig?.internalNumberId) {
        setCollectorInternalNumberId(currentConfig.internalNumberId);
      }
      if (currentConfig?.deviceName) {
        setCollectorDeviceLabel(currentConfig.deviceName);
      }

      // Vérifier les permissions Android si natif
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await SmsReader.checkPermissions();
          setPermissionStatus(perm);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('[Ets AMANI] Erreur chargement numéros internes :', err);
      setError('Impossible de charger les numéros internes.');
    } finally {
      setLoading(false);
    }
  };

  // Chargement et rafraîchissement des SMS distants Firestore
  const refreshRemoteSms = async () => {
    try {
      setSmsRefreshing(true);
      const remoteSms = await fetchRemoteSmsOperations({
        agencyId: !isDG && userAgencyId ? userAgencyId : undefined,
      });
      setSmsOperations(remoteSms);
    } catch (err) {
      console.warn('[Ets AMANI] Erreur rafraîchissement SMS :', err);
      const cached = await getRecentSmsOperations(100);
      setSmsOperations(cached);
    } finally {
      setSmsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
    void refreshRemoteSms();

    // Écoute temps-réel Firestore pour le Directeur Général et les Superviseurs
    const unsubscribe = subscribeToRemoteSmsOperations(
      (updatedList) => {
        setSmsOperations(updatedList);
      },
      !isDG && userAgencyId ? userAgencyId : undefined
    );

    return () => {
      unsubscribe();
    };
  }, [isDG, userAgencyId]);

  const agencyMap = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency])),
    [agencies]
  );

  const numberMap = useMemo(
    () => new Map(numbers.map((num) => [num.id, num])),
    [numbers]
  );

  // Filtrage des SMS Opérateurs pour la Supervision
  const filteredSmsOperations = useMemo(() => {
    return smsOperations.filter((sms) => {
      // 1. Périmètre agence si non DG
      if (!isDG && userAgencyId && sms.agencyId && sms.agencyId !== userAgencyId) {
        return false;
      }

      // 2. Filtre Numéro Interne
      if (filterInternalNumber !== 'all' && sms.internalNumberId !== filterInternalNumber) {
        return false;
      }

      // 3. Filtre Opérateur
      if (filterOperator !== 'all' && sms.operator !== filterOperator) {
        return false;
      }

      // 4. Filtre Agence
      if (filterAgency !== 'all' && sms.agencyId !== filterAgency) {
        return false;
      }

      // 5. Filtre État de Synchronisation
      if (filterSyncStatus !== 'all' && sms.syncStatus !== filterSyncStatus) {
        return false;
      }

      // 6. Filtre État de Rapprochement
      if (filterReconciliation !== 'all') {
        const currentReconciliation = sms.reconciliationStatus || 'unmatched';
        if (currentReconciliation !== filterReconciliation) {
          return false;
        }
      }

      // 7. Filtre Période
      if (filterPeriod !== 'all') {
        const now = Date.now();
        const smsTime = sms.receivedAt || sms.operationDate || 0;
        if (filterPeriod === 'today') {
          const startOfToday = new Date().setHours(0, 0, 0, 0);
          if (smsTime < startOfToday) return false;
        } else if (filterPeriod === '7_days') {
          if (now - smsTime > 7 * 24 * 3600 * 1000) return false;
        } else if (filterPeriod === '30_days') {
          if (now - smsTime > 30 * 24 * 3600 * 1000) return false;
        }
      }

      // 8. Recherche Textuelle
      if (smsSearch.trim()) {
        const query = smsSearch.trim().toLowerCase();
        const matchedNum = numberMap.get(sms.internalNumberId);
        const matchFound = [
          sms.rawMessage,
          sms.transactionReference || '',
          sms.sender || '',
          sms.operator,
          matchedNum?.phoneNumber || '',
          matchedNum?.label || '',
          sms.amount ? String(sms.amount) : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);

        if (!matchFound) return false;
      }

      return true;
    });
  }, [
    smsOperations,
    isDG,
    userAgencyId,
    filterInternalNumber,
    filterOperator,
    filterAgency,
    filterSyncStatus,
    filterReconciliation,
    filterPeriod,
    smsSearch,
    numberMap,
  ]);

  // Statistiques clés pour la supervision
  const stats = useMemo(() => {
    let totalUSD = 0;
    let totalCDF = 0;
    let unmatchedCount = 0;
    let matchedCount = 0;
    let pendingSyncCount = 0;

    for (const sms of filteredSmsOperations) {
      if (sms.amount) {
        if (sms.currency === 'CDF') {
          totalCDF += sms.amount;
        } else {
          totalUSD += sms.amount;
        }
      }
      if (sms.reconciliationStatus === 'matched' || sms.reconciliationStatus === 'validated') {
        matchedCount++;
      } else {
        unmatchedCount++;
      }
      if (sms.syncStatus === 'pending') {
        pendingSyncCount++;
      }
    }

    return {
      totalCount: filteredSmsOperations.length,
      unmatchedCount,
      matchedCount,
      pendingSyncCount,
      totalUSD,
      totalCDF,
    };
  }, [filteredSmsOperations]);

  // Filtrage Flotte des Numéros Internes
  const filteredNumbers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) {
      return numbers;
    }
    return numbers.filter((number) => {
      const agency = number.agencyId ? agencyMap.get(number.agencyId) : undefined;
      const agencyName = agency?.name ?? '';
      return [
        number.phoneNumber,
        number.operator,
        number.label ?? '',
        number.description ?? '',
        number.assignedUserName ?? '',
        agencyName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(value);
    });
  }, [numbers, search, agencyMap]);

  const resetForm = () => {
    setPhoneNumber('');
    setOperator('vodacom');
    setAgencyId('');
    setLabel('');
    setDescription('');
    setShowForm(false);
  };

  const handlePreFillVodacom03220590 = () => {
    setPhoneNumber(TARGET_VODACOM_NUMBER);
    setOperator('vodacom');
    setLabel('Numéro Principal Vodacom M-Pesa');
    setDescription('Ligne professionnelle officielle Ets AMANI pour la réception et supervision des SMS M-Pesa.');
    setShowForm(true);
    setActiveTab('numbers_fleet');
  };

  const handleCreate = async () => {
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone) {
      setError('Veuillez saisir le numéro interne.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createInternalNumber({
        phoneNumber: normalizedPhone,
        operator,
        agencyId: agencyId.trim() || null,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
        createdBy: user?.displayName || 'Directeur Général',
      });
      setSuccessMessage(`Numéro interne ${normalizedPhone} enregistré avec succès.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      resetForm();
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Création numéro interne impossible :', err);
      setError('Impossible de créer le numéro interne.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (number: InternalNumber, selectedUserId: string) => {
    try {
      setActionId(number.id);
      setError(null);
      if (!selectedUserId) {
        await unassignInternalNumber(number.id);
      } else {
        const agencyAgents = number.agencyId ? agents[number.agencyId] ?? [] : [];
        const selectedAgent = agencyAgents.find(
          (agent) => agent.uid === selectedUserId
        );
        if (!selectedAgent) {
          throw new Error('Agent introuvable.');
        }
        await assignInternalNumber(
          number.id,
          selectedAgent.uid,
          selectedAgent.displayName
        );
      }
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Affectation numéro impossible :', err);
      setError('Impossible de modifier l affectation du numéro.');
    } finally {
      setActionId(null);
    }
  };

  const handleMonitoring = async (number: InternalNumber) => {
    try {
      setActionId(number.id);
      setError(null);
      await setMonitoringState(number.id, !number.monitoringEnabled);
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Modification surveillance impossible :', err);
      setError('Impossible de modifier la surveillance.');
    } finally {
      setActionId(null);
    }
  };

  const handleStatus = async (
    number: InternalNumber,
    status: InternalNumberStatus
  ) => {
    try {
      setActionId(number.id);
      setError(null);
      await updateInternalNumberStatus(number.id, status);
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Modification statut impossible :', err);
      setError('Impossible de modifier le statut.');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (number: InternalNumber) => {
    try {
      setActionId(number.id);
      setError(null);
      if (user) {
        await verifyBiometricIdentity({
          user,
          actionTitle: 'Suppression Ligne Interne',
          actionDescription: `Suppression définitive du numéro ${number.phoneNumber} (${number.operator.toUpperCase()})`,
        });
      }
      await deleteInternalNumber(number.id);
      setConfirmDeleteNumber(null);
      await loadData();
    } catch (err: any) {
      console.error('[Ets AMANI] Suppression numéro impossible :', err);
      setError(err?.message || 'Impossible de supprimer le numéro interne.');
    } finally {
      setActionId(null);
    }
  };

  // Enregistrement de l'appareil courant comme appareil collecteur
  const handleSaveCollectorConfig = async () => {
    try {
      setSaving(true);
      setError(null);
      const selectedNum = numbers.find((n) => n.id === collectorInternalNumberId);
      const config: CollectorDeviceConfig = {
        internalNumberId: collectorInternalNumberId || undefined,
        phoneNumber: selectedNum?.phoneNumber,
        deviceName: collectorDeviceLabel.trim() || 'Appareil Collecteur Source',
        agencyId: selectedNum?.agencyId ?? null,
      };

      await setLocalCollectorConfig(config);
      setCollectorConfigState(config);
      setSuccessMessage('Terminal collecteur configuré avec succès pour cet appareil.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('[Ets AMANI] Erreur configuration collecteur :', err);
      setError('Impossible d enregistrer la configuration du collecteur.');
    } finally {
      setSaving(false);
    }
  };

  // Demande des permissions SMS Android
  const handleRequestPermissions = async () => {
    try {
      setError(null);
      await SmsReader.requestPermissions();
      const status = await SmsReader.checkPermissions();
      setPermissionStatus(status);
    } catch (err) {
      console.error('[Ets AMANI] Erreur demande permissions :', err);
      setError('Impossible de solliciter les permissions système.');
    }
  };

  // Simulation contrôlée de réception SMS Vodacom M-Pesa (utilisable pour tests & validation)
  const handleSimulateVodacomSms = async () => {
    try {
      setSaving(true);
      const now = Date.now();
      const randomRef = `MP${Math.floor(100000 + Math.random() * 900000)}.${Math.floor(1000 + Math.random() * 9000)}.A${Math.floor(10000 + Math.random() * 90000)}`;
      const randomAmount = [25, 50, 100, 250, 500][Math.floor(Math.random() * 5)];
      const rawMsg = `Trans. ID: ${randomRef}. Vous avez recu ${randomAmount}.00 USD de 243815550199 le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}. Nouveau solde: ${(randomAmount + 1200).toFixed(2)} USD.`;

      const targetNum = vodacomTargetNumber || numbers.find((n) => n.operator === 'vodacom') || numbers[0];
      if (!targetNum) {
        setError('Veuillez d abord enregistrer le numéro Vodacom 03220590 avant de tester la réception.');
        return;
      }

      await saveSmsOperationLocally({
        id: `sms_sim_${now}_${Math.random().toString(36).slice(2, 7)}`,
        internalNumberId: targetNum.id,
        receiverPhoneNumber: targetNum.phoneNumber,
        agencyId: targetNum.agencyId,
        operator: 'vodacom',
        sender: 'M-PESA',
        rawMessage: rawMsg,
        transactionReference: randomRef,
        amount: randomAmount,
        currency: 'USD',
        transactionType: 'depot',
        operationDate: now,
        receivedAt: now,
        processedAt: now,
        collectorDeviceId: targetNum.id,
        collectorDeviceName: 'Terminal Source Vodacom (03220590)',
        status: 'identified',
        reconciliationStatus: 'unmatched',
        syncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      });

      await processSmsSyncQueue();
      await refreshRemoteSms();
      setSuccessMessage(`SMS test M-Pesa (${randomRef} - ${randomAmount} USD) injecté et synchronisé.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('[Ets AMANI] Erreur simulation SMS :', err);
      setError('Échec de l injection du SMS test.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCollabMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user) return;
    const newMsg: CollaborationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      channelId: activeChannelId,
      senderUid: user.uid,
      senderName: user.displayName || 'Intervenant',
      senderRole: user.role,
      senderPhotoURL: user.photoURL || null,
      text: messageInput.trim(),
      createdAt: Date.now(),
    };
    const next = [...collabMessages, newMsg];
    setCollabMessages(next);
    try {
      localStorage.setItem(LOCAL_COLLAB_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      // ignore
    }
    setMessageInput('');
  };

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      aria-label="Supervision des flux SMS Opérateurs et numéros internes"
    >
      {/* En-tête Principal */}
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <img
            src="/logo.png"
            alt="Ets AMANI"
            className="h-12 w-12 shrink-0 object-contain rounded-2xl border border-slate-200 bg-white p-1 shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                Supervision SMS & Numéros Internes
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Lecture Seule
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Contrôle interne, traçabilité et flux SMS transmis depuis les téléphones sources vers la Direction Générale.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void loadData();
              void refreshRemoteSms();
            }}
            disabled={loading || smsRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || smsRefreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setActiveTab('numbers_fleet');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouveau numéro
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
            >
              <X className="h-3.5 w-3.5" />
              Fermer
            </button>
          )}
        </div>
      </div>

      {/* Barre d'onglets */}
      <div className="flex border-b border-slate-200 bg-white px-5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('sms_supervision')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'sms_supervision'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="h-4 w-4" />
          Supervision des SMS Opérateurs
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 font-bold">
            {smsOperations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('numbers_fleet')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'numbers_fleet'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Phone className="h-4 w-4" />
          Flotte des Numéros ({numbers.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('collector_config')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'collector_config'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Smartphone className="h-4 w-4" />
          Terminal Collecteur (SIM)
          {collectorConfig?.phoneNumber && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('collab_chat')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'collab_chat'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Messagerie Interne
        </button>
      </div>

      <div className="p-5">
        {/* Messages d'erreur & succès */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
            <button type="button" onClick={() => setSuccessMessage(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Bannière Détection Vodacom 03220590 */}
        {!vodacomTargetNumber ? (
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-900">
                  Numéro Vodacom 03220590 non configuré
                </h4>
                <p className="mt-0.5 text-xs text-amber-800">
                  Ce numéro est le premier canal cible pour la collecte des SMS M-Pesa. Enregistrez-le pour permettre sa collecte par le terminal dédié.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePreFillVodacom03220590}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-800 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Configurer 03220590
            </button>
          </div>
        ) : (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-bold text-slate-900">Numéro de référence Vodacom {vodacomTargetNumber.phoneNumber}</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                {vodacomTargetNumber.monitoringEnabled ? 'Surveillance Active' : 'Surveillance Inactive'}
              </span>
              <span className="text-slate-600">
                Agence : <strong className="text-slate-800">{vodacomTargetNumber.agencyId ? agencyMap.get(vodacomTargetNumber.agencyId)?.name ?? 'Non affectée' : 'Non affectée'}</strong>
              </span>
              <span className="text-slate-600">
                Agent : <strong className="text-slate-800">{vodacomTargetNumber.assignedUserName || 'Non affecté'}</strong>
              </span>
            </div>
            {(!vodacomTargetNumber.agencyId || !vodacomTargetNumber.assignedUserId) && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                Champs à compléter dans l'onglet Flotte
              </span>
            )}
          </div>
        )}

        {/* ONGLET 1 : SUPERVISION DES SMS OPÉRATEURS */}
        {activeTab === 'sms_supervision' && (
          <div className="space-y-5">
            {/* Statistiques Rapides */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total SMS</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{stats.totalCount}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Captés & transmis</p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Non Rapprochés</p>
                <p className="mt-1 text-2xl font-black text-amber-800">{stats.unmatchedCount}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">En attente rapprochement</p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Rapprochés</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{stats.matchedCount}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Vérifiés avec opérations</p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Volume USD</p>
                <p className="mt-1 text-xl font-black text-blue-900">
                  {stats.totalUSD.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} $
                </p>
                <p className="text-[10px] text-blue-600 mt-0.5">Montants détectés</p>
              </div>

              <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Volume CDF</p>
                <p className="mt-1 text-xl font-black text-purple-900">
                  {stats.totalCDF.toLocaleString('fr-FR')} FC
                </p>
                <p className="text-[10px] text-purple-600 mt-0.5">Montants détectés</p>
              </div>
            </div>

            {/* Barre de Filtres */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Filter className="h-4 w-4 text-emerald-600" />
                  <span>Filtres de supervision</span>
                </div>
                {(filterInternalNumber !== 'all' ||
                  filterAgency !== 'all' ||
                  filterOperator !== 'all' ||
                  filterPeriod !== 'all' ||
                  filterSyncStatus !== 'all' ||
                  filterReconciliation !== 'all' ||
                  smsSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterInternalNumber('all');
                      setFilterAgency('all');
                      setFilterOperator('all');
                      setFilterPeriod('all');
                      setFilterSyncStatus('all');
                      setFilterReconciliation('all');
                      setSmsSearch('');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
                {/* Recherche */}
                <div className="lg:col-span-2">
                  <input
                    type="search"
                    value={smsSearch}
                    onChange={(e) => setSmsSearch(e.target.value)}
                    placeholder="Recherche référence, montant, expéditeur..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                  />
                </div>

                {/* Filtre Numéro Interne */}
                <div>
                  <select
                    value={filterInternalNumber}
                    onChange={(e) => setFilterInternalNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                  >
                    <option value="all">Tous numéros internes</option>
                    {numbers.map((num) => (
                      <option key={num.id} value={num.id}>
                        {num.phoneNumber} ({operatorLabel(num.operator)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtre Agence */}
                {isDG && (
                  <div>
                    <select
                      value={filterAgency}
                      onChange={(e) => setFilterAgency(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                    >
                      <option value="all">Toutes les agences</option>
                      {agencies.map((agency) => (
                        <option key={agency.id} value={agency.id}>
                          {agency.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Filtre Opérateur */}
                <div>
                  <select
                    value={filterOperator}
                    onChange={(e) => setFilterOperator(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                  >
                    <option value="all">Tous opérateurs</option>
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtre Période */}
                <div>
                  <select
                    value={filterPeriod}
                    onChange={(e) => setFilterPeriod(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                  >
                    <option value="all">Toutes périodes</option>
                    <option value="today">Aujourd'hui</option>
                    <option value="7_days">7 derniers jours</option>
                    <option value="30_days">30 derniers jours</option>
                  </select>
                </div>

                {/* Filtre Rapprochement */}
                <div>
                  <select
                    value={filterReconciliation}
                    onChange={(e) => setFilterReconciliation(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                  >
                    <option value="all">Tous rapprochements</option>
                    <option value="unmatched">Non rapproché</option>
                    <option value="matched">Rapproché</option>
                    <option value="discrepancy">Divergence / Écart</option>
                    <option value="validated">Validé supervision</option>
                  </select>
                </div>

                {/* Filtre Synchronisation */}
                <div>
                  <select
                    value={filterSyncStatus}
                    onChange={(e) => setFilterSyncStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none"
                  >
                    <option value="all">Tous états synchro</option>
                    <option value="synced">Synchronisé (Cloud)</option>
                    <option value="pending">En attente (File locale)</option>
                    <option value="failed">Échoué / À retenter</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tableau de supervision des SMS */}
            {filteredSmsOperations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <Activity className="mx-auto h-8 w-8 text-slate-400" />
                <h4 className="mt-2 font-bold text-slate-900">Aucun SMS opérateur ne correspond aux filtres</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Les SMS financiers collectés par les appareils sources apparaîtront ici dès leur réception.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSimulateVodacomSms()}
                    className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                  >
                    Simuler un SMS M-Pesa (Test de réception)
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-600">
                      <th className="py-3 px-3.5">Numéro Interne & Agence</th>
                      <th className="py-3 px-3.5">Date & Heure</th>
                      <th className="py-3 px-3.5">Expéditeur</th>
                      <th className="py-3 px-3.5">Montant & Devise</th>
                      <th className="py-3 px-3.5">Réf. Transaction</th>
                      <th className="py-3 px-3.5">Message original</th>
                      <th className="py-3 px-3.5">Source & Synchro</th>
                      <th className="py-3 px-3.5">Rapprochement</th>
                      <th className="py-3 px-3.5 text-right">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSmsOperations.map((sms) => {
                      const internalNum = numberMap.get(sms.internalNumberId);
                      const agency = sms.agencyId ? agencyMap.get(sms.agencyId) : (internalNum?.agencyId ? agencyMap.get(internalNum.agencyId) : undefined);
                      const dateObj = new Date(sms.receivedAt || sms.operationDate || Date.now());

                      return (
                        <tr key={sms.id} className="hover:bg-slate-50/80 transition">
                          {/* Numéro Interne & Opérateur */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <Phone className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{internalNum?.phoneNumber || sms.receiverPhoneNumber || 'Numéro interne'}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${operatorBadgeClasses(sms.operator)}`}>
                                {operatorLabel(sms.operator)}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                                {agency?.name ?? 'Sans agence'}
                              </span>
                            </div>
                          </td>

                          {/* Date & Heure */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <p className="font-semibold text-slate-800">
                              {dateObj.toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {dateObj.toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </p>
                          </td>

                          {/* Expéditeur */}
                          <td className="py-3 px-3.5 whitespace-nowrap font-medium text-slate-800">
                            {sms.sender || <span className="text-slate-400 italic">Indisponible</span>}
                          </td>

                          {/* Montant & Devise */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {sms.amount !== undefined && sms.amount !== null ? (
                              <span className="font-black text-slate-900 text-sm">
                                {sms.amount.toLocaleString('fr-FR')} {sms.currency || 'USD'}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Indisponible</span>
                            )}
                            {sms.transactionType && (
                              <span className="block text-[10px] font-semibold uppercase text-slate-500">
                                {sms.transactionType}
                              </span>
                            )}
                          </td>

                          {/* Référence */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {sms.transactionReference ? (
                              <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-800 border border-slate-200">
                                {sms.transactionReference}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Indisponible</span>
                            )}
                          </td>

                          {/* Message Original */}
                          <td className="py-3 px-3.5 max-w-xs">
                            <p className="line-clamp-2 text-slate-600 text-[11px] leading-relaxed">
                              {sms.rawMessage}
                            </p>
                          </td>

                          {/* Source & Synchro */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {sms.syncStatus === 'synced' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                  <Check className="h-3 w-3" />
                                  Synchronisé
                                </span>
                              ) : sms.syncStatus === 'failed' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                                  <AlertTriangle className="h-3 w-3" />
                                  Échoué
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                  <Clock className="h-3 w-3" />
                                  En attente
                                </span>
                              )}
                            </div>
                            <span className="mt-0.5 block text-[10px] text-slate-400 truncate max-w-[130px]">
                              {sms.collectorDeviceName || 'Terminal Source'}
                            </span>
                          </td>

                          {/* Rapprochement */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {sms.reconciliationStatus === 'matched' || sms.reconciliationStatus === 'validated' ? (
                              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                Rapproché
                              </span>
                            ) : sms.reconciliationStatus === 'discrepancy' ? (
                              <span className="rounded-md bg-red-100 px-2 py-0.5 font-bold text-red-800">
                                Écart détecté
                              </span>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                Non rapproché
                              </span>
                            )}
                          </td>

                          {/* Action détail */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedSms(sms)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Audit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Note de contrôle interne */}
            <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 leading-relaxed">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <div>
                <strong className="block font-bold">Règle de Contrôle Interne & Supervision :</strong>
                Un SMS opérateur reçu par l'appareil collecteur est un indicateur de traçabilité externe. Il ne constitue jamais une preuve définitive du succès d'une opération financière tant qu'il n'est pas rapproché avec l'opération validée en caisse. Ets AMANI ne réalise aucune commande USSD ni transaction financière.
              </div>
            </div>
          </div>
        )}

        {/* ONGLET 2 : FLOTTE DES NUMÉROS INTERNES */}
        {activeTab === 'numbers_fleet' && (
          <div className="space-y-5">
            {/* Formulaire d'ajout d'un numéro */}
            {showForm && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                <div className="mb-4">
                  <h3 className="font-bold text-slate-900">
                    Ajouter un numéro interne
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Enregistrez un numéro professionnel officiellement géré par Ets AMANI (ex: Vodacom 03220590).
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      Numéro de téléphone <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Ex: 03220590 ou +243..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      Opérateur Mobile <span className="text-red-500">*</span>
                    </span>
                    <select
                      value={operator}
                      onChange={(e) => setOperator(e.target.value as MobileOperator)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                    >
                      {OPERATORS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      Agence de rattachement
                    </span>
                    <select
                      value={agencyId}
                      onChange={(e) => setAgencyId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                    >
                      <option value="">Sélectionner une agence...</option>
                      {agencies.map((agency) => (
                        <option key={agency.id} value={agency.id}>
                          {agency.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      Libellé / Rôle du numéro
                    </span>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Ex: Numéro Guichet Vodacom M-Pesa"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      Description & Instructions d'exploitation
                    </span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Précisions sur l'utilisation du numéro ou terminal associé..."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Enregistrer le numéro
                  </button>
                </div>
              </div>
            )}

            {/* Barre de recherche */}
            <div className="flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par numéro, agence, opérateur, agent..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs outline-none focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-200"
              />
            </div>

            {/* Liste des numéros */}
            {loading ? (
              <div className="flex min-h-36 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  Chargement des numéros internes...
                </div>
              </div>
            ) : filteredNumbers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Phone className="mx-auto h-7 w-7 text-slate-400" />
                <h4 className="mt-2 text-xs font-bold text-slate-900">Aucun numéro interne enregistré</h4>
                <p className="mt-1 text-xs text-slate-500">Commencez par ajouter le numéro Vodacom 03220590.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNumbers.map((number) => {
                  const agency = number.agencyId ? agencyMap.get(number.agencyId) : undefined;
                  const agencyAgents = number.agencyId ? agents[number.agencyId] ?? [] : [];
                  const busy = actionId === number.id;
                  const isVodacomTarget = normalizePhoneNumber(number.phoneNumber) === normalizePhoneNumber(TARGET_VODACOM_NUMBER);

                  return (
                    <div
                      key={number.id}
                      className={`rounded-2xl border p-4 shadow-xs transition ${
                        isVodacomTarget
                          ? 'border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <Phone className="h-4 w-4 text-emerald-600" />
                              <span className="text-sm">{number.phoneNumber}</span>
                            </div>
                            <span className={`rounded px-2 py-0.5 text-xs font-bold border ${operatorBadgeClasses(number.operator)}`}>
                              {operatorLabel(number.operator)}
                            </span>
                            <span className={`rounded px-2 py-0.5 text-xs font-bold border ${statusClasses(number.status)}`}>
                              {statusLabel(number.status)}
                            </span>
                            {number.monitoringEnabled && (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                                <Activity className="h-3 w-3" />
                                Surveillance SMS Active
                              </span>
                            )}
                            {isVodacomTarget && (
                              <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                                Numéro Référence M-Pesa
                              </span>
                            )}
                          </div>

                          {number.label && (
                            <p className="mt-1 text-xs font-semibold text-slate-700">{number.label}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              {agency?.name ?? <span className="text-amber-600 italic">Aucune agence</span>}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              {number.assignedUserName ? (
                                <UserAvatar
                                  name={number.assignedUserName}
                                  photoURL={
                                    agencyAgents.find((a) => a.uid === number.assignedUserId)?.photoURL
                                  }
                                  size="xs"
                                />
                              ) : (
                                <UserRound className="h-3.5 w-3.5 text-slate-400" />
                              )}
                              <span className="font-medium text-slate-700">
                                {number.assignedUserName ?? <span className="text-amber-600 italic">Agent non affecté</span>}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 xl:min-w-[340px]">
                          {number.agencyId && (
                            <select
                              value={number.assignedUserId ?? ''}
                              disabled={busy}
                              onChange={(e) => void handleAssign(number, e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none"
                            >
                              <option value="">Aucun agent affecté</option>
                              {agencyAgents.map((agent) => (
                                <option key={agent.uid} value={agent.uid}>
                                  {agent.displayName} {agent.function ? ` — ${agent.function}` : ''}
                                </option>
                              ))}
                            </select>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleMonitoring(number)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                                number.monitoringEnabled
                                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              <Activity className="h-3 w-3" />
                              {number.monitoringEnabled ? 'Surveillance Active' : 'Activer Surveillance'}
                            </button>

                            <select
                              value={number.status}
                              disabled={busy}
                              onChange={(e) => void handleStatus(number, e.target.value as InternalNumberStatus)}
                              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                            >
                              {STATUS_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteNumber(number)}
                              className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 border border-red-200"
                            >
                              <Trash2 className="h-3 w-3" />
                              Supprimer
                            </button>

                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ONGLET 3 : CONFIGURATION TERMINAL COLLECTEUR (SIM) */}
        {activeTab === 'collector_config' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Association de l'Appareil Collecteur Source
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                    Le téléphone qui contient physiquement la carte SIM (ex: Vodacom 03220590) est l'appareil collecteur.
                    Comme l'API Android ne garantit pas toujours la lecture du numéro de la SIM, configurez explicitement ici l'association entre ce terminal et le numéro interne supervisé.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">
                    Numéro interne affecté à ce terminal
                  </span>
                  <select
                    value={collectorInternalNumberId}
                    onChange={(e) => setCollectorInternalNumberId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs outline-none"
                  >
                    <option value="">Sélectionner le numéro interne collecté...</option>
                    {numbers.map((num) => (
                      <option key={num.id} value={num.id}>
                        {num.phoneNumber} — {operatorLabel(num.operator)} {num.label ? `(${num.label})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">
                    Nom / Identifiant du terminal source
                  </span>
                  <input
                    type="text"
                    value={collectorDeviceLabel}
                    onChange={(e) => setCollectorDeviceLabel(e.target.value)}
                    placeholder="Ex: Terminal Collecteur Vodacom (03220590)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-500">
                  État actuel :{' '}
                  <strong className="text-slate-800">
                    {collectorConfig?.phoneNumber
                      ? `Associé à ${collectorConfig.phoneNumber} (${collectorConfig.deviceName || 'Terminal Source'})`
                      : 'Aucun numéro configuré sur cet appareil'}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveCollectorConfig()}
                  disabled={saving || !collectorInternalNumberId}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Valider l'association collecteur
                </button>
              </div>
            </div>

            {/* État des permissions Android */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    État des autorisations Android (SMS & Téléphonie)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Permissions requises sur l'appareil source pour capter les SMS opérateurs
                  </p>
                </div>
                {Capacitor.isNativePlatform() && (
                  <button
                    type="button"
                    onClick={() => void handleRequestPermissions()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-xs"
                  >
                    Demander les autorisations
                  </button>
                )}
              </div>

              {Capacitor.isNativePlatform() ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">RECEIVE_SMS</span>
                    <span className={`font-bold mt-1 block ${permissionStatus?.receiveSms ? 'text-emerald-700' : 'text-red-600'}`}>
                      {permissionStatus?.receiveSms ? 'Accordée' : 'Non accordée'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">READ_SMS</span>
                    <span className={`font-bold mt-1 block ${permissionStatus?.readSms ? 'text-emerald-700' : 'text-red-600'}`}>
                      {permissionStatus?.readSms ? 'Accordée' : 'Non accordée'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Capacitor Native</span>
                    <span className="font-bold mt-1 block text-emerald-700">Actif (Android)</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Background Queue</span>
                    <span className="font-bold mt-1 block text-emerald-700">SharedPreferences & Dexie</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center justify-between">
                  <span>
                    Environnement Web / Dashboard DG détecté. Le plugin Android natif s'activera lors de l'exécution sur l'appareil physique Android.
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSimulateVodacomSms()}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    Tester la réception SMS Vodacom
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ONGLET 4 : MESSAGERIE & COLLABORATION D'AGENCE */}
        {activeTab === 'collab_chat' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Canaux et membres */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Canaux opérationnels
                </p>
                <div className="space-y-1">
                  {COLLAB_CHANNELS.map((ch) => {
                    const isActive = activeChannelId === ch.id;
                    const lastSender = collabMessages
                      .filter((m) => m.channelId === ch.id)
                      .slice(-1)[0];
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setActiveChannelId(ch.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                          isActive
                            ? 'bg-slate-900 text-white font-bold shadow-xs'
                            : 'text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {lastSender ? (
                            <UserAvatar
                              name={lastSender.senderName}
                              photoURL={lastSender.senderPhotoURL}
                              size="xs"
                            />
                          ) : (
                            <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          )}
                          <span className="truncate">{ch.label}</span>
                        </div>
                        <span className="ml-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px]">
                          {ch.roleBadge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Intervenants ({teamMembers.length})
                  </p>
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {teamMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">Aucun membre chargé.</p>
                  ) : (
                    teamMembers.slice(0, 10).map((member) => (
                      <div
                        key={member.uid}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            name={member.displayName}
                            photoURL={member.photoURL}
                            email={member.email}
                            size="xs"
                            showStatus
                            isOnline={member.status === 'active'}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">
                              {member.displayName}
                            </p>
                            <p className="truncate text-[10px] text-slate-400 uppercase">
                              {member.role}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Fil de discussion */}
            <div className="lg:col-span-2 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 min-h-[300px]">
              <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {collabMessages.filter((m) => m.channelId === activeChannelId).length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    Aucun message dans ce canal. Envoyez une note de coordination à l'équipe.
                  </div>
                ) : (
                  collabMessages
                    .filter((m) => m.channelId === activeChannelId)
                    .map((msg) => {
                      const isMe = msg.senderUid === user?.uid;
                      const matchedMember = teamMembers.find((u) => u.uid === msg.senderUid);
                      const resolvedPhoto =
                        (isMe ? user?.photoURL : matchedMember?.photoURL) ?? msg.senderPhotoURL;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${
                            isMe ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          <UserAvatar
                            name={msg.senderName}
                            photoURL={resolvedPhoto}
                            size="sm"
                          />
                          <div
                            className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                              isMe
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold">{msg.senderName}</span>
                              <span className="text-[10px] opacity-70">
                                {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              <form onSubmit={handleSendCollabMessage} className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-200/80">
                <UserAvatar user={user} size="xs" />
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Écrire une consigne opérationnelle..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Envoyer</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Modal Détail & Audit d'un SMS */}
      {selectedSms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Fiche d'Audit SMS Opérateur
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {selectedSms.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSms(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  Contenu Brut du SMS reçu
                </p>
                <p className="font-mono text-xs text-slate-800 leading-relaxed bg-white p-3 rounded-xl border border-slate-200 select-all">
                  {selectedSms.rawMessage}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Opérateur & Expéditeur</span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {operatorLabel(selectedSms.operator)} — {selectedSms.sender || 'Non renseigné'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Référence de Transaction</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">
                    {selectedSms.transactionReference || 'Non détectée'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Montant & Devise</span>
                  <p className="font-bold text-slate-900 mt-0.5 text-sm">
                    {selectedSms.amount !== undefined ? `${selectedSms.amount.toLocaleString('fr-FR')} ${selectedSms.currency || 'USD'}` : 'Indisponible'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date & Heure Réception</span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {new Date(selectedSms.receivedAt).toLocaleString('fr-FR')}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Terminal Source / Collecteur</span>
                  <p className="font-medium text-slate-800 mt-0.5 truncate">
                    {selectedSms.collectorDeviceName || 'Terminal Source'}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400 truncate">
                    ID: {selectedSms.collectorDeviceId || 'Non spécifié'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">État Rapprochement</span>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {selectedSms.reconciliationStatus === 'matched' ? 'Rapproché avec une opération' : 'Non rapproché'}
                  </p>
                </div>
              </div>

              {selectedSms.lastSyncError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                  <span className="font-bold block">Dernière erreur de synchronisation :</span>
                  <span className="font-mono text-[11px]">{selectedSms.lastSyncError}</span>
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-blue-900 text-[11px] leading-relaxed">
                <strong>Rappel Direction Générale :</strong> Le statut de ce SMS est en lecture seule vis-à-vis des opérateurs télécoms. Ets AMANI ne génère aucune instruction de transfert ou USSD.
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedSms(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation Suppression Numéro */}
      {confirmDeleteNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Supprimer le numéro {confirmDeleteNumber.phoneNumber} ?
            </h3>
            <p className="text-xs text-slate-600">
              Cette action retirera ce numéro de la flotte supervisée. Les SMS déjà synchronisés restent historisés dans le journal d'audit.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteNumber(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={actionId === confirmDeleteNumber.id}
                onClick={() => void handleDelete(confirmDeleteNumber)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
