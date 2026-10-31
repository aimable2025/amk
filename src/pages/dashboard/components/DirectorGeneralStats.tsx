import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileText,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';

interface Props {
  totalAgencies?: number;
  agenciesSubtitle?: string;
  totalAgencyAdmins?: number;
  totalAgents?: number;
  totalClients?: number;
  totalSubscribers?: number;
  pendingRegistrations?: number;
  activeOperations?: number;
  completedOperations?: number;
  totalReports?: number;
  pendingValidations?: number;
  totalBilletageCountedUSD?: number;
  totalBilletageCountedCDF?: number;
  billetageCount?: number;
  onSelectModule?: (moduleId: string) => void;
}

export default function DirectorGeneralStats({
  totalAgencies = 0,
  agenciesSubtitle,
  totalAgencyAdmins = 0,
  totalAgents = 0,
  totalClients = 0,
  totalSubscribers = 0,
  pendingRegistrations = 0,
  activeOperations = 0,
  completedOperations = 0,
  totalReports = 0,
  pendingValidations = 0,
  totalBilletageCountedUSD = 0,
  totalBilletageCountedCDF = 0,
  billetageCount = 0,
  onSelectModule,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Ligne principale : 4 KPI Exécutifs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1 : Trésorerie & Billetage */}
        <div
          onClick={() => onSelectModule?.('billetage')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('billetage');
            }
          }}
          className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-150 ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Billetage & Caisse (USD / CDF)
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-3xl">
                {totalBilletageCountedUSD > 0 || totalBilletageCountedCDF > 0
                  ? `$${totalBilletageCountedUSD.toLocaleString('fr-FR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}`
                  : '0 $'}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-emerald-700 tabular-nums">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {totalBilletageCountedCDF > 0
                  ? `${totalBilletageCountedCDF.toLocaleString('fr-FR')} CDF (${billetageCount} comptage${billetageCount > 1 ? 's' : ''})`
                  : totalBilletageCountedUSD > 0
                    ? `${billetageCount} comptage${billetageCount > 1 ? 's' : ''} vérifié${billetageCount > 1 ? 's' : ''}`
                    : 'Aucune donnée disponible'}
              </span>
            </div>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900" />
            )}
          </div>
        </div>

        {/* KPI 2 : Réseau des Agences */}
        <div
          onClick={() => onSelectModule?.('agencies')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('agencies');
            }
          }}
          className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-150 ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Agences actives
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-3xl">
                {totalAgencies}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-blue-600 group-hover:text-white">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="truncate text-slate-500">
              {totalAgencies === 0
                ? 'Aucune donnée disponible'
                : agenciesSubtitle || 'Réseau Ets AMANI'}
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900" />
            )}
          </div>
        </div>

        {/* KPI 3 : Missions & Opérations */}
        <div
          onClick={() => onSelectModule?.('operations-management')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('operations-management');
            }
          }}
          className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-150 ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Opérations & missions en cours
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-3xl">
                {activeOperations}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="truncate text-slate-500">
              {activeOperations === 0 && completedOperations === 0
                ? 'Aucune donnée disponible'
                : `${completedOperations} terminée${completedOperations > 1 ? 's' : ''} · ${activeOperations} en cours`}
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900" />
            )}
          </div>
        </div>

        {/* KPI 4 : Personnel & Agents */}
        <div
          onClick={() => onSelectModule?.('agents-management')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('agents-management');
            }
          }}
          className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-150 ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Agents actifs réseau
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-3xl">
                {totalAgents}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="truncate text-slate-500">
              {totalAgents === 0 && totalAgencyAdmins === 0
                ? 'Aucune donnée disponible'
                : `${totalAgencyAdmins} Administrateur${totalAgencyAdmins > 1 ? 's' : ''} d'Agence actif${totalAgencyAdmins > 1 ? 's' : ''}`}
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900" />
            )}
          </div>
        </div>
      </div>

      {/* Ruban synthétique complémentaire : Indicateurs réels de gouvernance & supervision */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onSelectModule?.('agency-admins-management')}
          className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-2xs transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Administrateurs d'Agence
            </p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
              {totalAgencyAdmins}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {totalAgencyAdmins === 0 ? 'Aucune donnée disponible' : 'Responsables actifs'}
            </p>
          </div>
          <UserCog className="h-4 w-4 shrink-0 text-blue-600" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('registration-requests')}
          className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-2xs transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Clients & Abonnés
            </p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
              {totalClients + totalSubscribers}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {totalClients + totalSubscribers === 0
                ? 'Aucune donnée disponible'
                : `${totalClients} client${totalClients > 1 ? 's' : ''} · ${totalSubscribers} abonné${totalSubscribers > 1 ? 's' : ''}`}
            </p>
          </div>
          <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('registration-requests')}
          className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-2xs transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Demandes en attente
            </p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
              {pendingRegistrations}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {pendingRegistrations === 0
                ? 'Aucune demande en attente'
                : 'Dossiers à examiner'}
            </p>
          </div>
          <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-600" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('reports-center')}
          className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-2xs transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Rapports à consulter
            </p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
              {totalReports}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {totalReports === 0 ? 'Aucune donnée disponible' : 'États & clôtures'}
            </p>
          </div>
          <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
        </button>

        <button
          type="button"
          onClick={() =>
            onSelectModule?.(
              pendingValidations > 0 ? 'salaries-management' : 'audit-logs'
            )
          }
          className="col-span-2 sm:col-span-1 flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-2xs transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Validations & Alertes
            </p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
              {pendingValidations}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {pendingValidations === 0
                ? 'Aucune validation requise'
                : 'Éléments à valider par le DG'}
            </p>
          </div>
          {pendingValidations > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
        </button>
      </div>
    </div>
  );
}

