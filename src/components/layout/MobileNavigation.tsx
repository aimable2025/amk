import {
  Activity,
  LayoutDashboard,
  Menu,
  User
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';

export type MobileNavigationItem =
  | 'dashboard'
  | 'activity'
  | 'profile';

interface MobileNavigationProps {
  activeItem?: MobileNavigationItem;
  onNavigate?: (item: MobileNavigationItem) => void;
  onMenuClick?: () => void;
}

interface NavigationItem {
  id: MobileNavigationItem;
  label: string;
  icon: typeof LayoutDashboard;
}

const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Accueil',
    icon: LayoutDashboard
  },
  {
    id: 'activity',
    label: 'Activité',
    icon: Activity
  },
  {
    id: 'profile',
    label: 'Profil',
    icon: User
  }
];

export default function MobileNavigation({
  activeItem = 'dashboard',
  onNavigate,
  onMenuClick
}: MobileNavigationProps) {
  const { user } = useAuth();
  const handleNavigate = (item: MobileNavigationItem) => {
    onNavigate?.(item);
  };

  return (
    <nav
      aria-label="Navigation principale mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-all',
                isActive
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
              ].join(' ')}
            >
              {item.id === 'profile' && user ? (
                <UserAvatar
                  user={user}
                  size="xs"
                  className="h-5 w-5 ring-1 ring-white/40"
                />
              ) : (
                <Icon
                  size={19}
                  strokeWidth={isActive ? 2.3 : 1.9}
                />
              )}
              <span className="text-[10px] font-semibold sm:text-[11px]">
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu principal"
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <Menu
            size={19}
            strokeWidth={1.9}
          />
          <span className="text-[10px] font-semibold sm:text-[11px]">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
}
