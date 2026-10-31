import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Lock,
} from 'lucide-react';

export interface DashboardModuleCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  badge?: string;
  variant?:
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger';
  showArrow?: boolean;
  className?: string;
}

const variantStyles = {
  default: {
    icon: 'bg-slate-100 text-slate-700',
    badge: 'bg-slate-100 text-slate-600',
  },
  primary: {
    icon: 'bg-blue-100 text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
  },
  success: {
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  warning: {
    icon: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  danger: {
    icon: 'bg-red-100 text-red-700',
    badge: 'bg-red-100 text-red-700',
  },
};

export default function DashboardModuleCard({
  title,
  description,
  icon: Icon,
  onClick,
  disabled = false,
  locked = false,
  badge,
  variant = 'default',
  showArrow = true,
  className = '',
}: DashboardModuleCardProps) {
  const isUnavailable = disabled || locked;

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div
          className={[
            'flex h-12 w-12 shrink-0 items-center justify-center',
            'rounded-2xl transition-transform duration-200',
            variantStyles[variant].icon,
            !isUnavailable && 'group-hover:scale-105',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {locked ? (
            <Lock className="h-5 w-5" strokeWidth={2} />
          ) : (
            <Icon className="h-5 w-5" strokeWidth={2} />
          )}
        </div>
        {showArrow && !locked && (
          <ArrowRight
            className={[
              'h-5 w-5 shrink-0 transition-transform duration-200',
              isUnavailable
                ? 'text-slate-300'
                : 'text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700',
            ].join(' ')}
          />
        )}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900">
            {title}
          </h3>
          {badge && (
            <span
              className={[
                'rounded-full px-2.5 py-1 text-[10px] font-bold',
                'uppercase tracking-wide',
                variantStyles[variant].badge,
              ].join(' ')}
            >
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        )}
      </div>
    </>
  );

  const classes = [
    'group w-full rounded-3xl border border-slate-200 bg-white p-5',
    'text-left shadow-sm transition-all duration-200',
    'sm:p-6',
    isUnavailable
      ? 'cursor-not-allowed opacity-60'
      : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
    className,
  ].join(' ');

  if (isUnavailable || !onClick) {
    return (
      <div
        className={classes}
        aria-disabled={isUnavailable}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  );
}
