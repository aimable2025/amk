export type MobileOperator =
  | 'vodacom'
  | 'airtel'
  | 'orange'
  | 'africell';

export type InternalNumberStatus =
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'archived';

export interface InternalNumber {
  id: string;
  phoneNumber: string;
  operator: MobileOperator;
  agencyId: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  label?: string;
  description?: string;
  status: InternalNumberStatus;
  monitoringEnabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
