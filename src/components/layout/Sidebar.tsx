import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  Coins,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  WalletCards
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';

interface SidebarProps {
  activeItem?: string;
  onNavigate?: (item: string) => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

const ROLE_LABELS: Record<string, string> = {
  administrateur_systeme: 'Administrateur Système',
  directeur_general: 'Directeur Général',
  administrateur_agence: 'Admin Agence',
  agent: 'Agent Opérationnel',
  client: 'Client Certifié',
  abonne: 'Abonné Privilégié',
};

export default function Sidebar({
  activeItem = 'dashboard',
  onNavigate
}: SidebarProps) {
  const { user, role } = useAuth();

  const handleNavigation = (item: string) => {
    onNavigate?.(item);
  };

  const isPrivilegedOrAgency =
    role === 'administrateur_systeme' ||
    role === 'directeur_general' ||
    role === 'administrateur_agence';

  const mainNavigation: NavigationItem[] =
    role === 'administrateur_systeme'
      ? [
          { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
          { id: 'agencies', label: 'Agences', icon: Building2 },
          { id: 'members', label: 'Utilisateurs & Rôles', icon: Users },
        ]
      : role === 'directeur_general'
        ? [
            { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
            { id: 'transactions', label: 'Opérations Réseau', icon: Activity },
            { id: 'billetage', label: 'Billetage & Caisse', icon: WalletCards },
            { id: 'agencies', label: 'Agences', icon: Building2 },
            { id: 'members', label: 'Agents & Services', icon: Users },
          ]
        : role === 'administrateur_agence'
          ? [
              { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
              { id: 'transactions', label: 'Missions Agence', icon: Activity },
              { id: 'billetage', label: 'Billetage de Caisse', icon: WalletCards },
              { id: 'members', label: "Agents de l'Agence", icon: Users },
            ]
          : [
              { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
              { id: 'transactions', label: 'Mes Opérations', icon: Activity },
              { id: 'billetage', label: 'Billetage', icon: WalletCards },
            ];

  const managementNavigation: NavigationItem[] =
    role === 'directeur_general'
      ? [
          { id: 'salaries', label: 'Salaires & Avances', icon: Coins, badge: 'Paie DG' },
          { id: 'reports', label: 'Rapports & Exports', icon: FileText, badge: 'PDF/XLS' },
          { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
          { id: 'debts', label: 'Suivi des Dettes', icon: Scale },
          { id: 'commissions', label: 'Missions Réseau', icon: BarChart3 },
          { id: 'chat', label: 'Chat Interne & Annonces', icon: MessageSquare },
        ]
      : role === 'administrateur_agence'
        ? [
            { id: 'salaries', label: 'Salaires & Guichet Payeur', icon: Coins, badge: 'Paie' },
            { id: 'reports', label: "Rapports d'Agence", icon: FileText, badge: 'PDF/XLS' },
            { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
            { id: 'debts', label: 'Suivi des Dettes', icon: Scale },
            { id: 'chat', label: 'Chat Interne & Annonces', icon: MessageSquare },
          ]
        : role === 'administrateur_systeme'
          ? [
              { id: 'reports', label: "Journal d'Audit", icon: FileText },
              { id: 'chat', label: 'Chat Interne & Annonces', icon: MessageSquare },
            ]
          : role === 'agent'
            ? [
                { id: 'reports', label: 'Mes Rapports', icon: FileText },
                { id: 'salaries', label: 'Mon Salaire & Avances', icon: Coins, badge: 'Paie' },
                { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
                { id: 'debts', label: 'Suivi des Dettes', icon: Scale },
                { id: 'chat', label: 'Chat Interne & Annonces', icon: MessageSquare },
              ]
            : [];

  const systemNavigation: NavigationItem[] = isPrivilegedOrAgency
    ? [
        ...(role === 'administrateur_systeme' || role === 'directeur_general'
          ? [{ id: 'alerts', label: 'Traçabilité & Alertes', icon: Bell }]
          : []),
        { id: 'regulations', label: role === 'administrateur_systeme' ? 'Politique de Sécurité' : 'Validations Inscriptions', icon: ShieldCheck },
        { id: 'settings', label: 'Paramètres & Sync', icon: Settings },
      ]
    : [];

  const displayName = user?.displayName || 'Utilisateur';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Compte actif';

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-20 shrink-0 items-center border-b border-slate-200 px-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-11 w-11 shrink-0 rounded-2xl object-contain bg-slate-950 p-1.5 shadow-sm ring-1 ring-slate-800"
          />
          <div className="min-w-0">
            <div className="truncate text-base font-bold tracking-tight text-slate-950">
              Ets AMANI
            </div>
            <div className="truncate text-xs text-slate-500">
              Gestion & supervision
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <NavigationSection
          title="Principal"
          items={mainNavigation}
          activeItem={activeItem}
          onNavigate={handleNavigation}
        />
        {managementNavigation.length > 0 && (
          <NavigationSection
            title="Gestion"
            items={managementNavigation}
            activeItem={activeItem}
            onNavigate={handleNavigation}
          />
        )}
        {systemNavigation.length > 0 && (
          <NavigationSection
            title="Système"
            items={systemNavigation}
            activeItem={activeItem}
            onNavigate={handleNavigation}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 p-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              user={user}
              size="md"
              statusDot="online"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">
                {displayName}
              </div>
              <div className="truncate text-xs text-slate-500">
                {roleLabel}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-600">
              Système opérationnel
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface NavigationSectionProps {
  title: string;
  items: NavigationItem[];
  activeItem: string;
  onNavigate: (item: string) => void;
}

function NavigationSection({
  title,
  items,
  activeItem,
  onNavigate
}: NavigationSectionProps) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeItem;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={[
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all',
                isActive
                  ? 'bg-slate-950 font-semibold text-white shadow-sm'
                  : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              ].join(' ')}
            >
              <Icon
                size={18}
                strokeWidth={isActive ? 2.2 : 1.9}
                className={
                  isActive
                    ? 'text-blue-400'
                    : 'text-slate-400 transition-colors group-hover:text-slate-600'
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {item.label}
              </span>
              {item.badge && (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-100 text-slate-500'
                  ].join(' ')}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
