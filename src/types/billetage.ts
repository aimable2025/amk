export type BilletageType = 'personal' | 'business';
export type BilletageCurrency = 'USD' | 'CDF';
export type BilletageStatus =
  | 'draft'
  | 'completed'
  | 'validated'
  | 'cancelled';
export type BilletageSyncStatus =
  | 'local'
  | 'pending'
  | 'synced'
  | 'error';

export type BilletagePermission =
  | 'billetage.access'
  | 'billetage.calculate'
  | 'billetage.create'
  | 'billetage.read_own'
  | 'billetage.read_agency'
  | 'billetage.update_own'
  | 'billetage.update_agency'
  | 'billetage.validate'
  | 'billetage.supervise'
  | 'billetage.export';

export interface BilletageDenominationConfig {
  id: string;
  currency: BilletageCurrency;
  value: number;
  label?: string;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface BilletageLine {
  denominationId: string;
  currency: BilletageCurrency;
  denomination: number;
  quantity: number;
  subtotal: number;
}

export interface BilletageCalculation {
  currency: BilletageCurrency;
  lines: BilletageLine[];
  total: number;
  declaredAmount: number | null;
  discrepancy: number | null;
  isCoherent: boolean;
}

export interface CreateBilletageInput {
  type: BilletageType;
  userId: string;
  agencyId?: string | null;
  currency: BilletageCurrency;
  transactionId?: string | null;
  reference?: string | null;
  lines: BilletageLine[];
  declaredAmount?: number | null;
}

export interface BilletageRecord {
  id: string;
  type: BilletageType;
  userId: string;
  agencyId?: string | null;
  currency: BilletageCurrency;
  lines: BilletageLine[];
  calculatedTotal: number;
  declaredAmount: number | null;
  discrepancy: number | null;
  status: BilletageStatus;
  syncStatus: BilletageSyncStatus;
  transactionId?: string | null;
  reference?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BilletageAccess {
  access: boolean;
  calculate: boolean;
  create: boolean;
  readOwn: boolean;
  readAgency: boolean;
  updateOwn: boolean;
  updateAgency: boolean;
  validate: boolean;
  supervise: boolean;
  export: boolean;
}

export const DEFAULT_USD_DENOMINATIONS: readonly number[] = [
  100,
  50,
  20,
  10,
  5,
  1,
] as const;

export const DEFAULT_CDF_DENOMINATIONS: readonly number[] = [] as const;

export function calculateBilletageSubtotal(
  denomination: number,
  quantity: number
): number {
  if (!Number.isFinite(denomination) || denomination < 0) {
    throw new Error('Dénomination invalide.');
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantité invalide.');
  }
  return denomination * quantity;
}

export function calculateBilletageTotal(
  lines: readonly BilletageLine[]
): number {
  return lines.reduce((total, line) => {
    return total + calculateBilletageSubtotal(
      line.denomination,
      line.quantity
    );
  }, 0);
}

export function calculateBilletageDiscrepancy(
  calculatedTotal: number,
  declaredAmount: number | null | undefined
): number | null {
  if (declaredAmount === null || declaredAmount === undefined) {
    return null;
  }
  if (!Number.isFinite(declaredAmount)) {
    throw new Error('Montant déclaré invalide.');
  }
  return calculatedTotal - declaredAmount;
}

export function isBilletageCoherent(
  calculatedTotal: number,
  declaredAmount: number | null | undefined
): boolean {
  if (declaredAmount === null || declaredAmount === undefined) {
    return true;
  }
  return calculatedTotal === declaredAmount;
}
