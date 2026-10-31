import {
  Bell,
  ChevronDown,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';
import HeaderChatSearch, { type ChatNavigationTarget } from '../common/HeaderChatSearch';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  isOnline?: boolean;
  pendingSyncCount?: number;
  isSyncingNow?: boolean;
  notificationCount?: number;
  hideMenuButtonOnDesktop?: boolean;
  onMenuClick?: () => void;
  onSyncNowClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onNavigateToChat?: (target?: ChatNavigationTarget) => void;
}

const ROLE_LABELS: Record<string, string> = {
  administrateur_systeme: 'Administrateur Système',
  directeur_general: 'Directeur Général',
  administrateur_agence: "Administrateur d'Agence",
  agent: 'Agent',
  client: 'Client',
  abonne: 'Abonné',
};

export default function Header({
  title = 'Tableau de bord',
  subtitle = 'Vue d ensemble de votre activité',
  isOnline = true,
  pendingSyncCount = 0,
  isSyncingNow = false,
  notificationCount = 0,
  onSyncNowClick,
  onNotificationsClick,
  onProfileClick,
  onNavigateToChat,
}: HeaderProps) {
  const { user, role } = useAuth();
  const displayName = user?.displayName || 'Utilisateur';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Compte actif';

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <img
          src="/logo.png"
          alt="Logo Ets AMANI"
          className="h-9 w-9 shrink-0 rounded-xl object-contain bg-slate-950 p-1 ring-1 ring-slate-800 shadow-xs"
        />

        <div className="min-w-0 flex-1 sm:max-w-xs md:max-w-sm lg:max-w-md">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-950">
              {title}
            </h1>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {subtitle}
          </p>
        </div>

        {/* Barre de recherche globale Chat dans l'en-tête */}
        <div className="hidden sm:flex flex-1 justify-center max-w-md lg:max-w-lg mx-2">
          <HeaderChatSearch
            onNavigateToChat={onNavigateToChat}
            className="w-full"
          />
        </div>

        <button
          type="button"
          onClick={onSyncNowClick}
          disabled={isSyncingNow}
          className={[
            'flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition',
            isOnline
              ? pendingSyncCount > 0
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
          ].join(' ')}
          title={
            isOnline
              ? pendingSyncCount > 0
                ? `${pendingSyncCount} élément(s) en attente — Cliquer pour synchroniser maintenant`
                : 'Synchronisé — Cliquer pour actualiser la synchronisation'
              : 'Mode hors-ligne (Dexie actif)'
          }
        >
          {isSyncingNow ? (
            <RefreshCw size={14} className="animate-spin text-blue-600" />
          ) : isOnline ? (
            <Wifi size={14} />
          ) : (
            <WifiOff size={14} />
          )}
          <span className="hidden sm:inline tabular-nums">
            {isSyncingNow
              ? 'Sync...'
              : !isOnline
                ? 'Hors ligne'
                : pendingSyncCount > 0
                  ? `${pendingSyncCount} à sync`
                  : 'Synchronisé'}
          </span>
        </button>

        <button
          type="button"
          onClick={onNotificationsClick}
          aria-label="Notifications"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <Bell size={19} />
          {notificationCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
          )}
        </button>

        <button
          type="button"
          onClick={onProfileClick}
          className="group flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-2 transition hover:bg-slate-50 sm:gap-3 sm:pr-3"
        >
          <UserAvatar
            user={user}
            size="sm"
            statusDot={isOnline ? 'online' : 'offline'}
          />
          <div className="hidden min-w-0 text-left md:block">
            <div className="max-w-28 truncate text-sm font-semibold text-slate-800">
              {displayName}
            </div>
            <div className="max-w-28 truncate text-[11px] text-slate-500">
              {roleLabel}
            </div>
          </div>
          <ChevronDown
            size={16}
            className="hidden text-slate-400 transition-transform group-hover:text-slate-600 md:block"
          />
        </button>
      </div>

      {/* Barre de recherche sur mobile (au-dessous du bandeau principal) */}
      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 sm:hidden">
        <HeaderChatSearch
          onNavigateToChat={onNavigateToChat}
          className="w-full"
        />
      </div>
    </header>
  );
}
