import type { DgFeatureControl } from '../types/management';

export const DEFAULT_DG_FEATURES: DgFeatureControl = {
  dashboard: true,
  agenciesManage: true,
  employeesManage: true,
  membersManage: true,
  clientsManage: true,
  transactionsManage: true,
  billetageAccess: true,
  internalNumbersManage: true,
  commissionsManage: true,
  reportsManage: true,
  communicationManage: true,
  supervisionAccess: true,
  auditRead: true,
  notificationsManage: true,
  operationalSettingsManage: true,
};
