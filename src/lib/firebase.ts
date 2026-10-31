import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
} from 'firebase/firestore';

// Désactive les journaux console.error internes de @firebase/firestore lors du basculement automatique en mode Offline-First
setLogLevel('silent');

export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyCte0umcFfJNPBdzlT0MbXwDFaEruRv9lI',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'ets-amani.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    'ets-amani',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'ets-amani.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '697171148070',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:697171148070:web:bd1150821e623991ad55e7',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

// Initialisation unique du singleton Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Service d'Authentification Firebase
export const auth = getAuth(app);

// Service Firestore avec persistance locale IndexedDB multi-onglets active et détection automatique du long-polling
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  experimentalAutoDetectLongPolling: true,
});

/**
 * Aliases de compatibilité pour Firestore (modules UI, services métiers et workers)
 */
export const firestoreDb = firestore;
export const db = firestore;

export default app;
