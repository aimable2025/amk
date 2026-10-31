import {
  AlertCircle,
  Check,
  ClipboardCheck,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import { db } from '../../../lib/db';
import {
  getAgencies,
  type Agency,
} from '../../../services/AgencyService';
import {
  getAgencyUsersByRole,
  type AgencyUser,
} from '../../../services/AgencyUserService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import type {
  Operation,
  OperationPriority,
  OperationStatus,
  OperationType,
} from '../../../types/operation';

interface OperationModuleProps {
  onClose?: () => void;
}

type OperationFilter = 'all' | OperationStatus;

const OPERATION_TYPES: { value: OperationType; label: string }[] = [
  { value: 'retrait', label: 'Retrait' },
  { value: 'depot', label: 'Dépôt' },
  { value: 'transfert', label: 'Transfert' },
  { value: 'approvisionnement', label: 'Approvisionnement' },
  { value: 'collecte', label: 'Collecte' },
  { value: 'paiement', label: 'Paiement' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'mission', label: 'Mission' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'autre', label: 'Autre' },
];

const PRIORITIES: { value: OperationPriority; label: string }[] = [
  { value: 'maintenant', label: 'Maintenant' },
  { value: 'tres_urgent', label: 'Très urgent' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
  { value: 'attendre', label: 'À attendre' },
];

const STATUS_LABELS: Record<OperationStatus, string> = {
  cree: 'Créée',
  envoye: 'Envoyée',
  recu: 'Reçue',
  valide: 'Validée',
  assigne: 'Assignée',
  en_cours: 'En cours',
  termine: 'Terminée',
  rejete: 'Rejetée',
  annule: 'Annulée',
  archive: 'Archivée',
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateOperationNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getTime()).slice(-6);
  return `OP-${year}${month}${day}-${time}`;
}

function getSyncLabel(status: Operation['syncStatus']): string {
  switch (status) {
    case 'local': return 'LOCAL';
    case 'pending': return 'À SYNCHRONISER';
    case 'syncing': return 'SYNCHRONISATION';
    case 'synced': return 'SYNCHRONISÉ';
    case 'error': return 'ERREUR SYNC';
    default: return 'LOCAL';
  }
}

function getSyncClasses(status: Operation['syncStatus']): string {
  switch (status) {
    case 'synced': return 'bg-emerald-100 text-emerald-700';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'syncing': return 'bg-blue-100 text-blue-700';
    case 'error': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function getPriorityClasses(priority: OperationPriority): string {
  switch (priority) {
    case 'maintenant': return 'bg-red-100 text-red-700';
    case 'tres_urgent': return 'bg-orange-100 text-orange-700';
    case 'urgent': return 'bg-amber-100 text-amber-700';
    case 'normal': return 'bg-blue-100 text-blue-700';
    case 'attendre': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getPriorityLabel(priority: OperationPriority): string {
  return PRIORITIES.find((item) => item.value === priority)?.label || priority;
}

function getTypeLabel(type: OperationType): string {
  return OPERATION_TYPES.find((item) => item.value === type)?.label || type;
}

export default function OperationModule({ onClose }: OperationModuleProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencySearch, setAgencySearch] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [agents, setAgents] = useState<AgencyUser[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [statusFilter, setStatusFilter] = useState<OperationFilter>('all');
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [operationType, setOperationType] = useState<OperationType>('mission');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<OperationPriority>('normal');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [operatorName, setOperatorName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [comments, setComments] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { user: currentUser } = useAuth();

  async function loadAgencies() {
    setLoadingAgencies(true);
    setErrorMessage('');
    try {
      let result = await getAgencies();
      if (
        currentUser?.agencyId &&
        !result.some((a) => a.id === currentUser.agencyId)
      ) {
        result.push({
          id: currentUser.agencyId,
          name: currentUser.agencyId,
        });
      }
      if (
        currentUser?.role === 'administrateur_agence' &&
        currentUser.agencyId
      ) {
        result = result.filter((a) => a.id === currentUser.agencyId);
      }
      result.sort((a, b) => a.name.localeCompare(b.name));
      setAgencies(result);
      if (currentUser?.agencyId && !selectedAgencyId) {
        setSelectedAgencyId(currentUser.agencyId);
      } else if (result.length === 1 && !selectedAgencyId) {
        setSelectedAgencyId(result[0].id);
      }
    } catch {
      setAgencies([]);
    } finally {
      setLoadingAgencies(false);
    }
  }

  async function loadOperations() {
    setLoadingOperations(true);
    try {
      const localOperations = await db.operations.toArray();
      const scopedOperations =
        currentUser?.role === 'administrateur_agence' && currentUser.agencyId
          ? localOperations.filter((op) => op.agencyId === currentUser.agencyId)
          : localOperations;
      scopedOperations.sort((a, b) => b.createdAt - a.createdAt);
      setOperations(scopedOperations);
    } catch (error) {
      console.warn('Ets AMANI - chargement opérations :', error);
    } finally {
      setLoadingOperations(false);
    }
  }

  useEffect(() => {
    void loadAgencies();
    void loadOperations();
  }, []);

  useEffect(() => {
    if (!selectedAgencyId) {
      setAgents([]);
      setSelectedAgentIds([]);
      return;
    }
    async function loadAgents() {
      setLoadingAgents(true);
      setErrorMessage('');
      try {
        const result = await getAgencyUsersByRole(selectedAgencyId, 'agent');
        setAgents(result);
        setSelectedAgentIds([]);
      } catch (error) {
        console.warn('Ets AMANI - chargement agents :', error);
        setAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    }
    void loadAgents();
  }, [selectedAgencyId]);

  const filteredAgencies = useMemo(() => {
    const search = agencySearch.trim().toLowerCase();
    if (!search) return agencies;
    return agencies.filter(
      (a) =>
        a.name.toLowerCase().includes(search) ||
        a.code?.toLowerCase().includes(search) ||
        a.city?.toLowerCase().includes(search)
    );
  }, [agencies, agencySearch]);

  const selectedAgency = agencies.find((a) => a.id === selectedAgencyId);

  const activeAgents = agents.filter(
    (agent) => agent.status === 'active' && agent.isApproved
  );
  const inactiveAgents = agents.filter(
    (agent) => !(agent.status === 'active' && agent.isApproved)
  );

  const [busyAgentIds, setBusyAgentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function calculateBusyAgents() {
      if (!agents.length) {
        setBusyAgentIds(new Set());
        return;
      }
      try {
        const assignments = await db.operationAssignments.toArray();
        const busy = new Set<string>();
        for (const assignment of assignments) {
          if (assignment.status === 'acceptee' || assignment.status === 'en_cours') {
            busy.add(assignment.agentId);
          }
        }
        setBusyAgentIds(busy);
      } catch (error) {
        console.warn('Ets AMANI - calcul disponibilité agents :', error);
      }
    }
    void calculateBusyAgents();
  }, [agents, operations]);

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  }

  function validateForm(): string | null {
    if (!selectedAgencyId) {
      return 'Sélectionnez une agence.';
    }
    if (!title.trim()) {
      return 'Le titre de l opération est obligatoire.';
    }
    if (!description.trim()) {
      return 'La description de l opération est obligatoire.';
    }
    if (selectedAgentIds.length === 0) {
      return 'Sélectionnez au moins un agent.';
    }
    if (amount.trim() && Number.isNaN(Number(amount))) {
      return 'Le montant indiqué est invalide.';
    }
    return null;
  }

  async function handleCreateOperation() {
    setErrorMessage('');
    setSuccessMessage('');
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const operationId = generateId('operation');
      const operationNumber = generateOperationNumber();
      const selectedAgents = agents.filter((a) => selectedAgentIds.includes(a.uid));
      const parsedAmount = amount.trim() ? Number(amount) : undefined;

      const operation: Operation = {
        id: operationId,
        operationNumber,
        type: operationType,
        title: title.trim(),
        description: description.trim(),
        priority,
        status: 'cree',
        agencyId: selectedAgencyId,
        agencyName: selectedAgency?.name || selectedAgencyId || 'Agence',
        assignedAgentIds: selectedAgents.map((a) => a.uid),
        assignedAgentNames: selectedAgents.map((a) => a.displayName),
        createdBy: currentUser?.uid || 'directeur-general',
        createdByName: currentUser?.displayName || 'Direction',
        createdByRole:
          currentUser?.role === 'administrateur_agence'
            ? 'administrateur_agence'
            : currentUser?.role === 'administrateur_systeme'
              ? 'administrateur_systeme'
              : 'directeur_general',
        createdAt: now,
        updatedAt: now,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        amount: parsedAmount,
        currency: parsedAmount !== undefined ? currency : undefined,
        operatorName: operatorName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        comments: comments.trim() || undefined,
        syncStatus: 'pending',
        lastSyncError: null,
      };

      await db.operations.put(operation);

      for (const agent of selectedAgents) {
        const assignmentId = generateId('assignment');
        await db.operationAssignments.put({
          id: assignmentId,
          operationId,
          operationNumber,
          agencyId: selectedAgencyId,
          agentId: agent.uid,
          agentName: agent.displayName,
          agentFunction: agent.function,
          assignedBy: currentUser?.uid || 'directeur-general',
          assignedByName: currentUser?.displayName || 'Directeur Général',
          status: 'propose',
          progress: 0,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
        await db.syncQueue.add({
          entity: 'operationAssignment',
          entityId: assignmentId,
          operation: 'create',
          attempts: 0,
          lastError: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.syncQueue.add({
        entity: 'operation',
        entityId: operationId,
        operation: 'create',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });

      await loadOperations();
      void triggerSyncNow();
      setSuccessMessage(`Opération ${operationNumber} enregistrée localement.`);
      setTitle('');
      setDescription('');
      setPriority('normal');
      setAmount('');
      setCurrency('USD');
      setOperatorName('');
      setAccountNumber('');
      setComments('');
      setDueDate('');
      setSelectedAgentIds([]);
    } catch (error) {
      console.warn('Ets AMANI - création opération :', error);
      setErrorMessage('Impossible d enregistrer l opération localement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateOperationStatus(opId: string, nextStatus: OperationStatus) {
    try {
      const now = Date.now();
      await db.operations.update(opId, {
        status: nextStatus,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await db.syncQueue.add({
        entity: 'operation',
        entityId: opId,
        operation: 'update',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      await loadOperations();
      setSuccessMessage(`Statut de l'opération mis à jour (${STATUS_LABELS[nextStatus]}).`);
    } catch {
      setErrorMessage('Impossible de modifier le statut de l opération.');
    }
  }

  const filteredOperations = useMemo(() => {
    if (statusFilter === 'all') return operations;
    return operations.filter((op) => op.status === statusFilter);
  }, [operations, statusFilter]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 shadow-xl overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Ets AMANI"
            className="h-11 w-11 shrink-0 object-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xs"
          />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Missions & Opérations Réseau</h2>
            <p className="text-xs text-slate-500">Création, affectation et suivi opérationnel</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="space-y-6 p-6">
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1">{errorMessage}</p>
          </div>
        )}
        {successMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1">{successMessage}</p>
          </div>
        )}

        {/* Section création */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-slate-900">Nouvelle Opération</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Agence de rattachement *
              </label>
              <select
                value={selectedAgencyId}
                onChange={(e) => setSelectedAgencyId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
              >
                <option value="">Sélectionner une agence...</option>
                {filteredAgencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.city || 'RDC'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Type d'opération
              </label>
              <select
                value={operationType}
                onChange={(e) => setOperationType(e.target.value as OperationType)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
              >
                {OPERATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Titre de l opération *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Approvisionnement devises agence Goma"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Description / Ordre de mission *
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Détaillez les instructions pour les agents affectés..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Montant facultatif
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'USD' | 'CDF')}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
                >
                  <option value="USD">USD</option>
                  <option value="CDF">CDF</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Priorité
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OperationPriority)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:outline-none"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sélection des agents */}
          {selectedAgencyId && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                Affecter des agents de l'agence ({selectedAgentIds.length} sélectionné(s))
              </p>
              {loadingAgents ? (
                <p className="text-xs text-slate-400">Chargement des agents...</p>
              ) : activeAgents.length === 0 ? (
                <p className="text-xs text-amber-700">Aucun agent actif dans cette agence.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {activeAgents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.uid);
                    const isBusy = busyAgentIds.has(agent.uid);
                    return (
                      <button
                        key={agent.uid}
                        type="button"
                        onClick={() => toggleAgent(agent.uid)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <UserAvatar
                            name={agent.displayName}
                            photoURL={agent.photoURL}
                            email={agent.email}
                            size="sm"
                            showStatus
                            isOnline={!isBusy}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold truncate">{agent.displayName}</p>
                            <p className="text-[10px] text-slate-500">{agent.function || 'Agent'}</p>
                          </div>
                        </div>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          isBusy ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isBusy ? 'Occupé' : 'Libre'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleCreateOperation}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Créer et affecter la mission
            </button>
          </div>
        </section>

        {/* Liste des opérations */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-slate-700" />
              <h3 className="font-bold text-slate-900">
                Opérations Réseau Enregistrées ({filteredOperations.length})
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OperationFilter)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadOperations}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Rafraîchir
              </button>
            </div>
          </div>

          {filteredOperations.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">
              Aucune opération enregistrée dans la base locale.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredOperations.map((op) => (
                <div key={op.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{op.operationNumber}</span>
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                        {getTypeLabel(op.type)}
                      </span>
                      <span className={`rounded px-2 py-0.5 font-semibold ${getPriorityClasses(op.priority)}`}>
                        {getPriorityLabel(op.priority)}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {STATUS_LABELS[op.status] || op.status}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-sm text-slate-800">{op.title}</p>
                    <p className="text-slate-500 mt-0.5 line-clamp-1">{op.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-400">
                      <span>Agence : <strong>{op.agencyName}</strong></span>
                      <span>•</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>Agents ({op.assignedAgentNames?.length || 0}) :</span>
                        {(op.assignedAgentNames || []).map((agName, idx) => {
                          const agUid = op.assignedAgentIds?.[idx];
                          const foundAg = agents.find((a) => a.uid === agUid);
                          return (
                            <span
                              key={`${op.id}_ag_${idx}`}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-1 pr-2 text-[11px] font-semibold text-slate-700"
                            >
                              <UserAvatar
                                name={agName}
                                photoURL={foundAg?.photoURL}
                                size="xs"
                              />
                              <span>{agName}</span>
                            </span>
                          );
                        })}
                      </div>
                      {op.amount !== undefined && (
                        <>
                          <span>•</span>
                          <span>Montant : <strong>{op.amount} {op.currency}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <select
                        value={op.status}
                        onChange={(e) =>
                          void handleUpdateOperationStatus(op.id, e.target.value as OperationStatus)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
                      >
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 font-semibold ${getSyncClasses(op.syncStatus)}`}>
                        {getSyncLabel(op.syncStatus)}
                      </span>
                    </div>
                    <p className="text-slate-400">
                      {new Date(op.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
