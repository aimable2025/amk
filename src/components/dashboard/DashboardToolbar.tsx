import type { ReactNode } from 'react';
import {
  Grid2X2,
  List,
  Search,
} from 'lucide-react';

export type DashboardViewMode = 'list' | 'grid' | 'compact';

export interface DashboardToolbarProps {
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  className?: string;
}

export default function DashboardToolbar({
  viewMode,
  onViewModeChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Rechercher...',
  children,
  className = '',
}: DashboardToolbarProps) {
  return (
    <div
      className={[
        'flex flex-col gap-3',
        'rounded-2xl border border-slate-200 bg-white p-3',
        'shadow-sm',
        'sm:flex-row sm:items-center sm:justify-between',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onSearchChange && (
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchValue}
              onChange={(event) =>
                onSearchChange(event.target.value)
              }
              placeholder={searchPlaceholder}
              className={[
                'h-11 w-full rounded-xl border border-slate-200',
                'bg-slate-50 pl-10 pr-4 text-sm text-slate-900',
                'outline-none transition',
                'placeholder:text-slate-400',
                'focus:border-slate-400 focus:bg-white',
                'focus:ring-2 focus:ring-slate-900/5',
              ].join(' ')}
            />
          </div>
        )}
        {children}
      </div>
      <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          aria-label="Afficher en vue actuelle"
          aria-pressed={viewMode === 'list'}
          className={[
            'flex h-9 items-center gap-2 rounded-lg px-3',
            'text-xs font-semibold transition',
            viewMode === 'list'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900',
          ].join(' ')}
        >
          <List className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">
            Vue actuelle
          </span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          aria-label="Afficher en grille"
          aria-pressed={viewMode === 'grid'}
          className={[
            'flex h-9 items-center gap-2 rounded-lg px-3',
            'text-xs font-semibold transition',
            viewMode === 'grid'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900',
          ].join(' ')}
        >
          <Grid2X2 className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">
            Grille
          </span>
        </button>
      </div>
    </div>
  );
}
