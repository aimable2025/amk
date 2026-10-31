import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

export interface WorkspaceNavigationHeaderProps {
  workspaceTitle: string;
  activeModuleTitle: string;
  activeModuleDescription?: string;
  onBack: () => void;
  backLabel?: string;
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  actions?: ReactNode;
  category?: string;
  className?: string;
}

export default function WorkspaceNavigationHeader({
  workspaceTitle,
  activeModuleTitle,
  activeModuleDescription,
  onBack,
  backLabel = "Vue d'ensemble",
  tabs = [],
  activeTabId,
  onTabChange,
  actions,
  category,
  className = '',
}: WorkspaceNavigationHeaderProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs space-y-3',
        className,
      ].join(' ')}
    >
      {/* Ligne 1 : Fil d'ariane & Bouton Retour + Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 shrink-0"
            title={`Retourner à ${backLabel}`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{backLabel}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 shrink-0 hidden sm:block" />

          {/* Fil d'Ariane */}
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-slate-400 font-medium truncate hidden md:inline">
              {workspaceTitle}
            </span>
            {category && (
              <>
                <ChevronRight className="h-3 w-3 text-slate-300 shrink-0 hidden md:inline" />
                <span className="text-slate-400 font-medium truncate hidden sm:inline">
                  {category}
                </span>
              </>
            )}
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0 hidden sm:inline" />
            <span className="font-bold text-slate-900 truncate">
              {activeModuleTitle}
            </span>
          </nav>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Ligne 2 : Titre & description du module actif */}
      {activeModuleDescription && (
        <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
          {activeModuleDescription}
        </div>
      )}

      {/* Ligne 3 : Barre d'onglets pour basculer directement entre modules autorisés */}
      {tabs.length > 0 && onTabChange && (
        <div className="border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition shrink-0',
                    isActive
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900',
                  ].join(' ')}
                >
                  {Icon && (
                    <Icon
                      className={[
                        'h-3.5 w-3.5',
                        isActive ? 'text-blue-400' : 'text-slate-400',
                      ].join(' ')}
                    />
                  )}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={[
                        'ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 text-slate-700',
                      ].join(' ')}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
