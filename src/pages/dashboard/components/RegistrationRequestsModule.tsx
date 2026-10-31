import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  approveRegistration,
  getPendingRegistrationRequests,
  markRegistrationUnderReview,
  rejectRegistration,
  type FirestoreUserProfile,
} from '../../../services/UserProfileService';

type RegistrationFilter = 'all' | 'client' | 'abonne';
type RegistrationWorkflowStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

interface RegistrationRequestsModuleProps {
  onClose?: () => void;
}

function getTimestampValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function formatDate(value: unknown): string {
  const timestamp = getTimestampValue(value);
  if (!timestamp) return 'Date inconnue';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return 'Date inconnue';
  }
}

function getRegistrationStatus(registration: FirestoreUserProfile): RegistrationWorkflowStatus {
  if (registration.registrationStatus) {
    return registration.registrationStatus;
  }
  if (registration.status === 'rejected') {
    return 'rejected';
  }
  if (registration.status === 'active') {
    return 'approved';
  }
  return 'pending';
}

function getRoleLabel(role?: string): string {
  if (role === 'abonne') return 'Abonné';
  if (role === 'client') return 'Client';
  return 'Profil inconnu';
}

function getInitials(registration: FirestoreUserProfile): string {
  const first = registration.firstName?.trim().charAt(0) || '';
  const last = registration.lastName?.trim().charAt(0) || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

function getFullName(registration: FirestoreUserProfile): string {
  const composed = [
    registration.firstName,
    registration.postName,
    registration.lastName,
  ]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(' ');
  return composed || registration.displayName || 'Utilisateur';
}

export default function RegistrationRequestsModule({
  onClose,
}: RegistrationRequestsModuleProps) {
  const { user, firebaseUser, isDirecteurGeneral, isAdministrateurAgence } = useAuth();
  const [registrations, setRegistrations] = useState<FirestoreUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [filter, setFilter] = useState<RegistrationFilter>('all');
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<FirestoreUserProfile | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<FirestoreUserProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const reviewerUid = user?.uid || firebaseUser?.uid || '';

  const loadRegistrations = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await getPendingRegistrationRequests();
        let visible = data.filter(
          (r) => r.requestedRole === 'client' || r.requestedRole === 'abonne'
        );
        if (isAdministrateurAgence && user?.agencyId) {
          visible = visible.filter((r) => {
            if (r.requestedRole === 'client') return true;
            if (r.requestedRole === 'abonne') return r.agencyId === user.agencyId;
            return false;
          });
        }
        visible.sort(
          (a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
        );
        setRegistrations(visible);
      } catch {
        setError('Impossible de charger les demandes d inscription.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdministrateurAgence, user?.agencyId]
  );

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  const filteredRegistrations = useMemo(() => {
    const normalized = searchValue.trim().toLowerCase();
    return registrations.filter((r) => {
      if (filter !== 'all' && r.requestedRole !== filter) return false;
      if (!normalized) return true;
      const content = [
        getFullName(r),
        r.displayName,
        r.email,
        r.phone,
        r.profession,
        r.agencyId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return content.includes(normalized);
    });
  }, [filter, searchValue, registrations]);

  const handleUnderReview = async (registration: FirestoreUserProfile) => {
    setProcessingUid(registration.uid);
    try {
      await markRegistrationUnderReview(registration.uid, reviewerUid);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de mettre en évaluation.');
    } finally {
      setProcessingUid(null);
    }
  };

  const handleApprove = async (registration: FirestoreUserProfile) => {
    setProcessingUid(registration.uid);
    try {
      await approveRegistration(registration.uid, reviewerUid);
      setSelectedRegistration(null);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de valider.');
    } finally {
      setProcessingUid(null);
    }
  };

  const handleReject = async () => {
    if (!rejectionTarget) return;
    setProcessingUid(rejectionTarget.uid);
    try {
      await rejectRegistration(rejectionTarget.uid, reviewerUid, rejectionReason);
      setRejectionTarget(null);
      setRejectionReason('');
      setSelectedRegistration(null);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de rejeter.');
    } finally {
      setProcessingUid(null);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="border-b border-slate-200 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Demandes d'inscription</h2>
            <p className="text-xs text-slate-500">Valider ou rejeter les demandes Client et Abonné</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRegistrations(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Rechercher un candidat..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none"
            />
          </div>
          <div className="flex gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-1.5 font-bold transition ${filter === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Tous ({registrations.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('client')}
              className={`rounded-lg px-3 py-1.5 font-bold transition ${filter === 'client' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500'}`}
            >
              Clients
            </button>
            <button
              type="button"
              onClick={() => setFilter('abonne')}
              className={`rounded-lg px-3 py-1.5 font-bold transition ${filter === 'abonne' ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500'}`}
            >
              Abonnés
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
            <p className="text-xs">Chargement des demandes...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Users className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">Aucune demande en attente</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRegistrations.map((r) => {
              const status = getRegistrationStatus(r);
              const isProcessing = processingUid === r.uid;
              return (
                <div key={r.uid} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={getFullName(r)}
                      photoURL={r.photoURL}
                      email={r.email}
                      size="md"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-slate-900">{getFullName(r)}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.requestedRole === 'abonne' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {getRoleLabel(r.requestedRole)}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          {status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.phone || r.email || 'Sans coordonnées'} {r.profession ? `• ${r.profession}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRegistration(r)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Détails
                    </button>
                    {status === 'pending' && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleUnderReview(r)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Évaluer
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApprove(r)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setRejectionTarget(r)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      Rejeter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Détails */}
      {selectedRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={getFullName(selectedRegistration)}
                  photoURL={selectedRegistration.photoURL}
                  email={selectedRegistration.email}
                  size="md"
                />
                <div>
                  <h3 className="font-bold text-base text-slate-900">{getFullName(selectedRegistration)}</h3>
                  <span className="text-xs text-slate-500">
                    Demande {getRoleLabel(selectedRegistration.requestedRole)} • {formatDate(selectedRegistration.createdAt)}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedRegistration(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="py-4 grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block font-semibold uppercase">Téléphone WhatsApp</span>
                <span className="font-bold text-slate-800">{selectedRegistration.phone || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block font-semibold uppercase">Email</span>
                <span className="font-bold text-slate-800">{selectedRegistration.email || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block font-semibold uppercase">Province / Ville</span>
                <span className="font-bold text-slate-800">{selectedRegistration.province || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block font-semibold uppercase">Pièce d'identité</span>
                <span className="font-bold text-slate-800">{selectedRegistration.identityDocument || '—'}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setSelectedRegistration(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rejet */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-rose-700">Rejeter la demande d'inscription</h3>
            <p className="text-xs text-slate-600">
              Veuillez indiquer le motif du rejet pour {getFullName(rejectionTarget)} :
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Pièce d'identité illisible ou informations non conformes"
              className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectionTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
