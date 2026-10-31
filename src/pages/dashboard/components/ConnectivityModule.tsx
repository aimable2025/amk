import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import { db as dexieDb } from '../../../lib/db';
import { db as firestoreDb } from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import { syncInternalNumbers } from '../../../services/InternalNumberSyncService';
import { processSmsSyncQueue } from '../../../services/SmsOperationService';

interface LocalDbStats {
  billetagesTotal: number;
  billetagesPending: number;
  operationsTotal: number;
  operationsPending: number;
  internalNumbersCount: number;
  smsOperationsCount: number;
  syncQueuePending: number;
  syncQueueFailed: number;
  smsSyncQueuePending: number;
  smsSyncQueueFailed: number;
}

interface ConnectivityModuleProps {
  onClose?: () => void;
}

export default function ConnectivityModule({ onClose }: ConnectivityModuleProps) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<LocalDbStats>({
    billetagesTotal: 0,
    billetagesPending: 0,
    operationsTotal: 0,
    operationsPending: 0,
    internalNumbersCount: 0,
    smsOperationsCount: 0,
    syncQueuePending: 0,
    syncQueueFailed: 0,
    smsSyncQueuePending: 0,
    smsSyncQueueFailed: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const [
        billetagesTotal,
        billetagesPending,
        operationsTotal,
        operationsPending,
        internalNumbersCount,
        smsOperationsCount,
        syncQueueItemsList,
        smsSyncQueuePending,
        smsSyncQueueFailed,
      ] = await Promise.all([
        dexieDb.billetages.count(),
        dexieDb.billetages.where('syncStatus').anyOf('local', 'pending').count().catch(() => 0),
        dexieDb.operations.count().catch(() => 0),
        dexieDb.operations.where('syncStatus').anyOf('pending', 'error').count().catch(() => 0),
        dexieDb.internalNumbers.count().catch(() => 0),
        dexieDb.smsOperations.count().catch(() => 0),
        dexieDb.syncQueue.toArray().catch(() => []),
        dexieDb.smsSyncQueue.where('status').equals('pending').count().catch(() => 0),
        dexieDb.smsSyncQueue.where('status').equals('failed').count().catch(() => 0),
      ]);

      const syncQueuePending = syncQueueItemsList.filter((item) => item.status === 'pending' || item.status === 'processing').length;
      const syncQueueFailed = syncQueueItemsList.filter((item) => item.status === 'failed').length;

      setDbStats({
        billetagesTotal,
        billetagesPending,
        operationsTotal,
        operationsPending,
        internalNumbersCount,
        smsOperationsCount,
        syncQueuePending,
        syncQueueFailed,
        smsSyncQueuePending,
        smsSyncQueueFailed,
      });
      setSyncQueueItems(syncQueueItemsList.slice(-20).reverse());
    } catch (err) {
      console.warn('Erreur lecture statistiques Dexie locales:', err);
    }
  }, []);

  const testLatency = useCallback(async () => {
    if (!navigator.onLine) {
      setLatencyMs(null);
      return;
    }
    setIsTestingLatency(true);
    const start = performance.now();
    try {
      const testQuery = query(collection(firestoreDb, 'agencies'), limit(1));
      await getDocs(testQuery);
      const diff = Math.round(performance.now() - start);
      setLatencyMs(diff);
    } catch {
      try {
        await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
        const diff = Math.round(performance.now() - start);
        setLatencyMs(diff);
      } catch {
        setLatencyMs(null);
      }
    } finally {
      setIsTestingLatency(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      testLatency();
      loadStats();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLatencyMs(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    loadStats();
    testLatency();

    const interval = setInterval(() => {
      loadStats();
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [loadStats, testLatency]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const failedItems = await dexieDb.syncQueue.where('status').equals('failed').toArray().catch(() => []);
      for (const item of failedItems) {
        if (item.id) {
          await dexieDb.syncQueue.update(item.id, {
            status: 'pending',
            attempts: 0,
            lastError: null,
          });
        }
      }
      const syncResult = await triggerSyncNow();
      const smsResult = await processSmsSyncQueue().catch(() => ({ processed: 0, failed: 0 }));
      await syncInternalNumbers().catch(() => {});
      await loadStats();
      await testLatency();
      const totalProcessed = syncResult.processed + smsResult.processed;
      const totalErrors = syncResult.errors + smsResult.failed;
      await recordAuditLog({
        action: 'Déclenchement manuel de la synchronisation',
        category: 'sync',
        severity: 'info',
        details: `Traitement des files d'attente Offline-First (${totalProcessed} synchronisés, ${totalErrors} erreurs).`,
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
      setSyncFeedback(
        `Synchronisation terminée (${totalProcessed} élément(s) synchronisé(s), ${totalErrors} erreur(s)).`
      );
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err) {
      console.error('Erreur déclenchement sync:', err);
      setSyncFeedback('Erreur lors du déclenchement de la synchronisation.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeCompleted = async () => {
    try {
      await dexieDb.syncQueue.where('status').equals('completed').delete();
      await dexieDb.smsSyncQueue.where('status').equals('completed').delete();
      await loadStats();
      setSyncFeedback('Éléments terminés purgés de la mémoire locale.');
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err) {
      console.warn('Erreur purge:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isOnline ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'} shadow-sm`}>
              {isOnline ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Connectivité & Moteur Offline-First</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {isOnline ? 'En ligne (Cloud Firestore relié)' : 'Hors-ligne (Mode autonome actif)'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Superviser le fonctionnement continu des bases locales Dexie et la synchronisation avec Firestore.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Synchroniser
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

        {syncFeedback && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p>{syncFeedback}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">État Réseau</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <p className="text-lg font-bold text-slate-900">
                {isOnline ? 'Connectivité normale' : 'Connexion coupée'}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isOnline ? 'Lecture et écriture Firestore autorisées.' : 'Enregistrement 100% local dans Dexie.'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase">Latence Serveur</p>
              <button
                type="button"
                onClick={testLatency}
                disabled={isTestingLatency || !isOnline}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {isTestingLatency ? 'Test en cours...' : 'Tester'}
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {latencyMs !== null ? `${latencyMs} ms` : isOnline ? '—' : 'N/A'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Temps d'aller-retour moyen vers les services Firebase.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">File de synchronisation</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {dbStats.syncQueuePending + dbStats.smsSyncQueuePending} en attente
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {dbStats.syncQueueFailed + dbStats.smsSyncQueueFailed} éléments en échec
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bases locales Dexie (IndexedDB)</h2>
              <p className="text-xs text-slate-500">Volumétrie des tables locales sur l'appareil</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadStats}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Rafraîchir
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Billetages en caisse</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dbStats.billetagesTotal}</p>
            <p className="mt-0.5 text-xs text-amber-600">{dbStats.billetagesPending} à synchroniser</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Opérations agence</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dbStats.operationsTotal}</p>
            <p className="mt-0.5 text-xs text-amber-600">{dbStats.operationsPending} à synchroniser</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Numéros internes</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dbStats.internalNumbersCount}</p>
            <p className="mt-0.5 text-xs text-slate-400">En cache local</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Opérations SMS</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dbStats.smsOperationsCount}</p>
            <p className="mt-0.5 text-xs text-slate-400">Capturées sur flotte</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Éléments récents dans la file de synchronisation</h2>
              <p className="text-xs text-slate-500">File d'attente Offline-First vers le cloud</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePurgeCompleted}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
            Purger les terminés
          </button>
        </div>

        {syncQueueItems.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-2 font-semibold text-slate-800">Toutes les données sont synchronisées</p>
            <p className="text-xs text-slate-500">La file d'attente locale est actuellement vide.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {syncQueueItems.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between p-4 text-sm">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    item.status === 'completed'
                      ? 'bg-emerald-500'
                      : item.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500 animate-pulse'
                  }`} />
                  <div>
                    <p className="font-semibold text-slate-800">
                      Entité : {item.entity} — ID : {item.entityId}
                    </p>
                    <p className="text-xs text-slate-500">
                      Action : {item.operation} | Tentatives : {item.attempts || 0}
                      {item.lastError && <span className="ml-2 text-red-600">({item.lastError})</span>}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  item.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : item.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
