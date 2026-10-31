import {
  Coins,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Receipt,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import { db } from '../../lib/db';
import type { Operation } from '../../types/operation';

const CLIENT_TABS: WorkspaceTab[] = [
  { id: 'dashboard', label: 'Mes Opérations', icon: LayoutDashboard },
  { id: 'billetage', label: 'Calculateur Billetage & Devises', icon: Coins },
];

export default function ClientDashboard() {
  const { user, signOut } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    if (!user) return;
    db.operations
      .toArray()
      .then((all) => {
        const mine = all.filter(
          (op) =>
            op.createdBy === user.uid ||
            (user.phone && op.accountNumber === user.phone) ||
            (user.phoneNumber && op.accountNumber === user.phoneNumber)
        );
        mine.sort((a, b) => b.createdAt - a.createdAt);
        setOperations(mine);
      })
      .catch(() => {});
  }, [user]);

  const handleSidebarNavigate = (item: string) => {
    if (item === 'billetage') {
      setShowBilletage(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'dashboard' || item === 'transactions') {
      setShowBilletage(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AppLayout
      title="Espace Client — Ets AMANI"
      subtitle="Consultation de vos transactions, transferts et paiements"
      activeItem={showBilletage ? 'billetage' : 'dashboard'}
      onNavigate={handleSidebarNavigate}
    >
      <div className="space-y-6">
        {/* Banner Client */}
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-white/30 shadow-lg shrink-0"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight sm:text-2xl lg:text-3xl truncate">
                    Bienvenue, {user?.displayName}
                  </h1>
                  <span className="rounded-full bg-blue-400/20 px-2.5 py-0.5 text-xs font-bold text-blue-300 shrink-0">
                    Client Certifié
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-300 truncate">
                  Compte Client Ets AMANI • Accès guichet & services de change
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              <button
                type="button"
                onClick={() => {
                  setShowBilletage((v) => !v);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  showBilletage
                    ? 'bg-amber-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>{showBilletage ? 'Retour à mon tableau de bord' : 'Calculateur Billetage'}</span>
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/20"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barre de navigation d'espace de travail */}
        <WorkspaceNavigationHeader
          workspaceTitle="Espace Client"
          activeModuleTitle={showBilletage ? 'Calculateur Billetage & Devises' : 'Historique des Opérations'}
          activeModuleDescription={
            showBilletage
              ? 'Simulez et décomptez vos billets en Francs Congolais (CDF) et Dollars Américains (USD)'
              : 'Consultez le relevé détaillé de vos versements, retraits et transferts en agence'
          }
          backLabel="Mes Opérations"
          onBack={() => {
            setShowBilletage(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          tabs={CLIENT_TABS}
          activeTabId={showBilletage ? 'billetage' : 'dashboard'}
          onTabChange={(id) => {
            setShowBilletage(id === 'billetage');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        {/* Contenu affiché immédiatement */}
        {showBilletage ? (
          <div className="animate-in fade-in duration-200">
            <BilletageModule onClose={() => setShowBilletage(false)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 animate-in fade-in duration-200">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Dernières Opérations</h2>
                  <p className="text-xs text-slate-500">Historique de vos opérations au guichet</p>
                </div>
              </div>
              {operations.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  Aucune opération récente enregistrée.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {operations.map((op) => (
                    <div key={op.operationNumber || op.createdAt} className="py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{op.title}</p>
                        <p className="text-slate-500 truncate">{op.operationNumber} • {op.agencyName}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {op.amount !== undefined && (
                          <p className="font-bold text-emerald-700">
                            {op.amount.toLocaleString('fr-FR')} {op.currency}
                          </p>
                        )}
                        <p className="text-slate-400">
                          {new Date(op.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Services Disponibles</h2>
                  <p className="text-xs text-slate-500">Présentez-vous en agence pour vos transactions</p>
                </div>
              </div>
              <ul className="text-xs space-y-2 text-slate-600">
                <li className="p-3 bg-slate-50 rounded-xl">✓ Change manuel devises USD / CDF aux meilleurs taux</li>
                <li className="p-3 bg-slate-50 rounded-xl">✓ Dépôts et retraits Mobile Money (Airtel Money, M-Pesa, Orange Money)</li>
                <li className="p-3 bg-slate-50 rounded-xl">✓ Transferts inter-agences sécurisés avec notification instantanée</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
