import type { ReactNode } from 'react';

export interface DashboardModuleGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  gap?: 'small' | 'medium' | 'large';
  className?: string;
}

const columnStyles = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
};

const gapStyles = {
  small: 'gap-3',
  medium: 'gap-4',
  large: 'gap-6',
};

export default function DashboardModuleGrid({
  children,
  columns = 3,
  gap = 'medium',
  className = '',
}: DashboardModuleGridProps) {
  return (
    <div
      className={[
        'grid w-full',
        columnStyles[columns],
        gapStyles[gap],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
