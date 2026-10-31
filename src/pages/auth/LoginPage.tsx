import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Send,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardRoute } from '../../utils/roleRedirect';
import BiometricAuthModal from '../../components/auth/BiometricAuthModal';
import {
  getEnrolledBiometricAgents,
  verifyBiometricIdentity,
} from '../../services/BiometricAuthService';
import type { AppUser } from '../../types/auth';

type AuthViewMode = 'login' | 'forgot-request' | 'forgot-confirm';

export default function LoginPage() {
  const { signIn, signInWithBiometrics, resetPassword, confirmResetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<AuthViewMode>('login');
  const [isBiometricModalOpen, setIsBiometricModalOpen] = useState(false);

  // États de connexion
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // États de réinitialisation / modification du mot de passe
  const [resetEmail, setResetEmail] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // Messages & chargement
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Détection automatique d'un lien de réinitialisation Firebase (?oobCode=...)
  useEffect(() => {
    const codeParam = searchParams.get('oobCode');
    if (codeParam) {
      setOobCode(codeParam);
      setViewMode('forgot-confirm');
    }
  }, [searchParams]);

  const handleOpenForgotPassword = () => {
    setError(null);
    setSuccessMessage(null);
    setResetEmail(email.trim());
    setViewMode('forgot-request');
  };

  const handleBackToLogin = () => {
    setError(null);
    setViewMode('login');
    if (searchParams.has('oobCode') || searchParams.has('mode')) {
      setSearchParams({});
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Veuillez renseigner votre email et votre mot de passe.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const enrolledList = getEnrolledBiometricAgents();
      const matchingEnrolled = enrolledList.find(
        (a) => a.email.toLowerCase() === normalizedEmail
      );

      // Si l'agent qui se connecte possède un profil biométrique enregistré sur ce téléphone :
      // Vérification physique de son empreinte pour empêcher qu'un tiers ayant dérobé le mot de passe ne s'introduise
      if (matchingEnrolled) {
        await verifyBiometricIdentity({
          user: {
            uid: matchingEnrolled.uid,
            displayName: matchingEnrolled.displayName,
            email: matchingEnrolled.email,
            role: matchingEnrolled.role,
            category: 'agent',
            isApproved: true,
            status: 'active',
            createdAt: matchingEnrolled.enrolledAt,
            updatedAt: Date.now(),
            permissions: [],
          },
          actionTitle: 'Vérification d’accès titulaire',
          actionDescription: 'Contrôle biométrique pour confirmer votre identité légitime',
        });
      }

      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(
        err?.message || 'Identifiants incorrects ou compte inactif. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricSuccess = async (appUser: AppUser) => {
    setIsBiometricModalOpen(false);
    setError(null);
    setLoading(true);
    try {
      await signInWithBiometrics(appUser, { biometricMethod: 'Empreinte digitale' });
      navigate(getDashboardRoute(appUser));
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la connexion biométrique.');
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim();
    if (!targetEmail) {
      setError('Veuillez saisir votre adresse email professionnelle ou personnelle.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await resetPassword(targetEmail);
      setEmail(targetEmail);
      setSuccessMessage(
        `Un email de réinitialisation du mot de passe a été envoyé à ${targetEmail}. Vérifiez votre boîte de réception (et vos courriers indésirables).`
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Impossible d'envoyer le lien de réinitialisation. Vérifiez l'adresse email saisie."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode.trim()) {
      setError('Veuillez renseigner le code de réinitialisation reçu par email.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await confirmResetPassword(oobCode.trim(), newPassword);
      setNewPassword('');
      setConfirmNewPassword('');
      setOobCode('');
      if (searchParams.has('oobCode') || searchParams.has('mode')) {
        setSearchParams({});
      }
      setViewMode('login');
      setSuccessMessage(
        'Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.'
      );
    } catch (err: any) {
      setError(
        err?.message || 'Impossible de modifier le mot de passe. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-100">
      {/* En-tête dédié (Header avec Fond Thématique Sombre / Bleu Nuit) */}
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-6 pt-8 pb-14 text-center text-white shadow-lg">
        {/* Halos lumineux subtils pour la profondeur */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl"
        />

        <div className="relative z-10 mx-auto flex max-w-sm flex-col items-center">
          {/* Conteneur du logo officiel à contraste élevé */}
          <div className="mb-3.5 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-900/90 p-2.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
            <img
              src="/logo.png"
              alt="Logo officiel Ets AMANI"
              className="h-full w-full object-contain drop-shadow-md"
            />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white">
            Ets AMANI
          </h1>
          <p className="mt-1 text-xs font-medium text-blue-200/90">
            Supervision Générale, Trésorerie & Gestion Opérationnelle
          </p>

          <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Portail d'accès sécurisé</span>
          </div>
        </div>
      </header>

      {/* Conteneur principal du formulaire aligné et centré */}
      <main className="relative z-20 -mt-7 flex flex-1 flex-col justify-between px-4 pb-6 sm:px-6">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-950/5">
          {viewMode === 'login' && (
            <>
              {/* En-tête du formulaire de connexion */}
              <div className="mb-5 text-center">
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                  Connexion à votre espace
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Saisissez vos identifiants ou utilisez votre empreinte biométrique
                </p>
              </div>

              {/* Module dédié : Authentification Biométrique Agent (Empreinte Digitale) */}
              <div className="mb-5 overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 text-white shadow-lg shadow-blue-950/15 ring-1 ring-cyan-500/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 ring-1 ring-white/20">
                      <Fingerprint className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black tracking-tight text-white uppercase">
                          Sécurité Agent & Caisse
                        </h3>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                          Biométrie active
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                        Authentification instantanée par empreinte digitale pour agents de guichet & caissiers
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsBiometricModalOpen(true);
                    }}
                    className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 transition-all hover:brightness-110 active:scale-[0.99]"
                  >
                    <Fingerprint className="h-4 w-4 text-cyan-100 transition-transform group-hover:scale-110" />
                    <span>Se connecter par empreinte digitale</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>

              {/* Séparateur visuel pour le mode classique */}
              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Ou identifiant / mot de passe
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Message de succès éventuel */}
              {successMessage && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs font-semibold text-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Message d'erreur éventuel */}
              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Formulaire de connexion */}
              <form onSubmit={handleSubmitLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Identifiant / Adresse Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@ets-amani.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenForgotPassword}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 transition hover:text-blue-800 hover:underline focus:outline-none"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Mot de passe oublié ?</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      title={
                        showPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      aria-label={
                        showPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Bouton principal de connexion */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-slate-900 hover:via-blue-900 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                        <span>Authentification en cours...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4 text-blue-300 transition-transform group-hover:translate-x-0.5" />
                        <span>Se connecter</span>
                        <ArrowRight className="h-4 w-4 opacity-80 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Séparateur visuel */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Nouveau compte
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Bouton structuré d'inscription publique (Client / Abonné) */}
              <Link
                to="/register"
                className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 py-3 px-4 text-xs font-bold text-slate-800 transition-all hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 active:scale-[0.99]"
              >
                <UserPlus className="h-4 w-4 text-blue-600 shrink-0" />
                <span>Créer un compte Client / Abonné</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
              </Link>
            </>
          )}

          {viewMode === 'forgot-request' && (
            <>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Retour à la connexion</span>
                </button>
              </div>

              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                  Mot de passe oublié ?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Renseignez l'adresse email associée à votre compte Ets AMANI pour recevoir un lien sécurisé de modification de votre mot de passe.
                </p>
              </div>

              {successMessage && (
                <div
                  role="status"
                  className="mb-5 flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs font-semibold text-emerald-800"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Adresse Email du compte
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="nom@ets-amani.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-slate-900 hover:via-blue-900 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 text-blue-300" />
                      <span>Envoyer le lien de réinitialisation</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('forgot-confirm');
                  }}
                  className="text-xs font-bold text-blue-600 transition hover:text-blue-800 hover:underline"
                >
                  J'ai déjà un code de réinitialisation → Modifier mon mot de passe
                </button>
              </div>
            </>
          )}

          {viewMode === 'forgot-confirm' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('forgot-request');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Retour</span>
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  Connexion
                </button>
              </div>

              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                  Nouveau mot de passe
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Saisissez votre code de réinitialisation et définissez votre nouveau mot de passe sécurisé.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-oob-code"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Code de réinitialisation (reçu par email)
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-oob-code"
                      type="text"
                      required
                      value={oobCode}
                      onChange={(e) => setOobCode(e.target.value)}
                      placeholder="Collez le code reçu par email"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-4 text-sm font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      title={
                        showNewPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      aria-label={
                        showNewPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Confirmer le nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Retapez le nouveau mot de passe"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword((prev) => !prev)}
                      title={
                        showConfirmNewPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      aria-label={
                        showConfirmNewPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {showConfirmNewPassword ? (
                        <EyeOff className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-slate-900 hover:via-blue-900 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                      <span>Modification en cours...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>Enregistrer le nouveau mot de passe</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Pied de page sobre */}
        <footer className="mt-5 text-center">
          <p className="text-[11px] font-medium text-slate-500">
            © {new Date().getFullYear()} Ets AMANI · Tous droits réservés
          </p>
        </footer>
      </main>

      {/* Composant modal d'authentification biométrique (Empreinte digitale) */}
      <BiometricAuthModal
        isOpen={isBiometricModalOpen}
        onClose={() => setIsBiometricModalOpen(false)}
        onSuccess={handleBiometricSuccess}
        onFallbackToPassword={(suggestedEmail) => {
          setIsBiometricModalOpen(false);
          if (suggestedEmail) setEmail(suggestedEmail);
        }}
      />
    </div>
  );
}
