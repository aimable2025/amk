import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Camera, CheckCircle2, Loader2, LogOut, RefreshCw, Trash2, Wifi, X } from 'lucide-react';
import Header from './Header';
import MobileNavigation, { type MobileNavigationItem } from './MobileNavigation';
import Sidebar from './Sidebar';
import UserAvatar from '../common/UserAvatar';
import { useViewportMode } from '../common/FramePhone';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { compressImageToDataUrl } from '../../services/UserProfileService';
import { triggerSyncNow } from '../../services/SyncWorker';
import { syncPendingSmsOperations } from '../../services/SmsOperationService';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  activeItem?: string;
  isOnline?: boolean;
  onNavigate?: (item: string) => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onNavigateToChat?: (target?: import('../common/HeaderChatSearch').ChatNavigationTarget) => void;
}

export default function AppLayout({
  children,
  title = 'Tableau de bord',
  subtitle = 'Vue d ensemble de votre activité',
  activeItem = 'dashboard',
  isOnline: isOnlineProp,
  onNavigate,
  onNotificationsClick,
  onProfileClick,
  onNavigateToChat,
}: AppLayoutProps) {
  const { user, signOut, updateProfilePhoto } = useAuth();
  const { displayMode } = useViewportMode();
  const isDesktopMode = displayMode === 'desktop';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [networkOnline, setNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [activeOpsCount, setActiveOpsCount] = useState(0);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isOnline = isOnlineProp ?? networkOnline;

  const loadCounts = useCallback(async () => {
    try {
      const [queue, smsQueue, ops] = await Promise.all([
        db.syncQueue.where('status').equals('pending').count(),
        db.smsSyncQueue.where('status').equals('pending').count(),
        db.operations.toArray(),
      ]);
      setPendingSyncCount(queue + smsQueue);
      const myOps = ops.filter(
        (o) =>
          o.status !== 'termine' &&
          o.status !== 'annule' &&
          o.status !== 'rejete' &&
          (!user?.agencyId || o.agencyId === user.agencyId)
      );
      setActiveOpsCount(myOps.length);
    } catch {
      // ignore
    }
  }, [user?.agencyId]);

  const handleSyncNow = async () => {
    if (isSyncingNow) return;
    setIsSyncingNow(true);
    try {
      await Promise.all([
        triggerSyncNow(),
        syncPendingSmsOperations(),
      ]);
      await loadCounts();
    } catch {
      // ignore
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUpdatingPhoto(true);
    setPhotoFeedback(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
      await updateProfilePhoto(dataUrl);
      setPhotoFeedback('Photo de profil mise à jour avec succès.');
      setTimeout(() => setPhotoFeedback(null), 3500);
    } catch {
      setPhotoFeedback('Impossible de mettre à jour la photo.');
    } finally {
      setIsUpdatingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = async () => {
    setIsUpdatingPhoto(true);
    setPhotoFeedback(null);
    try {
      await updateProfilePhoto(null);
      setPhotoFeedback('Photo de profil retirée.');
      setTimeout(() => setPhotoFeedback(null), 3000);
    } catch {
      setPhotoFeedback('Impossible de supprimer la photo.');
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  useEffect(() => {
    const onOnline = () => setNetworkOnline(true);
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    void loadCounts();
    const interval = setInterval(() => {
      void loadCounts();
    }, 8000);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfileModal(false);
        setShowNotificationsModal(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadCounts]);

  const handleNavigate = (item: string) => {
    onNavigate?.(item);
    setMobileMenuOpen(false);
  };

  const handleMobileMenuClick = () => {
    setMobileMenuOpen((current) => !current);
  };

  const handleOpenNotifications = () => {
    if (onNotificationsClick) {
      onNotificationsClick();
    } else {
      setShowNotificationsModal(true);
    }
  };

  const handleOpenProfile = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      setShowProfileModal(true);
    }
  };

  const handleMobileBottomNavigate = (item: MobileNavigationItem) => {
    if (item === 'dashboard') {
      onNavigate?.('dashboard');
    } else if (item === 'activity') {
      if (onNavigate) {
        onNavigate('transactions');
      } else {
        setShowNotificationsModal(true);
      }
    } else if (item === 'profile') {
      setShowProfileModal(true);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-950 flex flex-col flex-1">
      <div className="flex min-h-full flex-1">
        {/* Barre latérale fixe sur grand écran lorsque le Mode Bureau 100% est actif */}
        {isDesktopMode && (
          <div className="no-print hidden lg:flex lg:shrink-0">
            <div className="sticky top-0 h-screen">
              <Sidebar
                activeItem={activeItem}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        )}

        {/* Tiroir latéral mobile / tablette */}
        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-[60]">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            />
            <div className="relative z-10 h-full w-[min(19rem,86%)] shadow-2xl">
              <Sidebar
                activeItem={activeItem}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            title={title}
            subtitle={subtitle}
            isOnline={isOnline}
            pendingSyncCount={pendingSyncCount}
            isSyncingNow={isSyncingNow}
            hideMenuButtonOnDesktop={isDesktopMode}
            notificationCount={pendingSyncCount + activeOpsCount}
            onMenuClick={handleMobileMenuClick}
            onSyncNowClick={handleSyncNow}
            onNotificationsClick={handleOpenNotifications}
            onProfileClick={handleOpenProfile}
            onNavigateToChat={onNavigateToChat}
          />

          <main className="min-w-0 flex-1">
            <div
              className={[
                'mx-auto w-full px-4 py-5',
                isDesktopMode ? 'max-w-7xl sm:px-6 lg:px-8 pb-16' : 'pb-24',
              ].join(' ')}
            >
              {children}

              <footer className="mt-10 border-t border-slate-200/80 pt-5 pb-2 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700 tracking-tight">
                  Ets AMANI — Ensemble, plus connectés, plus efficaces
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Système de gestion financière, de caisse et de supervision multi-agences • Offline-First
                </p>
              </footer>
            </div>
          </main>

          <div className={isDesktopMode ? 'no-print lg:hidden' : 'no-print'}>
            <MobileNavigation
              activeItem={
                showProfileModal
                  ? 'profile'
                  : activeItem !== 'dashboard'
                    ? 'activity'
                    : 'dashboard'
              }
              onNavigate={handleMobileBottomNavigate}
              onMenuClick={handleMobileMenuClick}
            />
          </div>
        </div>
      </div>

      {/* Modal Notifications & État Réel */}
      {showNotificationsModal && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Bell className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  État Opérationnel & Synchronisation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Wifi className={`h-4 w-4 ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className="font-semibold text-slate-700">Connectivité réseau</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {isOnline ? 'En ligne' : 'Hors-ligne (Dexie actif)'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="font-semibold text-slate-700">Éléments en attente de sync</span>
                <span className="font-bold tabular-nums text-slate-900">{pendingSyncCount}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="font-semibold text-slate-700">Opérations actives en cours</span>
                <span className="font-bold tabular-nums text-slate-900">{activeOpsCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncingNow}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                <span>{isSyncingNow ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Profil Utilisateur & Paramètres Photo */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Mon Profil & Paramètres</h3>
                <p className="text-xs text-slate-500">Identité et photo de profil Ets AMANI</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Section Avatar & Mise à jour de la photo */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-center">
              <div className="relative">
                <UserAvatar
                  user={user}
                  size="xl"
                  statusDot={isOnline ? 'online' : 'offline'}
                  className="ring-4 ring-white shadow-md"
                />
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  title="Modifier ma photo de profil"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdatingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-base font-bold text-slate-900">{user.displayName}</p>
                <p className="text-xs text-slate-500">{user.email || user.phone || 'Session active'}</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {user.photoURL ? 'Changer la photo' : 'Téléverser une photo'}
                </button>
                {user.photoURL && (
                  <button
                    type="button"
                    disabled={isUpdatingPhoto}
                    onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                )}
              </div>

              {photoFeedback && (
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{photoFeedback}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Rôle</span>
                <span className="font-bold text-slate-800">{user.role}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Statut</span>
                <span className="font-bold text-emerald-700">{user.status}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Agence</span>
                <span className="font-bold text-slate-800">{user.agencyId || 'Siège / Global'}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Fonction</span>
                <span className="font-bold text-slate-800">{user.function || 'Standard'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  void signOut();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
