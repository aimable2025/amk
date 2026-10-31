import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileClock,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  getLocalAuditLogs,
  recordAuditLog,
  type AuditCategory,
  type AuditLogEntry,
  type AuditSeverity,
} from '../../../services/AuditService';

export { recordAuditLog };

interface AuditModuleProps {
  onClose?: () => void;
}

export default function AuditModule({ onClose }: AuditModuleProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let combined: AuditLogEntry[] = [];
      try {
        const auditRef = collection(firestoreDb, 'auditLogs');
        const q = query(auditRef, orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          combined = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              action: data.action || 'Action administrative',
              category: data.category || 'security',
              severity: data.severity || 'info',
              details: data.details || '',
              actorName: data.actorName || 'Système',
              actorRole: data.actorRole || 'administrateur_systeme',
              actorUid: data.actorUid,
              timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
              metadata: data.metadata,
            };
          });
        }
      } catch (err) {
        console.warn('Lecture auditLogs Firestore non disponible (hors ligne), fallback local:', err);
      }

      const local = getLocalAuditLogs();
      const ids = new Set(combined.map((l) => l.id));
      for (const loc of local) {
        if (!ids.has(loc.id)) {
          combined.push(loc);
        }
      }
      combined.sort((a, b) => b.timestamp - a.timestamp);
      setLogs(combined);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }
      if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const q = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        log.actorRole.toLowerCase().includes(q)
      );
    });
  }, [logs, selectedCategory, selectedSeverity, search]);

  const stats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter((l) => l.severity === 'critical' || l.severity === 'security').length;
    const warning = logs.filter((l) => l.severity === 'warning').length;
    const today = logs.filter((l) => {
      const d = new Date(l.timestamp);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { total, critical, warning, today };
  }, [logs]);

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-ets-amani-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const severityBadge = (severity: AuditSeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"><AlertCircle className="h-3 w-3" /> Critique</span>;
      case 'security':
        return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700"><ShieldAlert className="h-3 w-3" /> Sécurité</span>;
      case 'warning':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" /> Attention</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700"><CheckCircle2 className="h-3 w-3" /> Info</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Ets AMANI"
              className="h-12 w-12 shrink-0 object-contain rounded-2xl border border-slate-200 bg-white p-1 shadow-xs"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Journal d audit système</h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Traçabilité active
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Enregistrement et traçabilité des événements techniques, opérations et actions administratives.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Exporter
            </button>
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
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Total événements</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-medium text-purple-700">Sécurité & Alertes</p>
            <p className="mt-1 text-2xl font-bold text-purple-900">{stats.critical}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-700">Avertissements</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{stats.warning}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-medium text-emerald-700">Aujourd'hui</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{stats.today}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par action, acteur, détail..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as AuditCategory)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none"
            >
              <option value="all">Toutes catégories</option>
              <option value="security">Sécurité</option>
              <option value="auth">Authentification</option>
              <option value="operations">Opérations</option>
              <option value="sync">Synchronisation</option>
              <option value="config">Configuration</option>
              <option value="rbac">RBAC</option>
            </select>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none"
            >
              <option value="all">Tous niveaux</option>
              <option value="info">Info</option>
              <option value="warning">Attention</option>
              <option value="security">Sécurité</option>
              <option value="critical">Critique</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <FileClock className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">Aucun événement d audit trouvé</p>
            <p className="mt-1 text-sm text-slate-500">
              Ajustez vos filtres ou effectuez une nouvelle recherche.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const dateStr = new Date(log.timestamp).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="flex flex-col gap-3 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <UserAvatar name={log.actorName} size="sm" className="mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {severityBadge(log.severity)}
                        <p className="font-semibold text-slate-900">{log.action}</p>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 uppercase">
                          {log.category}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{log.details}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-slate-600">
                          <User className="h-3.5 w-3.5" />
                          {log.actorName} ({log.actorRole})
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLog(log);
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Détails
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  {severityBadge(selectedLog.severity)}
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                    {selectedLog.category}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-slate-900">{selectedLog.action}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase">Détails</p>
                <p className="mt-1 rounded-xl bg-slate-50 p-3 leading-6 text-slate-700">{selectedLog.details}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2.5">
                  <UserAvatar name={selectedLog.actorName} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-400 uppercase">Acteur</p>
                    <p className="mt-0.5 truncate font-medium text-slate-800">{selectedLog.actorName}</p>
                    <p className="truncate text-xs text-slate-500">{selectedLog.actorRole}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase">Date & Heure</p>
                  <p className="mt-1 font-medium text-slate-800">
                    {new Date(selectedLog.timestamp).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase">Identifiant</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{selectedLog.id}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
