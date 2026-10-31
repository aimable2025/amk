import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Unlock,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  appointDirectorGeneral,
  getCurrentDirectorGeneral,
  getDirectorGeneralConfig,
  getDirectorGeneralHistory,
  reactivateDirectorGeneral,
  revokeDirectorGeneral,
  suspendDirectorGeneral,
  type DirectorGeneralConfig,
  type DirectorGeneralHistoryEntry,
  type DirectorGeneralRecord,
} from '../../../services/DirectorGeneralService';
import {
  getDgFeatures,
  resetDgFeatures,
  toggleDgFeature,
} from '../../../services/DgFeatureService';
import {
  DG_FEATURE_DEFINITIONS,
  type DgFeatureKey,
  type DgFeatures,
} from '../../../types/management';

interface DirectorGeneralGovernanceModuleProps {
  onClose?: () => void;
}

type ModalType = 'suspend' | 'reactivate' | 'replace' | 'revoke' | null;

export default function DirectorGeneralGovernanceModule({
  onClose,
}: DirectorGeneralGovernanceModuleProps) {
  const { user } = useAuth();

  const [currentDg, setCurrentDg] = useState<DirectorGeneralRecord | null>(null);
  const [dgConfig, setDgConfig] = useState<DirectorGeneralConfig | null>(null);
  const [history, setHistory] = useState<DirectorGeneralHistoryEntry[]>([]);
  const [features, setFeatures] = useState<DgFeatures | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale d'action
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [reasonInput, setReasonInput] = useState('');

  // Formulaire de remplacement / nouvelle nomination
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmResetFeatures, setConfirmResetFeatures] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dgRecord, configData, historyData, featuresData] = await Promise.all([
        getCurrentDirectorGeneral(),
        getDirectorGeneralConfig(),
        getDirectorGeneralHistory(),
        getDgFeatures(),
      ]);

      setCurrentDg(dgRecord);
      setDgConfig(configData);
      setHistory(historyData);
      setFeatures(featuresData);
    } catch (err) {
      console.warn('[Ets AMANI] Erreur chargement gouvernance DG :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Suspension
  const handleSuspend = async () => {
    if (!user || !currentDg?.uid || !reasonInput.trim()) return;
    setSubmitting(true);
    try {
      await suspendDirectorGeneral(
        currentDg.uid,
        reasonInput.trim(),
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le mandat du Directeur Général a été suspendu.');
      setActiveModal(null);
      setReasonInput('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la suspension du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Réactivation
  const handleReactivate = async () => {
    if (!user || !currentDg?.uid) return;
    setSubmitting(true);
    try {
      await reactivateDirectorGeneral(
        currentDg.uid,
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le Directeur Général a été réactivé avec succès.');
      setActiveModal(null);
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la réactivation du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Révocation / Suppression logique
  const handleRevoke = async () => {
    if (!user || !currentDg?.uid || !reasonInput.trim()) return;
    setSubmitting(true);
    try {
      await revokeDirectorGeneral(
        currentDg.uid,
        reasonInput.trim(),
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le mandat du Directeur Général a été révoqué.');
      setActiveModal(null);
      setReasonInput('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la révocation du mandat.');
    } finally {
      setSubmitting(false);
    }
  };

  // Remplacement / Nomination
  const handleReplaceOrAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim() || !newEmail.trim()) return;
    setSubmitting(true);
    try {
      await appointDirectorGeneral(
        {
          displayName: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim() || undefined,
          password: newPassword,
        },
        { uid: user.uid, name: user.displayName, role: user.role },
        currentDg?.uid
      );
      showFeedback('success', 'Le nouveau Directeur Général a été nommé avec succès.');
      setActiveModal(null);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la nomination du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Feature DG
  const handleToggleFeature = async (key: DgFeatureKey) => {
    try {
      const updated = await toggleDgFeature(key);
      setFeatures(updated);
      showFeedback('success', `Prérogative « ${key} » mise à jour.`);
    } catch {
      showFeedback('error', 'Impossible de modifier la prérogative.');
    }
  };

  // Réinitialiser prérogatives
  const handleResetFeatures = async () => {
    try {
      setConfirmResetFeatures(false);
      const reset = await resetDgFeatures();
      setFeatures(reset);
      showFeedback('success', 'Prérogatives réinitialisées aux valeurs par défaut.');
    } catch {
      showFeedback('error', 'Erreur lors de la réinitialisation.');
    }
  };

  const isSuspended = currentDg?.status === 'suspended' || dgConfig?.status === 'suspended';
  const isActive = currentDg?.status === 'active' && !isSuspended;

  return (
    <div className="space-y-6">
      {/* En-tête du module */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Gouvernance du Directeur Général (DG)
            </h2>
            <p className="text-xs text-slate-500">
              Supervision statutaire, nomination, suspension, révocation et habilitations exclusives.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message de feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-3 rounded-2xl p-4 text-xs font-semibold border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Carte du Mandat DG Actuel */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <UserAvatar
              name={currentDg?.displayName || dgConfig?.displayName || 'Directeur Général'}
              photoURL={currentDg?.photoURL || dgConfig?.photoURL}
              email={currentDg?.email || dgConfig?.email}
              size="lg"
              showStatus
              isOnline={isActive}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {currentDg?.displayName || dgConfig?.displayName || 'Aucun DG nommé'}
                </h3>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Mandat Actif
                  </span>
                )}
                {isSuspended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    <PauseCircle className="h-3 w-3" />
                    Mandat Suspendu
                  </span>
                )}
                {!isActive && !isSuspended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                    <UserMinus className="h-3 w-3" />
                    Poste Vacant / Inactif
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Email : <strong>{currentDg?.email || dgConfig?.email || '—'}</strong> • Téléphone :{' '}
                <strong>{currentDg?.phone || dgConfig?.phone || '—'}</strong>
              </p>

              {currentDg?.appointedByName && (
                <p className="text-[11px] text-slate-400">
                  Nommé par : <span className="font-semibold text-slate-600">{currentDg.appointedByName}</span>
                  {currentDg.appointedAt && (
                    <> le {new Date(currentDg.appointedAt).toLocaleDateString('fr-FR')}</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Boutons d'actions administratives */}
          <div className="flex flex-wrap items-center gap-2">
            {isActive && (
              <button
                type="button"
                onClick={() => {
                  setReasonInput('');
                  setActiveModal('suspend');
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600 transition"
              >
                <PauseCircle className="h-4 w-4" />
                Suspendre le DG
              </button>
            )}

            {isSuspended && (
              <button
                type="button"
                onClick={() => setActiveModal('reactivate')}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <PlayCircle className="h-4 w-4" />
                Réactiver le DG
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setNewName('');
                setNewEmail('');
                setNewPhone('');
                setActiveModal('replace');
              }}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <UserPlus className="h-4 w-4" />
              {currentDg ? 'Remplacer le DG' : 'Nommer un DG'}
            </button>

            {currentDg && (
              <button
                type="button"
                onClick={() => {
                  setReasonInput('');
                  setActiveModal('revoke');
                }}
                className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-100 transition"
              >
                <Trash2 className="h-4 w-4" />
                Révoquer
              </button>
            )}
          </div>
        </div>

        {/* Bannière en cas de suspension */}
        {isSuspended && (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Attention : Le Directeur Général fait l'objet d'une mesure de suspension.</p>
                <p className="mt-1 text-amber-800">
                  Motif enregistré : <em>« {dgConfig?.suspensionReason || currentDg?.suspensionReason || 'Procédure administrative'} »</em>
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Ses privilèges d'accès aux modules décisionnels sont momentanément verrouillés jusqu'à réactivation formelle par l'Administrateur Système.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grille : Prérogatives DG (Toggles) + Historique de Gouvernance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Colonne 1 : Contrôle des Prérogatives DG */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Prérogatives Fonctionnelles du DG
                </h3>
                <p className="text-[11px] text-slate-400">
                  Activez ou limitez les modules accessibles au Directeur Général.
                </p>
              </div>
            </div>

            {confirmResetFeatures ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetFeatures}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetFeatures(false)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetFeatures(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <RotateCcw className="h-3 w-3" />
                Défaut
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 p-2">
            {(Object.entries(DG_FEATURE_DEFINITIONS) as [DgFeatureKey, (typeof DG_FEATURE_DEFINITIONS)[DgFeatureKey]][]).map(
              ([key, def]) => {
                const isEnabled = features ? features[key] : true;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 transition hover:bg-white rounded-xl"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-bold text-slate-900">{def.label}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {def.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(key)}
                      className="shrink-0 text-slate-400 hover:text-slate-900 transition"
                    >
                      {isEnabled ? (
                        <ToggleRight className="h-7 w-7 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-slate-300" />
                      )}
                    </button>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Colonne 2 : Historique des Actions de Gouvernance */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Journal de Gouvernance DG
              </h3>
              <p className="text-[11px] text-slate-400">
                Traçabilité immuable des nominations, suspensions et révocations.
              </p>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 pr-1">
            {history.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Aucune action de gouvernance enregistrée pour le moment.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={item.targetName} size="xs" />
                      <span
                        className={`rounded-md px-2 py-0.5 font-bold uppercase text-[10px] ${
                          item.action === 'nomination'
                            ? 'bg-blue-100 text-blue-800'
                            : item.action === 'suspension'
                            ? 'bg-amber-100 text-amber-800'
                            : item.action === 'reactivation'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.action === 'remplacement'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {item.action}
                      </span>
                      <span className="font-bold text-slate-900">
                        {item.targetName}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.timestamp).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {item.reason && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                      Motif : {item.reason}
                    </p>
                  )}

                  <p className="text-[10px] text-slate-400">
                    Auteur : <strong>{item.actorName}</strong> ({item.actorRole})
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODALE : SUSPENSION */}
      {activeModal === 'suspend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <PauseCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Suspendre le Directeur Général
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              La suspension désactive temporairement l'accès de <strong>{currentDg?.displayName}</strong> aux fonctionnalités décisionnelles.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motif réglementaire de la suspension *
              </label>
              <textarea
                rows={3}
                required
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Ex: Enquête d'audit interne, contrôle de conformité caisse..."
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={submitting || !reasonInput.trim()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Suspension...' : 'Confirmer la suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : RÉACTIVATION */}
      {activeModal === 'reactivate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <PlayCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Réactiver le Directeur Général
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Confirmez-vous la levée de la mesure de suspension pour{' '}
              <strong>{currentDg?.displayName}</strong> ? Ses accès complets seront immédiatement rétablis.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReactivate}
                disabled={submitting}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Réactivation...' : 'Confirmer la réactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : RÉVOCATION */}
      {activeModal === 'revoke' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Révocation du Mandat DG
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Cette action met définitivement fin au mandat de{' '}
              <strong>{currentDg?.displayName}</strong> et déclare le poste vacant.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motif de la révocation *
              </label>
              <textarea
                rows={3}
                required
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Ex: Fin de mandat, décision du Conseil d'Administration..."
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={submitting || !reasonInput.trim()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Révocation...' : 'Confirmer la révocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : NOMINATION / REMPLACEMENT */}
      {activeModal === 'replace' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {currentDg ? 'Remplacement du Directeur Général' : 'Nomination du Directeur Général'}
                </h3>
                {currentDg && (
                  <p className="text-[11px] text-slate-400">
                    L'actuel DG ({currentDg.displayName}) verra son mandat clôturé automatiquement.
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleReplaceOrAppoint} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nom complet du Directeur Général *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Jean-Paul AMANI"
                  className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Adresse email professionnelle *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="dg@ets-amani.com"
                  className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Téléphone mobile officiel
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+243 970 000 001"
                  className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mot de passe de première connexion *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-2.5 pr-10 outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={submitting}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Confirmer la nomination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
