import { Capacitor } from '@capacitor/core';
import { db } from '../lib/db';
import SmsReader from '../plugins/SmsReader';

export interface ResolvedInternalNumber {
  internalNumberId: string;
  phoneNumber: string;
  operator: 'vodacom' | 'airtel' | 'orange' | 'africell';
  agencyId: string | null;
  assignedUserId?: string | null;
  monitoringEnabled: boolean;
  collectorDeviceId?: string;
  collectorDeviceName?: string;
}

export interface CollectorDeviceConfig {
  internalNumberId?: string;
  phoneNumber?: string;
  deviceName?: string;
  agencyId?: string | null;
}

const COLLECTOR_PREF_KEY = 'ets_amani_collector_config_v1';

export function getLocalCollectorConfig(): CollectorDeviceConfig | null {
  try {
    const raw = localStorage.getItem(COLLECTOR_PREF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setLocalCollectorConfig(config: CollectorDeviceConfig): Promise<void> {
  try {
    localStorage.setItem(COLLECTOR_PREF_KEY, JSON.stringify(config));
    // Propager également dans les SharedPreferences Android natives
    if (Capacitor.isNativePlatform() && config.phoneNumber) {
      await SmsReader.setConfiguredCollectorNumber({
        phoneNumber: config.phoneNumber,
        internalNumberId: config.internalNumberId,
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Normalise un numéro de téléphone en RDC sans perte des numéros courts ou spécifiques.
 * Égalise:
 * - 03220590, +2433220590, 2433220590, 3220590 -> 3220590
 * - 0812345678, +243812345678, 243812345678 -> 812345678
 */
export function normalizePhoneNumber(phoneNumber?: string | null): string {
  if (!phoneNumber) return '';
  let digits = phoneNumber.replace(/[^\d]/g, '');
  if (digits.startsWith('243') && digits.length > 5) {
    digits = digits.slice(3);
  }
  if (digits.startsWith('0') && digits.length > 1) {
    digits = digits.slice(1);
  }
  return digits;
}

export async function resolveInternalNumber(
  phoneNumber?: string
): Promise<ResolvedInternalNumber | null> {
  let numbers = await db.internalNumbers.toArray();

  // Si le cache local est vide et que nous sommes en ligne, forcer la synchro
  if (numbers.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { syncInternalNumbers } = await import('./InternalNumberSyncService');
      await syncInternalNumbers();
      numbers = await db.internalNumbers.toArray();
    } catch {
      // ignore
    }
  }

  let match: (typeof numbers)[0] | undefined;

  // 1. Recherche par numéro fourni s'il est renseigné
  if (phoneNumber && phoneNumber.trim()) {
    const targetNormalized = normalizePhoneNumber(phoneNumber);
    if (targetNormalized) {
      match = numbers.find((item) => {
        const localNormalized = normalizePhoneNumber(item.phoneNumber);
        return localNormalized === targetNormalized;
      });
    }
  }

  // 2. Si non trouvé, tentative avec la configuration de terminal collecteur déclarée
  if (!match) {
    const collectorConfig = getLocalCollectorConfig();
    if (collectorConfig) {
      if (collectorConfig.internalNumberId) {
        match = numbers.find((n) => n.id === collectorConfig.internalNumberId);
      }
      if (!match && collectorConfig.phoneNumber) {
        const cfgNormalized = normalizePhoneNumber(collectorConfig.phoneNumber);
        match = numbers.find(
          (n) => normalizePhoneNumber(n.phoneNumber) === cfgNormalized
        );
      }
    }
  }

  // 3. Si sur Android natif, interroger les SharedPreferences du plugin
  if (!match && Capacitor.isNativePlatform()) {
    try {
      const nativeConfig = await SmsReader.getConfiguredCollectorNumber();
      if (nativeConfig.phoneNumber) {
        const nativeNormalized = normalizePhoneNumber(nativeConfig.phoneNumber);
        match = numbers.find(
          (n) => normalizePhoneNumber(n.phoneNumber) === nativeNormalized
        );
      }
    } catch {
      // ignore
    }
  }

  // 4. Si toujours non trouvé, recherche du numéro interne 03220590 (Vodacom)
  // comme fallback prioritaire officiel si configuré dans le système
  if (!match) {
    const targetVodacomNormalized = normalizePhoneNumber('03220590');
    match = numbers.find(
      (n) =>
        n.operator === 'vodacom' &&
        normalizePhoneNumber(n.phoneNumber) === targetVodacomNormalized
    );
  }

  // 5. Si non trouvé et connecté, tenter une ultime synchro descendante
  if (!match && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { syncInternalNumbers } = await import('./InternalNumberSyncService');
      await syncInternalNumbers();
      numbers = await db.internalNumbers.toArray();
      if (phoneNumber) {
        const targetNormalized = normalizePhoneNumber(phoneNumber);
        match = numbers.find(
          (item) => normalizePhoneNumber(item.phoneNumber) === targetNormalized
        );
      }
      if (!match) {
        const targetVodacomNormalized = normalizePhoneNumber('03220590');
        match = numbers.find(
          (n) =>
            n.operator === 'vodacom' &&
            normalizePhoneNumber(n.phoneNumber) === targetVodacomNormalized
        );
      }
    } catch {
      // ignore
    }
  }

  if (!match) {
    return null;
  }

  const collectorConfig = getLocalCollectorConfig();

  return {
    internalNumberId: match.id,
    phoneNumber: match.phoneNumber,
    operator: match.operator,
    agencyId: match.agencyId ?? null,
    assignedUserId: match.assignedUserId ?? null,
    monitoringEnabled: match.monitoringEnabled === true,
    collectorDeviceId: collectorConfig?.internalNumberId || match.id,
    collectorDeviceName: collectorConfig?.deviceName || 'Terminal Source',
  };
}

