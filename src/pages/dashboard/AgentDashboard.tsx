import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Briefcase,
  CheckCircle2,
  Clock,
  Coins,
  Database,
  Eye,
  FileText,
  Filter,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  Smartphone,
  Users,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import ReportsModule from './components/ReportsModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { triggerSyncNow } from '../../services/SyncWorker';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  startAgentNotificationWatcher,
  triggerTestUrgentNotification,
} from '../../services/LocalNotificationService';
import {
  getCachedOperations,
  getCachedOperationsSummary,
  syncOperationsToIndexedDBCache,
  formatRelativeCacheTime,
  getCacheMetadata,
  type CacheMetadata,
} from '../../services/LocalOperationsCacheService';
import type { Operation } from '../../types/operation';

type AgentView = 'overview' | 'billetage' | 'salary' | 'transfers' | 'debts' | 'chat' | 'reports';

const AGENT_TABS: WorkspaceTab[] = [
  { id: 'overview', label: 'Guichet & Missions', icon: LayoutDashboard },
  { id: 'reports', label: 'Mes Rapports', icon: FileText },
  { id: 'billetage', label: 'Billetage Caisse', icon: Coins },
  { id: 'salary', label: 'Mon Salaire', icon: WalletCards },
  { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
  { id: 'debts', label: 'Suivi Dettes', icon: Scale },
  { id: 'chat', label: 'Messagerie & Annonces', icon: Users },
];

export default function AgentDashboard() {
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState<AgentView>('overview');
  const [assignedOperations, setAssignedOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [agencyLabel, setAgencyLabel] = useState<string>('');
  const [pendingReportsBadge, setPendingReportsBadge] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    getNotificationPermissionStatus()
  );
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    message: string;
    isUrgent?: boolean;
    operationId?: string;
  } | null>(null);
  const [testNotificationLoading, setTestNotificationLoading] = useState(false);

  // États du cache local IndexedDB (Dexie)
  const [cacheMetadata, setCacheMetadata] = useState<CacheMetadata>(getCacheMetadata());
  const [cacheSummary, setCacheSummary] = useState<{
    total: number;
    pending: number;
    urgent: number;
    completed: number;
    lastSync: number | null;
    totalUsdAmount: number;
    totalCdfAmount: number;
  }>({
    total: 0,
    pending: 0,
    urgent: 0,
    completed: 0,
    lastSync: null,
    totalUsdAmount: 0,
    totalCdfAmount: 0,
  });
  const [cacheSyncLoading, setCacheSyncLoading] = useState(false);
  const [offlineFilter, setOfflineFilter] = useState<'all' | 'pending' | 'urgent' | 'termine'>('all');
  const [offlineSearchQuery, setOfflineSearchQuery] = useState('');
  const [selectedOperationDetail, setSelectedOperationDetail] = useState<Operation | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const loadOperations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (user.agencyId) {
        const ag = await getAgency(user.agencyId);
        if (ag?.name) setAgencyLabel(ag.name);
      }

      // Lecture depuis le cache IndexedDB
      const cachedOps = await getCachedOperations({
        agentId: user.uid,
        agencyId: user.agencyId || undefined,
        status: offlineFilter === 'pending' ? 'cree' : offlineFilter === 'termine' ? 'termine' : undefined,
        priority: offlineFilter === 'urgent' ? 'urgent' : undefined,
        searchQuery: offlineSearchQuery,
      });

      setAssignedOperations(cachedOps);

      // Calcul des métriques de cache
      const summary = await getCachedOperationsSummary(user.uid);
      setCacheSummary(summary);
      setCacheMetadata(getCacheMetadata());

      const allRep = await db.reports.toArray();
      const myAlerts = allRep.filter(
        (r) => r.createdBy === user.uid && (r.status === 'retourne' || r.status === 'brouillon')
      );
      setPendingReportsBadge(myAlerts.length);
    } catch (err) {
      console.warn('Erreur chargement opérations en cache local :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadOperations();
  }, [user, offlineFilter, offlineSearchQuery]);

  // Surveillance en arrière-plan des opérations assignées à cet agent
  useEffect(() => {
    if (!user?.uid) return;

    const stopWatcher = startAgentNotificationWatcher(user.uid, (newOp) => {
      // Déclenche l'alerte visuelle flottante et actualise les listes
      setToastAlert({
        title: `🚨 ${newOp.title}`,
        message: `${newOp.operationNumber} · Tâche prioritaire affectée à votre guichet (${newOp.agencyName || 'Agence'}).`,
        isUrgent:
          newOp.priority === 'maintenant' ||
          newOp.priority === 'tres_urgent' ||
          newOp.priority === 'urgent',
        operationId: newOp.id,
      });
      void loadOperations();
    });

    return () => {
      stopWatcher();
    };
  }, [user?.uid]);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      setToastAlert({
        title: '🔔 Notifications Push Activées',
        message: 'Vous recevrez désormais les alertes des opérations urgentes même en arrière-plan.',
        isUrgent: false,
      });
    } else {
      alert('Veuillez activer les autorisations de notification dans les paramètres de votre navigateur.');
    }
  };

  const handleTestNotification = async () => {
    setTestNotificationLoading(true);
    try {
      const ok = await triggerTestUrgentNotification(user?.displayName);
      if (ok) {
        setNotificationPermission('granted');
        setToastAlert({
          title: '🚨 Test Notification Réussi',
          message: 'Une notification push locale d’opération urgente a été émise avec succès.',
          isUrgent: true,
        });
      }
    } finally {
      setTestNotificationLoading(false);
    }
  };

  const handleManualCacheSync = async () => {
    setCacheSyncLoading(true);
    try {
      const res = await syncOperationsToIndexedDBCache({
        agentId: user?.uid,
        agencyId: user?.agencyId || undefined,
      });
      await loadOperations();
      setToastAlert({
        title: '💾 Cache IndexedDB Synchronisé',
        message: `${res.syncedCount} opérations synchronisées dans le cache local. Disponibles sans connexion internet.`,
        isUrgent: false,
      });
    } catch (e: any) {
      alert(`Erreur de synchronisation du cache : ${e?.message || 'Inconnue'}`);
    } finally {
      setCacheSyncLoading(false);
    }
  };

  const handleMarkComplete = async (opId: string) => {
    setCompletingId(opId);
    try {
      await db.operations.update(opId, {
        status: 'termine',
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      await db.syncQueue.add({
        entity: 'operation',
        entityId: opId,
        operation: 'update',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await loadOperations();
      void triggerSyncNow();
    } catch {
      // ignore
    } finally {
      setCompletingId(null);
    }
  };

  const handleSelectView = (view: AgentView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'reports') {
      handleSelectView('reports');
    } else if (item === 'billetage' || item === 'accounting') {
      handleSelectView('billetage');
    } else if (item === 'salaries') {
      handleSelectView('salary');
    } else if (item === 'transfers') {
      handleSelectView('transfers');
    } else if (item === 'debts') {
      handleSelectView('debts');
    } else if (item === 'chat') {
      handleSelectView('chat');
    } else if (item === 'dashboard' || item === 'transactions') {
      handleSelectView('overview');
    }
  };

  const sidebarActiveItem =
    activeView === 'overview'
      ? 'dashboard'
      : activeView === 'salary'
        ? 'salaries'
        : activeView;

  const pendingOps = assignedOperations.filter((o) => o.status !== 'termine');
  const pendingOpsCount = pendingOps.length;
  const urgentOpsCount = pendingOps.filter(
    (o) =>
      o.priority === 'maintenant' ||
      o.priority === 'tres_urgent' ||
      o.priority === 'urgent'
  ).length;

  return (
    <AppLayout
      title="Espace Agent — Ets AMANI"
      subtitle="Guichet, exécution des opérations & tenue de caisse locale"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => handleSelectView('chat')}
    >
      <div className="space-y-6">
        {/* Banner Agent */}
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-emerald-400/50 shadow-lg shrink-0"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-xl font-black tracking-tight sm:text-2xl lg:text-3xl truncate">
                    Guichet & Opérations
                  </h1>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30 shrink-0">
                    Poste Opérationnel
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-300 truncate">
                  Agent : <strong>{user?.displayName}</strong> ({user?.function || 'Guichetier'}) • Agence :{' '}
                  <span className="font-semibold">{agencyLabel || user?.agencyId || 'Centrale'}</span>
                </p>
              </div>
            </div>

            {/* Barre de navigation rapide du banner */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'reports' ? 'overview' : 'reports')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'reports'
                    ? 'bg-blue-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Mes Rapports</span>
                {pendingReportsBadge > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                    {pendingReportsBadge}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'billetage' ? 'overview' : 'billetage')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'billetage'
                    ? 'bg-emerald-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>Billetage Caisse</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'salary' ? 'overview' : 'salary')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'salary'
                    ? 'bg-amber-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                }`}
              >
                <WalletCards className="h-4 w-4" />
                <span>Mon Salaire</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'transfers' ? 'overview' : 'transfers')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'transfers'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>Transferts</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'debts' ? 'overview' : 'debts')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'debts'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Scale className="h-4 w-4" />
                <span>Dettes</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'chat' ? 'overview' : 'chat')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'chat'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Chat</span>
              </button>

              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl bg-red-500/20 px-3.5 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-500/30"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barre de navigation d'espace de travail avec onglets et fil d'Ariane */}
        <WorkspaceNavigationHeader
          workspaceTitle="Espace Agent Guichet"
          category={agencyLabel || 'Guichet Local'}
          activeModuleTitle={
            activeView === 'overview'
              ? 'Missions & Opérations'
              : activeView === 'reports'
                ? 'Mes Rapports d\'Activité'
                : activeView === 'billetage'
                  ? 'Billetage & Tenue de Caisse'
                  : activeView === 'salary'
                    ? 'Fiche de Rémunération'
                    : activeView === 'transfers'
                      ? 'Transferts Inter-Agences'
                      : activeView === 'debts'
                        ? 'Engagements & Dettes'
                        : 'Messagerie & Alertes'
          }
          activeModuleDescription={
            activeView === 'overview'
              ? 'Tâches opérationnelles, exécution de retraits/dépôts et missions locales'
              : activeView === 'reports'
                ? 'Formulaires adaptatifs guidés, déclaration d\'activités, brouillons sécurisés et transmission hiérarchique'
                : activeView === 'billetage'
                  ? 'Comptage physique des coupures USD et CDF et justification de caisse'
                  : activeView === 'salary'
                    ? 'Consultation de vos fiches de paie et historiques de salaires'
                    : activeView === 'transfers'
                      ? 'Envoi et réception des transferts inter-agences pour les clients'
                      : activeView === 'debts'
                        ? 'Gestion des créances et dettes de votre agence'
                        : 'Échanges en temps réel avec la Direction et les collègues'
          }
          backLabel="Missions & Guichet"
          onBack={() => handleSelectView('overview')}
          tabs={AGENT_TABS.map((tab) => ({
            ...tab,
            badge:
              tab.id === 'overview' && pendingOpsCount > 0
                ? pendingOpsCount
                : tab.id === 'reports' && pendingReportsBadge > 0
                  ? pendingReportsBadge
                  : undefined,
          }))}
          activeTabId={activeView}
          onTabChange={(id) => handleSelectView(id as AgentView)}
        />

        {/* CONTENU PRINCIPAL DU WORKSPACE : Immédiatement visible selon la vue sélectionnée */}
        {activeView === 'reports' && (
          <div className="relative animate-in fade-in duration-200">
            <ReportsModule
              onClose={() => handleSelectView('overview')}
              onOpenBilletage={() => handleSelectView('billetage')}
            />
          </div>
        )}

        {activeView === 'billetage' && (
          <div className="relative animate-in fade-in duration-200">
            <BilletageModule onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {activeView === 'salary' && (
          <div className="relative animate-in fade-in duration-200">
            <SalaryModule mode="agent" onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {activeView === 'transfers' && (
          <div className="relative animate-in fade-in duration-200">
            <TreasuryTransfersDebtsModule
              mode="transfers"
              onClose={() => handleSelectView('overview')}
            />
          </div>
        )}

        {activeView === 'debts' && (
          <div className="relative animate-in fade-in duration-200">
            <TreasuryTransfersDebtsModule
              mode="debts"
              onClose={() => handleSelectView('overview')}
            />
          </div>
        )}

        {activeView === 'chat' && (
          <div className="relative animate-in fade-in duration-200">
            <ChatModule onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {/* Vue d'ensemble (Missions & Guichet) */}
        {activeView === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Alerte flottante In-App pour nouvelle tâche urgente */}
            {toastAlert && (
              <div
                role="alert"
                className={`flex items-start justify-between gap-3 rounded-2xl p-4 shadow-lg transition-all animate-in slide-in-from-top-4 duration-300 ${
                  toastAlert.isUrgent
                    ? 'border border-rose-300 bg-rose-50 text-rose-950'
                    : 'border border-emerald-300 bg-emerald-50 text-emerald-950'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${
                      toastAlert.isUrgent
                        ? 'bg-rose-600 shadow-rose-600/30'
                        : 'bg-emerald-600 shadow-emerald-600/30'
                    }`}
                  >
                    <BellRing className="h-5 w-5 animate-bounce" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm">{toastAlert.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed text-slate-700">{toastAlert.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToastAlert(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-700 transition"
                  title="Fermer l'alerte"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Bannière de Contrôle des Notifications Push Locales (Arrière-plan) */}
            <div
              className={`rounded-3xl border p-5 shadow-xs transition-all ${
                notificationPermission === 'granted'
                  ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-slate-50'
                  : 'border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
                      notificationPermission === 'granted'
                        ? 'bg-emerald-600 shadow-emerald-600/20'
                        : 'bg-amber-500 shadow-amber-500/30'
                    }`}
                  >
                    {notificationPermission === 'granted' ? (
                      <Bell className="h-6 w-6" />
                    ) : (
                      <BellRing className="h-6 w-6 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900 tracking-tight">
                        Système d'Alertes Push Locales & Tâches Urgentes
                      </h3>
                      {notificationPermission === 'granted' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Actif en arrière-plan (Service Worker)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300/60">
                          Autorisation requise
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {notificationPermission === 'granted'
                        ? 'Le capteur d’arrière-plan vérifie en continu les nouvelles missions et tâches prioritaires assignées à votre guichet.'
                        : 'Autorisez les notifications push pour être averti immédiatement des opérations urgentes même quand l’application est minimisée.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {notificationPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 hover:brightness-110 transition active:scale-95"
                    >
                      <Bell className="h-4 w-4" />
                      <span>Activer les notifications</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      disabled={testNotificationLoading}
                      className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 disabled:opacity-60"
                    >
                      <BellRing className="h-4 w-4 text-emerald-600" />
                      <span>{testNotificationLoading ? 'Test en cours...' : 'Tester une notification urgente'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Rapides Guichet & Indicateurs Clés */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Missions Affectées
                  </span>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {pendingOpsCount}
                  </p>
                  <p className="text-xs text-amber-600 font-semibold">À exécuter au guichet</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
                    Tâches Urgentes
                  </span>
                  <p className="mt-1 text-2xl font-black text-rose-700">
                    {urgentOpsCount}
                  </p>
                  <p className="text-xs text-rose-600 font-semibold">Priorité haute / immédiate</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <BellRing className="h-6 w-6 animate-pulse" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Opérations Terminées
                  </span>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {assignedOperations.filter((o) => o.status === 'termine').length}
                  </p>
                  <p className="text-xs text-emerald-600 font-semibold">Enregistrées avec succès</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Alertes Arrière-Plan
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {notificationPermission === 'granted' ? 'Système Actif' : 'En veille'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {notificationPermission === 'granted' ? 'Vibreur & sonnerie' : 'Autorisation en attente'}
                  </p>
                </div>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    notificationPermission === 'granted'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Bell className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Mode Hors-Ligne
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">100% Fonctionnel</p>
                  <p className="text-xs text-slate-500">Dexie synchronise en continu</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Wifi className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Hub de Cache Local IndexedDB pour Consultation Hors-Ligne */}
            <div className="rounded-3xl border border-blue-200/90 bg-gradient-to-br from-blue-50/90 via-slate-50 to-indigo-50/60 p-5 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-white/30">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900 tracking-tight">
                        Mise en Cache Locale IndexedDB (Dexie)
                      </h3>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Accessible sans connexion internet
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isOnline
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                        }`}
                      >
                        <Wifi className="h-3 w-3" />
                        <span>{isOnline ? 'En ligne' : 'Hors-ligne'}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      <strong>{cacheSummary.total} opérations synchronisées</strong> en stockage persistant local · Dernière synchro :{' '}
                      <span className="font-semibold text-slate-800">
                        {formatRelativeCacheTime(cacheMetadata.lastSyncTimestamp)}
                      </span>
                      {cacheSummary.totalUsdAmount > 0 && (
                        <span> · Volume : <strong>{cacheSummary.totalUsdAmount.toLocaleString('fr-FR')} USD</strong></span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleManualCacheSync}
                    disabled={cacheSyncLoading}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${cacheSyncLoading ? 'animate-spin' : ''}`} />
                    <span>{cacheSyncLoading ? 'Synchronisation...' : 'Synchroniser le cache'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Liste des Opérations & Missions affectées avec Recherche & Filtres Hors-Ligne */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Missions & Opérations Synchronisées</h2>
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      IndexedDB
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Consultez l'historique complet et traitez vos tâches même hors-ligne
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadOperations}
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Actualiser</span>
                </button>
              </div>

              {/* Barre de Recherche et Filtres du Cache Local */}
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-1">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={offlineSearchQuery}
                    onChange={(e) => setOfflineSearchQuery(e.target.value)}
                    placeholder="Rechercher dans le cache (N° opération, client, agence, libellé)..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/10"
                  />
                  {offlineSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOfflineSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtres de statut */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('all')}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                      offlineFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Toutes ({cacheSummary.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('pending')}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                      offlineFilter === 'pending'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    En attente ({cacheSummary.pending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('urgent')}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                      offlineFilter === 'urgent'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Urgentes ({cacheSummary.urgent})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('termine')}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                      offlineFilter === 'termine'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Terminées ({cacheSummary.completed})
                  </button>
                </div>
              </div>

              {assignedOperations.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Briefcase className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">Aucune opération trouvée</p>
                  <p className="text-xs text-slate-500">
                    {offlineSearchQuery
                      ? 'Aucun résultat ne correspond à votre recherche dans le cache local.'
                      : 'Le cache local est à jour et ne contient aucune tâche en attente.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assignedOperations.map((op) => {
                    const isUrgent =
                      op.priority === 'maintenant' ||
                      op.priority === 'tres_urgent' ||
                      op.priority === 'urgent';

                    return (
                      <div
                        key={op.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{op.operationNumber}</span>
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-bold uppercase text-blue-700 text-[10px]">
                              {op.type}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-semibold text-[10px] ${
                                op.status === 'termine'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {op.status === 'termine' ? '✓ Terminé' : 'En attente d\'exécution'}
                            </span>
                            {isUrgent && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 uppercase animate-pulse">
                                {op.priority === 'maintenant'
                                  ? '⚡ Immédiat'
                                  : op.priority === 'tres_urgent'
                                  ? '🚨 Très urgent'
                                  : '⚠️ Urgent'}
                              </span>
                            )}
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 flex items-center gap-1">
                              <Database className="h-2.5 w-2.5 text-blue-500" />
                              <span>En cache</span>
                            </span>
                          </div>

                          <p className="font-bold text-sm text-slate-900">{op.title}</p>
                          <p className="text-slate-600 line-clamp-2 text-xs leading-relaxed">{op.description}</p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                            {op.amount !== undefined && (
                              <span className="font-bold text-emerald-700">
                                Montant : {op.amount.toLocaleString('fr-FR')} {op.currency}
                              </span>
                            )}
                            {op.operatorName && (
                              <span>Opérateur : <strong className="text-slate-700">{op.operatorName}</strong></span>
                            )}
                            {op.accountNumber && (
                              <span>Compte : <strong className="text-slate-700">{op.accountNumber}</strong></span>
                            )}
                            <span>Agence : <strong>{op.agencyName || 'Locale'}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => setSelectedOperationDetail(op)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                            title="Consulter les détails hors-ligne"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            <span>Détails</span>
                          </button>

                          {op.status !== 'termine' && (
                            <button
                              type="button"
                              disabled={completingId === op.id}
                              onClick={() => handleMarkComplete(op.id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              <span>{completingId === op.id ? 'Clôture...' : 'Valider'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal d'inspection détaillée d'une opération en cache (100% Hors-Ligne) */}
            {selectedOperationDetail && (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
              >
                <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-900 space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-slate-100 px-2.5 py-1 rounded-lg text-slate-800">
                          {selectedOperationDetail.operationNumber}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          IndexedDB Cache
                        </span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 mt-2">
                        {selectedOperationDetail.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOperationDetail(null)}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Type d'opération</span>
                        <span className="font-bold text-slate-800 uppercase">{selectedOperationDetail.type}</span>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Priorité</span>
                        <span className="font-bold text-slate-800 uppercase">{selectedOperationDetail.priority}</span>
                      </div>
                    </div>

                    {selectedOperationDetail.amount !== undefined && (
                      <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200 p-4 text-emerald-900">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">Montant opération</span>
                        <span className="text-xl font-black">
                          {selectedOperationDetail.amount.toLocaleString('fr-FR')} {selectedOperationDetail.currency}
                        </span>
                      </div>
                    )}

                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 space-y-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Description</span>
                        <p className="text-slate-700 mt-0.5 leading-relaxed">
                          {selectedOperationDetail.description || 'Aucune description détaillée.'}
                        </p>
                      </div>

                      {selectedOperationDetail.comments && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Commentaires / Notes</span>
                          <p className="text-slate-700 mt-0.5 italic">{selectedOperationDetail.comments}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-600">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Agence</span>
                        <span className="font-semibold">{selectedOperationDetail.agencyName || 'Locale'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Opérateur / Compte</span>
                        <span className="font-semibold">
                          {selectedOperationDetail.operatorName || '-'} {selectedOperationDetail.accountNumber ? `(${selectedOperationDetail.accountNumber})` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Statut synchronisation</span>
                        <span className="font-semibold text-emerald-700">✓ Synchronisé en cache local</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Enregistré le</span>
                        <span className="font-semibold">
                          {new Date(selectedOperationDetail.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Database className="h-3 w-3 text-blue-500" />
                      Consultable hors-ligne à tout moment
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedOperationDetail(null)}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
