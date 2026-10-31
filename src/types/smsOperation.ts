export type SmsOperationStatus =
  | 'received'    // SMS reçu du réseau
  | 'analyzed'    // SMS analysé
  | 'identified'  // Opération identifiée
  | 'matched'     // Opération rapprochée avec une transaction
  | 'validated'   // Opération validée par supervision
  | 'pending'     // En attente (rétrocompatibilité)
  | 'processed'   // Traité (rétrocompatibilité)
  | 'flagged';    // Divergence / Anomalie signalée

export interface SmsOperation {
  id: string;
  internalNumberId: string;
  receiverPhoneNumber?: string;
  agencyId: string | null;
  operator:
    | 'vodacom'
    | 'airtel'
    | 'orange'
    | 'africell';
  sender?: string;
  rawMessage: string;
  transactionReference?: string;
  amount?: number;
  currency?: string;
  transactionType?: string;
  operationDate?: number;
  receivedAt: number;
  processedAt?: number;
  collectorDeviceId?: string | null;
  collectorDeviceName?: string | null;
  status: SmsOperationStatus;
  reconciliationStatus?: 'unmatched' | 'matched' | 'discrepancy' | 'validated';
  reconciledOperationId?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: number | null;
  discrepancyReason?: string | null;
  validationNotes?: string | null;
  syncStatus:
    | 'pending'
    | 'synced'
    | 'failed';
  lastSyncError?: string | null;
  createdAt: number;
  updatedAt: number;
}


