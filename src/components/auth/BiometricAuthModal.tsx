import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  authenticateAgentBiometrics,
  checkBiometricHardwareSupport,
  enrollAgentBiometrics,
  getEligibleAgentsForEnrollment,
  getEnrolledBiometricAgents,
  removeEnrolledAgentBiometrics,
  type EnrolledBiometricAgent,
} from '../../services/BiometricAuthService';
import type { AppUser } from '../../types/auth';

interface BiometricAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AppUser) => void;
  onFallbackToPassword: (suggestedEmail?: string) => void;
}

type ScanStatus = 'idle' | 'scanning' | 'verifying' | 'success' | 'error';

/**
 * Sons synthétiques sécurisés via Web Audio API
 */
function playBiometricAudio(type: 'beep' | 'success' | 'error') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'success') {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.08);
      osc2.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.35);
    } else if (type === 'error') {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.1);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  } catch {
    // ignore
  }
}

export default function BiometricAuthModal({
  isOpen,
  onClose,
  onSuccess,
  onFallbackToPassword,
}: BiometricAuthModalProps) {
  const [enrolledAgents, setEnrolledAgents] = useState<EnrolledBiometricAgent[]>([]);
  const [selectedAgentUid, setSelectedAgentUid] = useState<string>('');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
  const [hardwareInfo, setHardwareInfo] = useState<{
    supported: boolean;
    hasEnrolledBiometrics: boolean;
    type: string;
    status: string;
    message: string;
    isNative: boolean;
  }>({
    supported: true,
    hasEnrolledBiometrics: false,
    type: 'Capteur d empreinte',
    status: 'UNKNOWN',
    message: '',
    isNative: false,
  });

  // Mode enrôlement
  const [showEnrollmentTab, setShowEnrollmentTab] = useState(false);
  const [eligibleAgents, setEligibleAgents] = useState<any[]>([]);
  const [candidateAgentUid, setCandidateAgentUid] = useState<string>('');
  const [customTerminalName, setCustomTerminalName] = useState<string>('Téléphone Mobile Ets AMANI');
  const [enrollingLoading, setEnrollingLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Compte à rebours de sécurité en cas de verrouillage
  useEffect(() => {
    if (lockoutSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setLockoutSecondsLeft((prev) => {
        if (prev <= 1) {
          setStatusMessage('Verrouillage expiré. Vous pouvez réessayer le scan.');
          setScanStatus('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSecondsLeft]);

  // Initialisation à l'ouverture
  useEffect(() => {
    if (!isOpen) return;

    checkBiometricHardwareSupport().then((hw) => {
      setHardwareInfo(hw);
      if (!hw.hasEnrolledBiometrics && hw.status === 'NONE_ENROLLED') {
        setStatusMessage(
          'Attention : Aucune empreinte digitale n est enregistrée sur ce téléphone. Enregistrez-la dans les Paramètres Android.'
        );
      }
    });

    const agents = getEnrolledBiometricAgents();
    setEnrolledAgents(agents);
    if (agents.length > 0) {
      setSelectedAgentUid((prev) => {
        const found = agents.some((a) => a.uid === prev);
        return found ? prev : agents[0].uid;
      });
      setStatusMessage('Placez votre doigt sur le capteur du téléphone pour valider votre empreinte.');
    } else {
      setStatusMessage('Aucun compte agent associé à l empreinte de ce téléphone.');
    }

    setScanStatus('idle');
    setScanProgress(0);
    setFailedAttempts(0);
    setLockoutSecondsLeft(0);
    setShowEnrollmentTab(false);
    setEnrollmentError(null);
  }, [isOpen]);

  // Charger les agents éligibles
  useEffect(() => {
    if (showEnrollmentTab) {
      getEligibleAgentsForEnrollment().then((list) => {
        setEligibleAgents(list);
        if (list.length > 0 && !candidateAgentUid) {
          setCandidateAgentUid(list[0].uid);
        }
      });
    }
  }, [showEnrollmentTab, candidateAgentUid]);

  const currentAgent = useMemo(() => {
    return enrolledAgents.find((a) => a.uid === selectedAgentUid) || enrolledAgents[0] || null;
  }, [enrolledAgents, selectedAgentUid]);

  // Déclenchement du scan avec vérification stricte du matériel
  const handleStartScan = async () => {
    if (lockoutSecondsLeft > 0) {
      return;
    }

    if (!currentAgent) {
      setShowEnrollmentTab(true);
      return;
    }

    if (scanStatus === 'scanning' || scanStatus === 'verifying') return;

    setScanStatus('scanning');
    setScanProgress(30);
    setStatusMessage('Validation par le capteur biométrique du téléphone...');
    playBiometricAudio('beep');

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    try {
      // Déclenche directement le capteur d'empreinte Android natif (BiometricPrompt) ou WebAuthn
      setScanStatus('verifying');
      setScanProgress(80);

      const result = await authenticateAgentBiometrics(currentAgent.uid);

      if (result.success) {
        setScanProgress(100);
        setScanStatus('success');
        setStatusMessage(`Empreinte authentique reconnue. Bienvenue, ${result.agent.displayName} !`);
        playBiometricAudio('success');
        if (navigator.vibrate) {
          navigator.vibrate([40, 60, 40]);
        }

        setTimeout(() => {
          onSuccess(result.appUser);
        }, 800);
      } else {
        throw new Error('Empreinte non reconnue.');
      }
    } catch (err: any) {
      setScanStatus('error');
      setScanProgress(0);
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      playBiometricAudio('error');
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }

      if (attempts >= 3) {
        setLockoutSecondsLeft(30);
        setStatusMessage(
          'Sécurité Ets AMANI : Trop de tentatives infructueuses (empreinte non reconnue). Accès bloqué pendant 30 secondes pour éviter toute intrusion.'
        );
      } else {
        const errorDetail =
          err?.message ||
          'Accès refusé : L empreinte ne correspond pas à celle enregistrée sur ce téléphone. Seule la vraie empreinte de l agent est autorisée.';
        setStatusMessage(errorDetail);
      }
    }
  };

  const handleEnrollCandidate = async () => {
    if (!candidateAgentUid) return;
    const candidate = eligibleAgents.find((a) => a.uid === candidateAgentUid);
    if (!candidate) return;

    setEnrollingLoading(true);
    setEnrollmentError(null);
    try {
      const enrolled = await enrollAgentBiometrics({
        agent: {
          uid: candidate.uid,
          displayName: candidate.displayName,
          email: candidate.email,
          role: candidate.role,
          function: candidate.function,
          agencyId: candidate.agencyId,
          agencyName: candidate.agencyId || 'Agence Principale',
        },
        deviceName: customTerminalName.trim() || 'Téléphone Mobile Ets AMANI',
      });

      const updated = getEnrolledBiometricAgents();
      setEnrolledAgents(updated);
      setSelectedAgentUid(enrolled.uid);
      setShowEnrollmentTab(false);
      setScanStatus('idle');
      setStatusMessage(`Empreinte du téléphone associée avec succès à l agent ${enrolled.displayName}.`);
      playBiometricAudio('success');
    } catch (e: any) {
      setEnrollmentError(
        e?.message || 'Erreur lors de la vérification de l empreinte sur le téléphone.'
      );
      playBiometricAudio('error');
    } finally {
      setEnrollingLoading(false);
    }
  };

  const handleDeleteAgentBiometrics = async (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Voulez-vous révoquer l association biométrique de cet agent sur ce téléphone ?')) {
      return;
    }
    await removeEnrolledAgentBiometrics(uid);
    const updated = getEnrolledBiometricAgents();
    setEnrolledAgents(updated);
    if (selectedAgentUid === uid) {
      setSelectedAgentUid(updated.length > 0 ? updated[0].uid : '');
    }
    if (updated.length === 0) {
      setStatusMessage('Aucun compte agent associé à l empreinte de ce téléphone.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl shadow-blue-950/50">
        {/* Lueur supérieure */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-72 rounded-full bg-cyan-500/15 blur-3xl" />

        {/* Bouton fermeture */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fenêtre biométrique"
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 transition hover:bg-slate-700 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* En-tête avec logo officiel Ets AMANI */}
        <div className="relative z-10 px-6 pt-6 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Ets AMANI"
              className="h-11 w-11 shrink-0 object-contain rounded-xl border border-slate-700 bg-white p-1 shadow-md"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight text-white">
                  Sécurité Biométrique Ets AMANI
                </h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                  Android / FIDO2
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Contrôle strict de l empreinte enregistrée sur le téléphone
              </p>
            </div>
          </div>
        </div>

        {/* Corps principal */}
        <div className="relative z-10 p-6 space-y-5">
          {!showEnrollmentTab ? (
            <>
              {/* Sélecteur d'agent sur ce terminal */}
              {enrolledAgents.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-cyan-400" />
                      Agent rattaché à ce téléphone :
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEnrollmentTab(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      Associer un agent
                    </button>
                  </div>

                  {/* Cartouche agent sélectionné */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 ring-1 ring-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 to-cyan-600 text-sm font-black text-white shadow-md">
                          {currentAgent?.displayName
                            ? currentAgent.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()
                            : 'AG'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            {currentAgent?.displayName}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="capitalize text-cyan-300 font-medium">
                              {currentAgent?.function || 'Agent Guichetier'}
                            </span>
                            <span>•</span>
                            <span className="truncate">
                              {currentAgent?.agencyName || currentAgent?.agencyId || 'Agence Principale'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {enrolledAgents.length > 1 && (
                        <select
                          value={selectedAgentUid}
                          onChange={(e) => {
                            setSelectedAgentUid(e.target.value);
                            setScanStatus('idle');
                            setStatusMessage('Placez votre doigt sur le capteur pour valider');
                            setScanProgress(0);
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-500"
                        >
                          {enrolledAgents.map((agent) => (
                            <option key={agent.uid} value={agent.uid}>
                              {agent.displayName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* État vide quand aucun agent n'a encore associé ce téléphone */
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-center space-y-3">
                  <Smartphone className="mx-auto h-8 w-8 text-amber-400" />
                  <div>
                    <p className="text-xs font-bold text-amber-200">
                      Aucun agent associé à l empreinte de ce téléphone
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Afin d éviter toute intrusion d un inconnu, l agent doit associer son compte en vérifiant son empreinte enregistrée dans le téléphone.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEnrollmentTab(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Associer un compte agent à ce téléphone</span>
                  </button>
                </div>
              )}

              {/* Module du Capteur d'Empreinte Digitale */}
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative flex flex-col items-center justify-center">
                  {/* Anneaux d'ondes en mode vérification */}
                  {(scanStatus === 'scanning' || scanStatus === 'verifying') && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="h-36 w-36 rounded-full border-2 border-cyan-400/40 animate-ping" />
                      <div className="h-44 w-44 rounded-full border border-cyan-500/20 animate-pulse" />
                    </div>
                  )}

                  {/* Bouton / Pad tactile du capteur biométrique */}
                  <button
                    type="button"
                    onClick={handleStartScan}
                    disabled={
                      lockoutSecondsLeft > 0 ||
                      scanStatus === 'scanning' ||
                      scanStatus === 'verifying' ||
                      scanStatus === 'success' ||
                      !currentAgent
                    }
                    aria-label="Scanner votre empreinte digitale"
                    className={`group relative flex h-32 w-32 items-center justify-center rounded-3xl transition-all duration-300 select-none ${
                      lockoutSecondsLeft > 0
                        ? 'border-2 border-red-500/50 bg-red-950/30 cursor-not-allowed opacity-60'
                        : scanStatus === 'scanning'
                        ? 'border-2 border-cyan-400 bg-cyan-950/40 shadow-2xl shadow-cyan-500/30 scale-105'
                        : scanStatus === 'verifying'
                        ? 'border-2 border-amber-400 bg-amber-950/40 shadow-2xl shadow-amber-500/30'
                        : scanStatus === 'success'
                        ? 'border-2 border-emerald-400 bg-emerald-950/50 shadow-2xl shadow-emerald-500/30 scale-105'
                        : scanStatus === 'error'
                        ? 'border-2 border-rose-500 bg-rose-950/40 shadow-2xl shadow-rose-500/30 animate-shake'
                        : 'border-2 border-slate-700 bg-slate-950/80 hover:border-cyan-500/70 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-cyan-500/20 active:scale-95'
                    }`}
                  >
                    {/* Faisceau laser animé */}
                    {scanStatus === 'scanning' && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_15px_#22d3ee] transition-all duration-75"
                        style={{ top: `${Math.min(95, Math.max(5, scanProgress))}%` }}
                      />
                    )}

                    {lockoutSecondsLeft > 0 ? (
                      <ShieldAlert className="h-16 w-16 text-rose-500 animate-pulse" />
                    ) : scanStatus === 'success' ? (
                      <CheckCircle2 className="h-16 w-16 text-emerald-400 animate-in zoom-in-75 duration-200" />
                    ) : scanStatus === 'error' ? (
                      <AlertCircle className="h-16 w-16 text-rose-400 animate-in zoom-in-75 duration-200" />
                    ) : scanStatus === 'verifying' ? (
                      <Loader2 className="h-14 w-14 animate-spin text-amber-400" />
                    ) : (
                      <Fingerprint
                        className={`h-16 w-16 transition-colors duration-300 ${
                          scanStatus === 'scanning'
                            ? 'text-cyan-400'
                            : 'text-slate-400 group-hover:text-cyan-300'
                        }`}
                      />
                    )}

                    <div className="absolute -bottom-2 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-cyan-300">
                      {lockoutSecondsLeft > 0
                        ? `Bloqué (${lockoutSecondsLeft}s)`
                        : scanStatus === 'scanning' || scanStatus === 'verifying'
                        ? 'Contrôle...'
                        : scanStatus === 'success'
                        ? 'Validé'
                        : scanStatus === 'error'
                        ? 'Rejeté'
                        : 'Toucher'}
                    </div>
                  </button>
                </div>

                {/* Message d'état et sécurité */}
                <div className="mt-4 text-center max-w-sm px-2">
                  <p
                    className={`text-xs font-semibold leading-relaxed transition-colors ${
                      lockoutSecondsLeft > 0
                        ? 'text-rose-400 font-bold'
                        : scanStatus === 'success'
                        ? 'text-emerald-300 font-bold'
                        : scanStatus === 'error'
                        ? 'text-rose-400 font-bold'
                        : scanStatus === 'scanning' || scanStatus === 'verifying'
                        ? 'text-cyan-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {statusMessage}
                  </p>

                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2.5 py-0.5 text-[10px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{hardwareInfo.type}</span>
                  </div>
                </div>
              </div>

              {/* Bouton d'action principal */}
              <div className="space-y-2 pt-1">
                {lockoutSecondsLeft > 0 ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-center text-xs text-rose-300">
                    <p className="font-bold">Accès temporairement suspendu</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Veuillez utiliser votre mot de passe pour prouver votre identité.
                    </p>
                  </div>
                ) : scanStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setScanStatus('idle');
                      setScanProgress(0);
                      setStatusMessage('Posez votre empreinte enregistrée sur le capteur pour réessayer.');
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-xs font-bold text-white transition hover:bg-slate-700 active:scale-[0.99]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Réessayer le scan d’empreinte</span>
                  </button>
                ) : (
                  currentAgent && (
                    <button
                      type="button"
                      onClick={handleStartScan}
                      disabled={scanStatus === 'scanning' || scanStatus === 'verifying' || scanStatus === 'success'}
                      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                    >
                      {scanStatus === 'scanning' || scanStatus === 'verifying' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Contrôle biométrique du téléphone...</span>
                        </>
                      ) : scanStatus === 'success' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-white" />
                          <span>Connexion autorisée...</span>
                        </>
                      ) : (
                        <>
                          <Fingerprint className="h-4 w-4 text-cyan-200" />
                          <span>Vérifier l’empreinte de l’agent</span>
                          <ArrowRight className="h-4 w-4 opacity-80" />
                        </>
                      )}
                    </button>
                  )
                )}

                {/* Bascule vers mot de passe */}
                <button
                  type="button"
                  onClick={() => onFallbackToPassword(currentAgent?.email)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Se connecter par mot de passe</span>
                </button>
              </div>
            </>
          ) : (
            /* Onglet d'Enrôlement avec vérification matérielle */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">
                    Associer l’empreinte du téléphone à un compte
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEnrollmentTab(false)}
                  className="text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Retour
                </button>
              </div>

              {enrollmentError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  {enrollmentError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Sélectionner l'agent à enregistrer *
                  </label>
                  {eligibleAgents.length > 0 ? (
                    <select
                      value={candidateAgentUid}
                      onChange={(e) => setCandidateAgentUid(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-medium text-white outline-none focus:border-cyan-500"
                    >
                      {eligibleAgents.map((ag) => (
                        <option key={ag.uid} value={ag.uid}>
                          {ag.displayName} ({ag.role} · {ag.function || 'Guichet'}) {ag.isEnrolled ? '✓ Enrôlé' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Chargement des agents enregistrés dans la plateforme...
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Nom du téléphone / terminal collecteur
                  </label>
                  <input
                    type="text"
                    value={customTerminalName}
                    onChange={(e) => setCustomTerminalName(e.target.value)}
                    placeholder="Ex: Téléphone Source Vodacom (03220590)"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-white outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-[11px] text-cyan-200 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
                    <span>
                      En cliquant sur « Associer », le capteur biométrique du téléphone va demander à l agent de poser son doigt pour certifier matériellement l identité. Toute empreinte non reconnue bloquera l association.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={enrollingLoading || !candidateAgentUid}
                  onClick={handleEnrollCandidate}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                >
                  {enrollingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Vérification physique sur le capteur...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      <span>Poser le doigt sur le capteur et associer</span>
                    </>
                  )}
                </button>
              </div>

              {/* Liste des agents déjà associés sur cet appareil */}
              {enrolledAgents.length > 0 && (
                <div className="pt-2">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Comptes actuellement associés sur ce téléphone ({enrolledAgents.length}) :
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {enrolledAgents.map((ag) => (
                      <div
                        key={ag.uid}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs"
                      >
                        <div>
                          <p className="font-bold text-white">{ag.displayName}</p>
                          <p className="text-[10px] text-slate-400">
                            {ag.function || 'Agent'} · {ag.agencyName || 'Agence'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteAgentBiometrics(ag.uid, e)}
                          title="Supprimer cette empreinte"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-rose-950 hover:text-rose-400 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied modal sécurisé */}
        <div className="relative z-10 border-t border-slate-800/80 bg-slate-950/70 px-6 py-3 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Protection Anti-Intrusion Active</span>
          </div>
          <span className="text-slate-500">Ets AMANI Security</span>
        </div>
      </div>
    </div>
  );
}
