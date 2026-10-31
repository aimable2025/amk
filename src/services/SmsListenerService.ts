import {
  Capacitor,
  type PluginListenerHandle,
} from '@capacitor/core';
import SmsReader, {
  type SmsReceivedEvent,
  type PendingSmsItem,
} from '../plugins/SmsReader';
import {
  saveSmsOperationLocally,
} from './SmsOperationService';
import {
  resolveInternalNumber,
} from './InternalNumberResolver';

import { db } from '../lib/db';
import type { SmsOperationStatus } from '../types/smsOperation';

let listenerHandle: PluginListenerHandle | null = null;

function generateSmsId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sms_${crypto.randomUUID()}`;
  }
  return `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Analyse le texte d'un SMS télécom (M-Pesa, Airtel Money, Orange Money, Africell)
 * pour identifier les données financières sans jamais les considérer comme une preuve absolue.
 */
function parseSmsContent(message: string): {
  reference?: string;
  amount?: number;
  currency?: string;
  transactionType?: string;
} {
  const result: {
    reference?: string;
    amount?: number;
    currency?: string;
    transactionType?: string;
  } = {};

  try {
    // 1. Référence de transaction
    const refMatch =
      message.match(/(?:TxId|Trans(?:\.|\s+)?Id|Ref(?:\.|\s+)?|ID(?:\.|\s+)?|Réf(?:\.|\s+)?|transaction\s+(?:n°|no|id)?)\s*[:#]?\s*([A-Za-z0-9._-]+)/i) ||
      message.match(/\b([A-Z0-9]{8,15})\b/);
    if (refMatch && refMatch[1]) {
      result.reference = refMatch[1].trim();
    }

    // 2. Montant et devise (USD ou CDF/FC)
    const amountMatch =
      message.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s*(USD|\$|CDF|FC)\b/i) ||
      message.match(/(?:USD|\$|CDF|FC)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i) ||
      message.match(/(?:reçu|recu|envoyé|envoye|retiré|retire|montant)\s*[:]?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(USD|CDF|FC)?/i);

    if (amountMatch) {
      const valStr = (amountMatch[1] || amountMatch[2])?.replace(',', '.');
      const curStr = (amountMatch[2] || amountMatch[1])?.toUpperCase();
      const num = parseFloat(valStr);
      if (!isNaN(num)) {
        result.amount = num;
      }
      if (curStr) {
        result.currency = curStr.includes('CDF') || curStr.includes('FC') ? 'CDF' : 'USD';
      }
    }

    // 3. Type d'opération suggéré par le SMS
    if (/reçu|recu|credited|dépôt|depot/i.test(message)) {
      result.transactionType = 'depot';
    } else if (/envoyé|envoye|retiré|retire|debited/i.test(message)) {
      result.transactionType = 'retrait';
    }
  } catch {
    // Échec silencieux du parseur, conservation du SMS brut
  }

  return result;
}

async function processSms(
  event: SmsReceivedEvent | PendingSmsItem
): Promise<void> {
  if (!event.message) {
    return;
  }
  try {
    const rawReceiver =
      'receiverPhoneNumber' in event
        ? event.receiverPhoneNumber?.trim()
        : undefined;

    // Résolution multi-niveaux du numéro interne (SIM, terminal collecteur, configuration locale ou 03220590)
    const internalNumber = await resolveInternalNumber(rawReceiver);
    if (!internalNumber) {
      console.warn(
        '[Ets AMANI] SMS en attente non associé : aucun numéro interne actif configuré pour ce terminal collecteur.',
        rawReceiver || 'non spécifié'
      );
      return;
    }

    if (!internalNumber.monitoringEnabled) {
      console.info(
        '[Ets AMANI] SMS ignoré : la surveillance est désactivée pour le numéro interne.',
        internalNumber.phoneNumber
      );
      return;
    }

    const parsed = parseSmsContent(event.message);

    // Déduplication stricte et idempotente :
    // A. Par référence de transaction si disponible pour ce numéro interne
    if (parsed.reference) {
      const existingByRef = await db.smsOperations
        .where('transactionReference')
        .equals(parsed.reference)
        .filter((item) => item.internalNumberId === internalNumber.internalNumberId)
        .first();

      if (existingByRef) {
        console.info('[Ets AMANI] SMS déjà enregistré avec cette référence de transaction :', parsed.reference);
        return;
      }
    }

    // B. Par timestamp, expéditeur et contenu exact
    const duplicate = await db.smsOperations
      .where('operationDate')
      .equals(event.timestamp)
      .filter(
        (item) =>
          item.sender === event.sender &&
          item.rawMessage === event.message &&
          item.internalNumberId === internalNumber.internalNumberId
      )
      .first();

    if (duplicate) {
      console.info('[Ets AMANI] SMS dupliqué ignoré :', duplicate.id);
      return;
    }

    const now = Date.now();

    // Détermination de l'état du cycle de vie
    let status: SmsOperationStatus = 'received';
    if (parsed.reference && parsed.amount !== undefined) {
      status = 'identified';
    } else if (parsed.amount !== undefined || parsed.reference) {
      status = 'analyzed';
    }

    await saveSmsOperationLocally({
      id: generateSmsId(),
      internalNumberId: internalNumber.internalNumberId,
      agencyId: internalNumber.agencyId,
      operator: internalNumber.operator,
      sender: event.sender || 'OPÉRATEUR',
      rawMessage: event.message,
      transactionReference: parsed.reference,
      amount: parsed.amount,
      currency: parsed.currency || 'USD',
      transactionType: parsed.transactionType,
      operationDate: event.timestamp || now,
      receivedAt: now,
      processedAt: now,
      status,
      reconciliationStatus: 'unmatched', // Non rapproché par défaut : un SMS ne constitue jamais une preuve financière suffisante
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    console.info('[Ets AMANI] SMS opérateur enregistré avec succès et en attente de synchronisation.', {
      internalNumberId: internalNumber.internalNumberId,
      phoneNumber: internalNumber.phoneNumber,
      operator: internalNumber.operator,
      agencyId: internalNumber.agencyId,
      reference: parsed.reference,
      amount: parsed.amount,
      status,
    });

    // Déclenchement immédiat de la synchronisation vers Firestore si le réseau est accessible
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      import('./SmsOperationService')
        .then(({ processSmsSyncQueue }) => processSmsSyncQueue())
        .catch(() => {});
    }
  } catch (error) {
    console.error(
      '[Ets AMANI] Erreur lors du traitement du SMS :',
      error
    );
  }
}

export async function requestSmsPermissions() {
  if (!Capacitor.isNativePlatform()) {
    return {
      receiveSms: false,
      readSms: false,
      granted: false,
    };
  }
  return SmsReader.requestPermissions();
}

export async function checkSmsPermissions() {
  if (!Capacitor.isNativePlatform()) {
    return {
      receiveSms: false,
      readSms: false,
      granted: false,
    };
  }
  return SmsReader.checkPermissions();
}

async function processPendingSms(): Promise<void> {
  try {
    const result = await SmsReader.getPendingSms();
    if (!result.items || result.items.length === 0) {
      return;
    }
    console.info(`[Ets AMANI] ${result.items.length} SMS en attente détecté(s).`);
    for (const sms of result.items) {
      await processSms(sms);
    }
  } catch (error) {
    console.error(
      '[Ets AMANI] Impossible de récupérer les SMS en attente :',
      error
    );
  }
}

export async function startSmsListener(): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) {
    return async () => {};
  }
  if (listenerHandle) {
    return async () => {};
  }

  await processPendingSms();
  listenerHandle = await SmsReader.addListener(
    'smsReceived',
    async (event: SmsReceivedEvent) => {
      await processSms(event);
    }
  );

  console.info('[Ets AMANI] Listener SMS démarré.');
  return async () => {
    if (listenerHandle) {
      await listenerHandle.remove();
      listenerHandle = null;
      console.info('[Ets AMANI] Listener SMS arrêté.');
    }
  };
}
