import { useRef, useState } from 'react';
import {
  Camera,
  Clock,
  Loader2,
  LogOut,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import { compressImageToDataUrl } from '../../services/UserProfileService';

export default function ApprovalPendingPage() {
  const { user, signOut, refreshUser, updateProfilePhoto } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
      await updateProfilePhoto(dataUrl);
    } catch {
      // ignore
    } finally {
      setIsUploading(false);
    }
  };

  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Action : Rafraîchir le statut et vérifier les droits
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setStatusFeedback(null);
      if (refreshUser) {
        await refreshUser();
      } else {
        window.location.reload();
        return;
      }

      const isAccountActiveAndApproved =
        user?.isApproved && (user?.status === 'active' || user?.status === 'approved');

      if (isAccountActiveAndApproved) {
        window.location.href = '/';
      } else {
        setStatusFeedback(
          user?.status === 'suspended'
            ? 'Votre compte a été suspendu par la Direction.'
            : user?.status === 'disabled'
            ? 'Votre compte a été désactivé.'
            : user?.status === 'rejected'
            ? 'Votre demande d’inscription a été rejetée.'
            : "Votre compte n'a pas encore été validé par la Direction."
        );
      }
    } catch (err) {
      console.error('[Ets AMANI] Erreur lors du rafraîchissement :', err);
      window.location.reload();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Action : Déconnexion forcée et nettoyage total
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      if (signOut) {
        await signOut();
      }
    } catch (err) {
      console.warn('[Ets AMANI] Erreur déconnexion Firebase :', err);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  };

  const isSuspended = user?.status === 'suspended';
  const isDisabled = user?.status === 'disabled';
  const isRejected = user?.status === 'rejected';

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-3 flex items-center justify-center">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-14 w-14 rounded-2xl object-contain bg-slate-950 p-2 shadow-md ring-1 ring-slate-800"
          />
        </div>
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
            isSuspended || isDisabled || isRejected
              ? 'bg-red-50 text-red-600 ring-4 ring-red-50/50'
              : 'bg-amber-50 text-amber-600 ring-4 ring-amber-50/50'
          }`}
        >
          <Clock className="h-6 w-6" />
        </div>

        <h1 className="mt-6 text-xl font-bold text-slate-900">
          {isSuspended
            ? 'Compte suspendu'
            : isDisabled
            ? 'Compte désactivé'
            : isRejected
            ? 'Demande rejetée'
            : 'Validation en attente'}
        </h1>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {isSuspended
            ? 'Votre compte a été suspendu par mesure de sécurité ou décision de la Direction. Veuillez contacter votre responsable hiérarchique.'
            : isDisabled
            ? 'Ce compte utilisateur a été désactivé. L’accès aux modules de gestion est verrouillé.'
            : isRejected
            ? 'Votre demande d’inscription a été rejetée par la Direction. Veuillez contacter votre agence de rattachement.'
            : `Votre compte (${user?.displayName || user?.email || 'Enregistré'}) a été enregistré avec succès. Pour des raisons réglementaires et de sécurité des opérations financières, l'activation finale doit être approuvée par la Direction ou l'Administrateur de votre agence.`}
        </p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs text-left space-y-3 border border-slate-200/80">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar user={user} size="md" />
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900 text-sm">
                  {user?.displayName || 'Candidat'}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {user?.email || user?.phone || 'Compte en attente'}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-blue-600" />
              )}
              <span>Photo</span>
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Rôle demandé :</span>
            <span className="font-bold text-slate-800 uppercase">{user?.role || 'Non spécifié'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Agence :</span>
            <span className="font-bold text-slate-800">{user?.agencyId || 'Non assignée'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Statut :</span>
            <span className="font-bold text-amber-600">En cours d'examen</span>
          </div>
        </div>

        {statusFeedback && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 text-left animate-in fade-in duration-200">
            {statusFeedback}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Vérification...' : 'Vérifier à nouveau'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? 'Déconnexion...' : 'Se déconnecter'}
          </button>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 flex flex-col items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <span>Assistance Ets AMANI : +243 992 294 852</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            « Ets AMANI — Ensemble, plus connectés, plus efficaces »
          </p>
        </div>
      </div>
    </div>
  );
}
