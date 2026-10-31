import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Info,
  Key,
  Layers,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import {
  db as firestoreDb,
  firebaseConfig,
  isFirebaseConfigured,
} from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';

interface SystemFirebaseModuleProps {
  onClose?: () => void;
}

interface CollectionCheck {
  name: string;
  count: number;
  status: 'ok' | 'empty' | 'error';
  sampleId?: string;
}

export default function SystemFirebaseModule({ onClose }: SystemFirebaseModuleProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionCheck[]>([]);

  const trackedCollections = [
    'users',
    'agencies',
    'billetages',
    'operations',
    'internalNumbers',
    'smsOperations',
    'auditLogs',
    'system',
  ];

  const checkCollections = async () => {
    setTesting(true);
    setTestResult(null);
    const results: CollectionCheck[] = [];

    for (const colName of trackedCollections) {
      try {
        const q = query(collection(firestoreDb, colName), limit(5));
        const snap = await getDocs(q);
        results.push({
          name: colName,
          count: snap.size,
          status: snap.empty ? 'empty' : 'ok',
          sampleId: snap.docs[0]?.id,
        });
      } catch (err: any) {
        results.push({
          name: colName,
          count: 0,
          status: 'error',
        });
      }
    }

    setCollections(results);
    setTesting(false);
    setTestResult('Contrôle de connectivité Firestore terminé.');
  };

  useEffect(() => {
    checkCollections();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Infrastructure Cloud Firebase & Firestore</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isFirebaseConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {isFirebaseConfigured ? 'Projet Initialisé' : 'Non Configuré'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Supervision des variables d'environnement, permissions de lecture/écriture et collections Cloud.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkCollections}
              disabled={testing}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
              Tester l'accès
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

        {testResult && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 border border-slate-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p>{testResult}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Project ID</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">
              {firebaseConfig.projectId || 'Non défini'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Identifiant GCP du projet</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Auth Domain</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900 truncate">
              {firebaseConfig.authDomain || 'Non défini'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Domaine OAuth et vérification</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Stockage & Règles</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">
              {firebaseConfig.storageBucket || 'Défaut'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Bucket Cloud Storage</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">État des collections Firestore distantes</h2>
            <p className="text-xs text-slate-500">Validation des endpoints et lecture des schémas</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((col) => (
            <div
              key={col.name}
              className={`rounded-2xl border p-4 transition ${
                col.status === 'ok'
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : col.status === 'empty'
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-red-200 bg-red-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-slate-900">/{col.name}</span>
                {col.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : col.status === 'empty' ? (
                  <Info className="h-4 w-4 text-slate-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {col.status === 'ok'
                  ? `Documents accessibles (${col.count}+)`
                  : col.status === 'empty'
                  ? 'Collection vide ou en attente d initialisation'
                  : 'Erreur d accès ou règles restrictives'}
              </p>
              {col.sampleId && (
                <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                  Ex: {col.sampleId}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Sécurité et Règles Firestore</h2>
            <p className="text-xs text-slate-500">Contraintes de sécurité et contrôle d accès basés sur les rôles</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <Key className="mt-0.5 h-5 w-5 text-slate-700 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">Contrôle d'accès RBAC actif</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Les agents ne peuvent lire que les données relatives à leur agence ou aux opérations qui leur sont explicitement affectées. Le Directeur Général et l'Administrateur Système disposent d'un droit de supervision global.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
