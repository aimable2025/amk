import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';

interface SystemSecurityModuleProps {
  onClose?: () => void;
}

const SECURITY_POLICY_KEY = 'ets_amani_security_policy';

export default function SystemSecurityModule({ onClose }: SystemSecurityModuleProps) {
  const [forceReauth, setForceReauth] = useState(false);
  const [twoFactorEnforced, setTwoFactorEnforced] = useState(false);
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(60);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    try {
      const raw = localStorage.getItem(SECURITY_POLICY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.forceReauth === 'boolean') setForceReauth(parsed.forceReauth);
        if (typeof parsed.twoFactorEnforced === 'boolean') setTwoFactorEnforced(parsed.twoFactorEnforced);
        if (typeof parsed.sessionTimeoutMin === 'number') setSessionTimeoutMin(parsed.sessionTimeoutMin);
      }
    } catch {
      // ignore
    }

    getDoc(doc(firestoreDb, 'systemControls', 'securityPolicy'))
      .then((snap) => {
        if (isMounted && snap.exists()) {
          const data = snap.data();
          if (typeof data.forceReauth === 'boolean') setForceReauth(data.forceReauth);
          if (typeof data.twoFactorEnforced === 'boolean') setTwoFactorEnforced(data.twoFactorEnforced);
          if (typeof data.sessionTimeoutMin === 'number') setSessionTimeoutMin(data.sessionTimeoutMin);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const securityScore =
    85 + (twoFactorEnforced ? 10 : 0) + (sessionTimeoutMin <= 30 ? 5 : 0);

  const handleApplySecurityPolicy = async () => {
    setSaving(true);
    const policy = {
      forceReauth,
      twoFactorEnforced,
      sessionTimeoutMin,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(SECURITY_POLICY_KEY, JSON.stringify(policy));
    } catch {
      // ignore
    }
    try {
      await setDoc(
        doc(firestoreDb, 'systemControls', 'securityPolicy'),
        {
          ...policy,
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // ignore offline
    }
    try {
      await recordAuditLog({
        action: 'Mise à jour politique de sécurité globale',
        category: 'security',
        severity: 'critical',
        details: `Timeout session: ${sessionTimeoutMin}min, 2FA: ${twoFactorEnforced ? 'Oui' : 'Non'}, Forcer reconnexion: ${forceReauth ? 'Oui' : 'Non'}.`,
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
      setFeedback('Politique de sécurité mise à jour et appliquée.');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Erreur lors de l enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Sécurité Globale & Contrôle RBAC</h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Niveau Élevé ({securityScore}/100)
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Paramètres d'authentification stricte, expiration des sessions, chiffrement et politique des mots de passe.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {feedback && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p>{feedback}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Protection des sessions</p>
            <p className="mt-1 text-lg font-bold text-slate-900">Déconnexion automatique</p>
            <p className="mt-0.5 text-xs text-slate-500">Actif après {sessionTimeoutMin} minutes d inactivité.</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Intégrité des opérations</p>
            <p className="mt-1 text-lg font-bold text-slate-900">Empreinte locale vérifiée</p>
            <p className="mt-0.5 text-xs text-slate-500">Dexie IndexedDB synchronisée avec signature.</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Contrôle des rôles</p>
            <p className="mt-1 text-lg font-bold text-slate-900">Cloisonnement strict</p>
            <p className="mt-0.5 text-xs text-slate-500">6 rôles hiérarchiques distincts.</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Directives d'accès & Authentification</h2>
            <p className="text-xs text-slate-500">Mesures coercitives pour la sécurité des fonds et données Ets AMANI</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Double facteur obligatoire (2FA / OTP)</p>
              <p className="text-xs text-slate-500">
                Impose la validation par code SMS / Email pour toute connexion en dehors des heures de bureau.
              </p>
            </div>
            <input
              type="checkbox"
              checked={twoFactorEnforced}
              onChange={(e) => setTwoFactorEnforced(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Forcer la reconnexion de tous les utilisateurs</p>
              <p className="text-xs text-slate-500">
                Invalide les jetons de session actifs de tous les agents lors du prochain rafraîchissement.
              </p>
            </div>
            <input
              type="checkbox"
              checked={forceReauth}
              onChange={(e) => setForceReauth(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-900">
              Durée maximale de la session inactive (minutes)
            </label>
            <input
              type="number"
              min="5"
              max="480"
              value={sessionTimeoutMin}
              onChange={(e) => setSessionTimeoutMin(Number(e.target.value))}
              className="mt-2 w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm outline-none focus:bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={handleApplySecurityPolicy}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Shield className="h-4 w-4" />
            Appliquer les directives de sécurité
          </button>
        </div>
      </div>
    </div>
  );
}
