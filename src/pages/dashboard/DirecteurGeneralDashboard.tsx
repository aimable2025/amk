import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Coins,
  FileText,
  Grid2X2,
  LayoutGrid,
  List,
  LogOut,
  MessageSquare,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import WorkspaceNavigationHeader from '../../components/dashboard/WorkspaceNavigationHeader';
import {
  type DashboardViewMode,
} from '../../components/dashboard/DashboardToolbar';
import DirectorGeneralStats from './components/DirectorGeneralStats';
import {
  DG_MODULES,
  type DgModuleCategory,
  type DgModuleItem,
} from './components/DirectorGeneralModules';
import BilletageModule from './components/BilletageModule';
import InternalNumbersModule from './components/InternalNumbersModule';
import OperationModule from './components/OperationModule';
import ConnectivityModule from './components/ConnectivityModule';
import AgentManagementModule from './components/AgentManagementModule';
import RegistrationRequestsModule from './components/RegistrationRequestsModule';
import AuditModule from './components/AuditModule';
import SystemConfigModule from './components/SystemConfigModule';
import AgenciesModule from './components/AgenciesModule';
import ReportsModule from './components/ReportsModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import { getDgFeatures } from '../../services/DgFeatureService';
import { getAgencies } from '../../services/AgencyService';
import { getAllSystemUsers } from '../../services/SystemUserService';
import { db } from '../../lib/db';
import {
  subscribeToDirectorGeneralConfig,
  type DirectorGeneralConfig,
} from '../../services/DirectorGeneralService';
import type { DgFeatures } from '../../types/management';

interface ExecutivePoleSection {
  key: DgModuleCategory;
  index: string;
  title: string;
  subtitle: string;
}

const EXECUTIVE_POLES: ExecutivePoleSection[] = [
  {
    key: 'finance',
    index: '01',
    title: 'Finance, Paie & Trésorerie',
    subtitle: 'Gestion des salaires et avances, transferts inter-agences, suivi des dettes et états certifiés.',
  },
  {
    key: 'operations',
    index: '02',
    title: 'Opérations & Contrôle de Caisse',
    subtitle: 'Billetage contradictoire USD/CDF, affectation des missions réseau et supervision de la flotte SMS.',
  },
  {
    key: 'network',
    index: '03',
    title: 'Réseau d’Agences, Personnel & Communication',
    subtitle: 'Administration des succursales, habilitations des agents, messagerie interne et synchronisation.',
  },
  {
    key: 'oversight',
    index: '04',
    title: 'Gouvernance, Conformité & Audit',
    subtitle: 'Validation des dossiers clients/abonnés et journal d’audit immuable des opérations.',
  },
  {
    key: 'settings',
    index: '05',
    title: 'Paramètres de Direction',
    subtitle: 'Configuration générale du poste de Direction Générale et préférences système.',
  },
];

const CATEGORY_FILTER_TABS: Array<{ id: DgModuleCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Vue globale' },
  { id: 'finance', label: 'Finance & Paie' },
  { id: 'operations', label: 'Opérations & Caisse' },
  { id: 'network', label: 'Réseau & Équipes' },
  { id: 'oversight', label: 'Audit & Conformité' },
  { id: 'settings', label: 'Configuration' },
];

export default function DirecteurGeneralDashboard() {
  const { user, signOut } = useAuth();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DgModuleCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<DashboardViewMode>('grid');
  const [features, setFeatures] = useState<DgFeatures | undefined>(undefined);
  const [dgConfig, setDgConfig] = useState<DirectorGeneralConfig | null>(null);

  const [totalAgencies, setTotalAgencies] = useState(0);
  const [agenciesSubtitle, setAgenciesSubtitle] = useState<string | undefined>(undefined);
  const [totalAgents, setTotalAgents] = useState(0);
  const [activeOperations, setActiveOperations] = useState(0);
  const [totalBilletageUSD, setTotalBilletageUSD] = useState(0);
  const [totalBilletageCDF, setTotalBilletageCDF] = useState(0);

  const loadDashboardStats = async () => {
    try {
      const [agenciesList, usersList, opsList, billetagesList] = await Promise.all([
        getAgencies(),
        getAllSystemUsers(),
        db.operations.toArray(),
        db.billetages.toArray(),
      ]);

      const activeAgencies = agenciesList.filter((a) => a.status !== 'inactive');
      setTotalAgencies(activeAgencies.length);
      const cities = Array.from(
        new Set(activeAgencies.map((a) => a.city?.trim()).filter(Boolean))
      );
      setAgenciesSubtitle(
        cities.length > 0
          ? cities.join(', ')
          : activeAgencies.length > 0
            ? activeAgencies.map((a) => a.name).slice(0, 3).join(', ')
            : 'Aucune agence enregistrée'
      );

      const agentsCount = usersList.filter(
        (u) => u.role === 'agent' && u.status === 'active'
      ).length;
      setTotalAgents(agentsCount);

      const activeOpsCount = opsList.filter(
        (o) =>
          o.status !== 'termine' &&
          o.status !== 'annule' &&
          o.status !== 'rejete' &&
          o.status !== 'archive'
      ).length;
      setActiveOperations(activeOpsCount);

      let usdSum = 0;
      let cdfSum = 0;
      for (const b of billetagesList) {
        const val = b.calculatedTotal || b.declaredAmount || 0;
        if (b.currency === 'USD') usdSum += val;
        if (b.currency === 'CDF') cdfSum += val;
      }
      setTotalBilletageUSD(usdSum);
      setTotalBilletageCDF(cdfSum);
    } catch (err) {
      console.warn('[Ets AMANI] Chargement statistiques DG :', err);
    }
  };

  useEffect(() => {
    getDgFeatures().then(setFeatures).catch(() => {});
    void loadDashboardStats();
    const statsInterval = setInterval(loadDashboardStats, 10000);
    const unsub = subscribeToDirectorGeneralConfig((cfg) => {
      setDgConfig(cfg);
    });
    return () => {
      clearInterval(statsInterval);
      unsub();
    };
  }, [activeModuleId]);

  const isSuspended =
    user?.status === 'suspended' || dgConfig?.status === 'suspended';

  const availableModules = useMemo(() => {
    return DG_MODULES.filter((mod) =>
      mod.isAvailable ? mod.isAvailable(features) : true
    );
  }, [features]);

  const visibleModules = useMemo(() => {
    return availableModules.filter((mod) => {
      if (selectedCategory !== 'all' && mod.category !== selectedCategory) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        mod.title.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q)
      );
    });
  }, [availableModules, selectedCategory, search]);

  const activeModuleMeta = useMemo(
    () => DG_MODULES.find((m) => m.id === activeModuleId) || null,
    [activeModuleId]
  );

  const siblingModules = useMemo(() => {
    if (!activeModuleMeta) return [];
    return availableModules.filter((m) => m.category === activeModuleMeta.category);
  }, [availableModules, activeModuleMeta]);

  const handleOpenModule = (id: string) => {
    setActiveModuleId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    const map: Record<string, string | null> = {
      dashboard: null,
      transactions: 'operations-management',
      billetage: 'billetage',
      agencies: 'agencies',
      members: 'agents-management',
      reports: 'reports-center',
      transfers: 'inter-agency-transfers',
      debts: 'debts-management',
      accounting: 'inter-agency-transfers',
      salaries: 'salaries-management',
      commissions: 'operations-management',
      chat: 'internal-chat',
      alerts: 'audit-logs',
      regulations: 'registration-requests',
      settings: 'dg-config',
    };
    if (item in map) {
      setActiveModuleId(map[item]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const renderModuleItems = (items: DgModuleItem[]) => {
    if (viewMode === 'list') {
      return (
        <div className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenModule(item.id)}
                className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/90"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span className="text-xs font-semibold text-slate-500">
                          · {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600 group-hover:text-slate-950">
                  <span className="hidden sm:inline">Ouvrir</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <DashboardModuleGrid columns={3}>
        {items.map((item) => (
          <DashboardModuleCard
            key={item.id}
            title={item.title}
            description={item.description}
            icon={item.icon}
            variant={item.variant}
            badge={item.badge}
            onClick={() => handleOpenModule(item.id)}
          />
        ))}
      </DashboardModuleGrid>
    );
  };

  const sidebarActiveItem = useMemo(() => {
    if (!activeModuleId) return 'dashboard';
    const reverseMap: Record<string, string> = {
      'operations-management': 'transactions',
      billetage: 'billetage',
      agencies: 'agencies',
      'agents-management': 'members',
      'salaries-management': 'salaries',
      'reports-center': 'reports',
      'inter-agency-transfers': 'transfers',
      'debts-management': 'debts',
      'inter-agency-debts': 'transfers',
      'internal-chat': 'chat',
      'audit-logs': 'alerts',
      'registration-requests': 'regulations',
      'dg-config': 'settings',
    };
    return reverseMap[activeModuleId] || activeModuleId;
  }, [activeModuleId]);

  return (
    <AppLayout
      title="Direction Générale — Ets AMANI"
      subtitle="Pilotage exécutif, trésorerie multi-devises et supervision réseau"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveModuleId('internal-chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-6">
        {activeModuleId ? (
          <section className="space-y-4">
            <WorkspaceNavigationHeader
              workspaceTitle="Direction Générale"
              activeModuleTitle={activeModuleMeta?.title || activeModuleId}
              activeModuleDescription={activeModuleMeta?.description}
              category={
                activeModuleMeta?.category
                  ? EXECUTIVE_POLES.find((p) => p.key === activeModuleMeta.category)?.title
                  : undefined
              }
              onBack={() => setActiveModuleId(null)}
              backLabel="Vue d'ensemble DG"
              tabs={
                siblingModules.length > 1
                  ? siblingModules.map((mod) => ({
                      id: mod.id,
                      label: mod.title,
                      icon: mod.icon,
                    }))
                  : availableModules.map((mod) => ({
                      id: mod.id,
                      label: mod.title,
                      icon: mod.icon,
                    }))
              }
              activeTabId={activeModuleId}
              onTabChange={(id) => handleOpenModule(id)}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenModule('billetage')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Billetage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Déconnexion</span>
                  </button>
                </div>
              }
            />

            <div className="relative">
              {activeModuleId === 'billetage' && (
                <BilletageModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'operations-management' && (
                <OperationModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'internal-numbers' && (
                <InternalNumbersModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'connectivity-sync' && (
                <ConnectivityModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'agencies' && (
                <AgenciesModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'agency-admins-management' && (
                <AgentManagementModule
                  canManageAllAgencies
                  initialTab="agency_admins"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'agents-management' && (
                <AgentManagementModule
                  canManageAllAgencies
                  initialTab="agents"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'registration-requests' && (
                <RegistrationRequestsModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'audit-logs' && (
                <AuditModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'dg-config' && (
                <SystemConfigModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'reports-center' && (
                <ReportsModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'inter-agency-transfers' && (
                <TreasuryTransfersDebtsModule
                  mode="transfers"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'debts-management' && (
                <TreasuryTransfersDebtsModule
                  mode="debts"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'inter-agency-debts' && (
                <TreasuryTransfersDebtsModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'internal-chat' && (
                <ChatModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'salaries-management' && (
                <SalaryModule mode="dg" onClose={() => setActiveModuleId(null)} />
              )}
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-sm sm:p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-4 sm:items-center sm:gap-5">
                  <UserAvatar
                    user={user}
                    size="lg"
                    showStatus
                    isOnline={!isSuspended}
                    className="ring-2 ring-amber-400/60 shadow-md"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                      <span>Poste Exécutif Central</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isSuspended
                            ? 'font-semibold text-amber-400'
                            : 'font-semibold text-emerald-400'
                        }
                      >
                        {isSuspended ? 'Mandat suspendu' : 'Mandat actif'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Synchronisation Offline-First</span>
                    </div>
                    <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
                      Direction Générale — {user?.displayName || 'Directeur Général'}
                    </h1>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                      Supervision consolidée des agences, autorisation de la paie, contrôle des liquidités et gouvernance réseau.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSuspended}
                    onClick={() => handleOpenModule('billetage')}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    <Coins className="h-4 w-4" />
                    Billetage
                  </button>
                  <button
                    type="button"
                    disabled={isSuspended}
                    onClick={() => handleOpenModule('salaries-management')}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    Salaires & Paie
                  </button>
                  <button
                    type="button"
                    disabled={isSuspended}
                    onClick={() => handleOpenModule('reports-center')}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4 text-blue-400" />
                    Rapports
                  </button>
                  <button
                    type="button"
                    disabled={isSuspended}
                    onClick={() => handleOpenModule('operations-management')}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    <ClipboardCheck className="h-4 w-4 text-amber-300" />
                    Missions
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenModule('internal-chat')}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    <MessageSquare className="h-4 w-4 text-sky-400" />
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
                    title="Fermer la session"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Déconnexion</span>
                  </button>
                </div>
              </div>
            </section>

            {isSuspended && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 text-xs">
                    <h3 className="text-sm font-bold text-amber-950">
                      Votre mandat de Direction Générale est momentanément suspendu
                    </h3>
                    <p className="text-amber-800">
                      Motif enregistré par l'Administrateur Système :{' '}
                      <em>« {dgConfig?.suspensionReason || 'Procédure administrative en cours'} »</em>.
                    </p>
                    <p className="text-amber-700">
                      Les opérations décisionnelles sont verrouillées en consultation seule jusqu'à levée de la suspension.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <DirectorGeneralStats
              totalAgencies={totalAgencies}
              agenciesSubtitle={agenciesSubtitle}
              totalAgents={totalAgents}
              activeOperations={activeOperations}
              totalBilletageCountedUSD={totalBilletageUSD}
              totalBilletageCountedCDF={totalBilletageCDF}
              onSelectModule={handleOpenModule}
            />

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                {CATEGORY_FILTER_TABS.map((tab) => {
                  const active = selectedCategory === tab.id;
                  const count =
                    tab.id === 'all'
                      ? availableModules.length
                      : availableModules.filter((m) => m.category === tab.id).length;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedCategory(tab.id)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          active ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un module..."
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Affichage en grille"
                    className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
                      viewMode === 'grid'
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Pôles</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="Affichage en liste compacte"
                    className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
                      viewMode === 'list'
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Liste</span>
                  </button>
                </div>
              </div>
            </div>

            {selectedCategory === 'all' && !search.trim() ? (
              <div className="space-y-8">
                {EXECUTIVE_POLES.map((pole) => {
                  const poleModules = visibleModules.filter(
                    (m) => m.category === pole.key
                  );
                  if (poleModules.length === 0) return null;
                  return (
                    <div key={pole.key} className="space-y-3.5">
                      <div className="flex flex-col justify-between gap-1 border-b border-slate-200/80 pb-2.5 sm:flex-row sm:items-baseline">
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono text-xs font-bold tabular-nums text-slate-400">
                            {pole.index}.
                          </span>
                          <h2 className="text-base font-bold tracking-tight text-slate-900">
                            {pole.title}
                          </h2>
                          <span className="text-xs text-slate-400">
                            · {poleModules.length}{' '}
                            {poleModules.length > 1 ? 'modules' : 'module'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{pole.subtitle}</p>
                      </div>
                      {renderModuleItems(poleModules)}
                    </div>
                  );
                })}
              </div>
            ) : visibleModules.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
                <Grid2X2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-800">
                  Aucun module ne correspond à votre recherche
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Essayez un autre terme ou réinitialisez le filtre de pôle.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearch('');
                  }}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Afficher tous les modules
                </button>
              </div>
            ) : (
              renderModuleItems(visibleModules)
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
