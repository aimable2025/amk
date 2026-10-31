import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';
import type { DgFeatureControl, DgFeatureKey } from '../types/management';
import { DEFAULT_DG_FEATURES } from '../utils/defaultDgFeatures';

const COLLECTION = 'systemControls';
const DOCUMENT_ID = 'dgFeatures';
const LOCAL_STORAGE_KEY = 'ets_amani_dg_features_cache';

function readLocalFeatures(): Partial<DgFeatureControl> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeLocalFeatures(features: DgFeatureControl): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(features));
  } catch {
    // ignore
  }
}

export async function getDgFeatures(): Promise<DgFeatureControl> {
  const local = readLocalFeatures();
  try {
    const ref = doc(firestoreDb, COLLECTION, DOCUMENT_ID);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      const merged = { ...DEFAULT_DG_FEATURES, ...local };
      return merged;
    }
    const remote = {
      ...DEFAULT_DG_FEATURES,
      ...snapshot.data(),
    } as DgFeatureControl;
    writeLocalFeatures(remote);
    return remote;
  } catch {
    return {
      ...DEFAULT_DG_FEATURES,
      ...local,
    };
  }
}

export async function saveDgFeatures(
  features: DgFeatureControl
): Promise<void> {
  writeLocalFeatures(features);
  try {
    const ref = doc(firestoreDb, COLLECTION, DOCUMENT_ID);
    await setDoc(ref, features, { merge: true });
  } catch (err) {
    console.warn('[Ets AMANI] Sauvegarde features DG en cache local :', err);
  }
}

export async function resetDgFeatures(): Promise<DgFeatureControl> {
  await saveDgFeatures(DEFAULT_DG_FEATURES);
  return DEFAULT_DG_FEATURES;
}

export async function toggleDgFeature(
  key: DgFeatureKey
): Promise<DgFeatureControl> {
  const current = await getDgFeatures();
  const next: DgFeatureControl = {
    ...current,
    [key]: !current[key],
  };
  await saveDgFeatures(next);
  return next;
}
