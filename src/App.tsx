import React, { useEffect, lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { getDashboardRoute } from './utils/roleRedirect';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ApprovalPendingPage from './pages/dashboard/ApprovalPendingPage';
import { startSyncWorker } from './services/SyncWorker';
import { startSmsSyncWorker } from './services/SmsOperationService';
import { startSmsListener } from './services/SmsListenerService';
import { registerNotificationServiceWorker } from './services/LocalNotificationService';
import FramePhone from './components/common/FramePhone';

// Chargement différé (Code-Splitting) des tableaux de bord lourds
const AdministrateurSystemeDashboard = lazy(() => import('./pages/dashboard/AdministrateurSystemeDashboard'));
const DirecteurGeneralDashboard = lazy(() => import('./pages/dashboard/DirecteurGeneralDashboard'));
const AdministrateurAgenceDashboard = lazy(() => import('./pages/dashboard/AdministrateurAgenceDashboard'));
const AgentDashboard = lazy(() => import('./pages/dashboard/AgentDashboard'));
const ClientDashboard = lazy(() => import('./pages/dashboard/ClientDashboard'));
const AbonneDashboard = lazy(() => import('./pages/dashboard/AbonneDashboard'));

// Écran de chargement intermédiaire lors de la transition de route
function PageLoader() {
  return (
    <div className="min-h-full flex-1 flex items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center space-y-4">
        <img
          src="/logo.png"
          alt="Logo Ets AMANI"
          className="h-16 w-16 rounded-2xl object-contain bg-slate-950 p-2 shadow-lg ring-1 ring-white/15"
        />
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400">Chargement du module...</p>
      </div>
    </div>
  );
}

// Helper pour vérifier si le rôle est une autorité d'administration/direction
const isPrivilegedRole = (role?: string) => {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return normalized === 'administrateur_systeme' || normalized === 'directeur_general';
};

// Redirection intelligente pour la racine
function HomeRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-full flex-1 flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center space-y-4">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-16 w-16 rounded-2xl object-contain bg-slate-950 p-2 shadow-lg ring-1 ring-white/15"
          />
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Initialisation d'Ets AMANI...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    if (
      user.status === 'suspended' ||
      user.status === 'disabled' ||
      user.status === 'rejected' ||
      !user.isApproved
    ) {
      return <Navigate to="/validation-en-attente" replace />;
    }
    return <Navigate to={getDashboardRoute(user)} replace />;
  }

  return <Navigate to="/login" replace />;
}

// Composant pour empêcher un utilisateur connecté d'accéder aux pages /login ou /register
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    if (
      user.status === 'suspended' ||
      user.status === 'disabled' ||
      user.status === 'rejected' ||
      !user.isApproved
    ) {
      return <Navigate to="/validation-en-attente" replace />;
    }
    return <Navigate to={getDashboardRoute(user)} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  useEffect(() => {
    // Enregistrement du Service Worker pour les notifications push d'arrière-plan
    void registerNotificationServiceWorker();

    // Démarrage des workers de synchronisation Offline-First et du listener SMS Android
    const stopSyncWorker = startSyncWorker();
    const stopSmsWorker = startSmsSyncWorker();
    let stopSmsListenerFn: (() => Promise<void>) | null = null;

    startSmsListener()
      .then((stopFn) => {
        stopSmsListenerFn = stopFn;
      })
      .catch(() => {});

    return () => {
      stopSyncWorker();
      stopSmsWorker();
      if (stopSmsListenerFn) {
        void stopSmsListenerFn();
      }
    };
  }, []);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Route Racine */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Routes Publiques (uniquement si NON connecté) */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        {/* Route de validation en attente */}
        <Route path="/validation-en-attente" element={<ApprovalPendingPage />} />

        {/* Rôles & Tableaux de bord avec contrôles RBAC stricts */}
        <Route
          path="/dashboard/administrateur-systeme"
          element={
            <ProtectedRoute allowedRoles={['administrateur_systeme']}>
              <AdministrateurSystemeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/directeur-general"
          element={
            <ProtectedRoute allowedRoles={['directeur_general']}>
              <DirecteurGeneralDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/administrateur-agence"
          element={
            <ProtectedRoute allowedRoles={['administrateur_agence']}>
              <AdministrateurAgenceDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/agent"
          element={
            <ProtectedRoute allowedRoles={['agent']}>
              <AgentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/client"
          element={
            <ProtectedRoute allowedRoles={['client']}>
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/abonne"
          element={
            <ProtectedRoute allowedRoles={['abonne']}>
              <AbonneDashboard />
            </ProtectedRoute>
          }
        />

        {/* Catch-all pour les URL inconnues */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FramePhone appName="Ets AMANI">
          <AppRoutes />
        </FramePhone>
      </BrowserRouter>
    </AuthProvider>
  );
}
