export type OperationType =
  | 'retrait'
  | 'depot'
  | 'transfert'
  | 'approvisionnement'
  | 'collecte'
  | 'paiement'
  | 'supervision'
  | 'mission'
  | 'maintenance'
  | 'autre';

export type OperationPriority =
  | 'maintenant'
  | 'tres_urgent'
  | 'urgent'
  | 'normal'
  | 'attendre';

export type OperationStatus =
  | 'cree'
  | 'envoye'
  | 'recu'
  | 'valide'
  | 'assigne'
  | 'en_cours'
  | 'termine'
  | 'rejete'
  | 'annule'
  | 'archive';

export type OperationSyncStatus =
  | 'local'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'error';

export type OperationAssignmentStatus =
  | 'propose'
  | 'acceptee'
  | 'refusee'
  | 'en_cours'
  | 'terminee'
  | 'annulee';

export interface Operation {
  id: string;
  operationNumber: string;
  type: OperationType;
  title: string;
  description: string;
  priority: OperationPriority;
  status: OperationStatus;
  agencyId: string;
  agencyName: string;
  assignedAgentIds: string[];
  assignedAgentNames: string[];
  createdBy: string;
  createdByName: string;
  createdByRole: 'directeur_general' | 'administrateur_agence' | 'administrateur_systeme';
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  amount?: number;
  currency?: 'USD' | 'CDF';
  operatorName?: string;
  accountNumber?: string;
  comments?: string;
  completedAt?: number;
  closedAt?: number;
  syncStatus: OperationSyncStatus;
  lastSyncError?: string | null;
}

export interface OperationAssignment {
  id: string;
  operationId: string;
  operationNumber: string;
  agencyId: string;
  agentId: string;
  agentName: string;
  agentFunction?: string;
  assignedBy: string;
  assignedByName: string;
  status: OperationAssignmentStatus;
  acceptedAt?: number;
  startedAt?: number;
  completedAt?: number;
  progress: number;
  result?: string;
  comments?: string;
  createdAt: number;
  updatedAt: number;
  syncStatus: OperationSyncStatus;
}

export interface CreateOperationInput {
  type: OperationType;
  title: string;
  description: string;
  priority: OperationPriority;
  agencyId: string;
  agencyName: string;
  assignedAgentIds: string[];
  assignedAgentNames: string[];
  createdBy: string;
  createdByName: string;
  dueDate?: number;
  amount?: number;
  currency?: 'USD' | 'CDF';
  operatorName?: string;
  accountNumber?: string;
  comments?: string;
}
