import React from 'react';
import {
  ArrowLeftRight,
  Briefcase,
  Building2,
  Calculator,
  CheckCircle2,
  Coins,
  Layers,
  MapPin,
  Scale,
  Smartphone,
  Users,
} from 'lucide-react';
import type { AgentCategorySpecificData, AgentReportCategory } from '../../../types/report';

export interface CategoryFormProps {
  category: AgentReportCategory;
  onCategoryChange: (cat: AgentReportCategory) => void;
  data: AgentCategorySpecificData;
  onChange: (updater: (prev: AgentCategorySpecificData) => AgentCategorySpecificData) => void;
  readOnly?: boolean;
}

export const CATEGORY_OPTIONS: Array<{
  id: AgentReportCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    id: 'guichetier',
    label: 'Guichetier',
    icon: Users,
    description: 'Accueil, retraits, versements et exécution au guichet',
  },
  {
    id: 'caisse',
    label: 'Caissier',
    icon: Coins,
    description: 'Tenue de caisse, flux USD/CDF et clôture de coffre',
  },
  {
    id: 'comptable',
    label: 'Agent Comptable',
    icon: Calculator,
    description: 'Rapprochements, pointage des écritures et pièces',
  },
  {
    id: 'agent_change',
    label: 'Agent de Change',
    icon: ArrowLeftRight,
    description: 'Opérations de change, volumes par devise et écarts',
  },
  {
    id: 'agent_virtuel',
    label: 'Agent Virtuel',
    icon: Smartphone,
    description: 'Flotte SMS, Mobile Money et opérations distantes',
  },
  {
    id: 'agent_terrain',
    label: 'Agent de Terrain',
    icon: MapPin,
    description: 'Missions extérieures, supervision et logistique',
  },
  {
    id: 'polyvalent',
    label: 'Agent Polyvalent',
    icon: Layers,
    description: 'Multi-activités combinées sans double comptage',
  },
];

export default function ReportAdaptiveCategoryForm({
  category,
  onCategoryChange,
  data,
  onChange,
  readOnly = false,
}: CategoryFormProps) {
  const activeServices = data.activeSelectedCategories || ['guichetier', 'caisse'];

  const toggleMultiService = (serviceId: string) => {
    if (readOnly) return;
    onChange((prev) => {
      const current = prev.activeSelectedCategories || ['guichetier', 'caisse'];
      const next = current.includes(serviceId)
        ? current.filter((s) => s !== serviceId)
        : [...current, serviceId];
      return { ...prev, activeSelectedCategories: next.length > 0 ? next : [serviceId] };
    });
  };

  const updateField = <K extends keyof AgentCategorySpecificData>(
    key: K,
    value: AgentCategorySpecificData[K]
  ) => {
    if (readOnly) return;
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Sélecteur de profil métier adaptatif */}
      {!readOnly && (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Profil Métier du Rapporteur (Formulaire Adaptatif)
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = category === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onCategoryChange(opt.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center transition ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span className="text-[11px] leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode Polyvalent : Sélecteur des services réellement exercés pendant la période */}
      {category === 'polyvalent' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-700" />
            <span className="text-xs font-bold text-blue-950">
              Agent Polyvalent — Cochez les activités réellement exercées sur la période :
            </span>
          </div>
          <p className="text-[11px] text-blue-800">
            Le formulaire affiche dynamiquement les sections correspondantes. Chaque activité conserve ses propres totaux pour éviter tout double comptage.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {CATEGORY_OPTIONS.filter((o) => o.id !== 'polyvalent').map((opt) => {
              const isChecked = activeServices.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleMultiService(opt.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    isChecked
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${isChecked ? 'text-blue-300' : 'text-slate-300'}`} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. SECTION GUICHETIER */}
      {(category === 'guichetier' || (category === 'polyvalent' && activeServices.includes('guichetier'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Guichetier — Accueil & Opérations Clientèle
            </h5>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Opérations traitées
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.tellerOperationsCount ?? 0}
                onChange={(e) => updateField('tellerOperationsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Clients servis
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.clientsServedCount ?? 0}
                onChange={(e) => updateField('clientsServedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-emerald-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Opérations en attente
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.pendingTransactionsCount ?? 0}
                onChange={(e) => updateField('pendingTransactionsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-amber-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Annulées / Rejetées
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.cancelledOrRejectedCount ?? 0}
                onChange={(e) => updateField('cancelledOrRejectedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-red-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Anomalies de guichet constatées
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.tellerAnomaliesNotes ?? ''}
                onChange={(e) => updateField('tellerAnomaliesNotes', e.target.value)}
                placeholder="Ex: Refus pour signature non conforme, pièce expirée..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Difficultés techniques & observations guichet
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.technicalDifficultiesNotes ?? ''}
                onChange={(e) => updateField('technicalDifficultiesNotes', e.target.value)}
                placeholder="Ex: Ralentissement liaison, imprimante thermique..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. SECTION CAISSIER */}
      {(category === 'caisse' || (category === 'polyvalent' && activeServices.includes('caisse'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Coins className="h-4 w-4 text-amber-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Caissier — Caisse, Recettes & Décaissements Distincts USD / CDF
            </h5>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Caisse concernée / N° Guichet
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.cashRegisterIdentifier ?? ''}
                onChange={(e) => updateField('cashRegisterIdentifier', e.target.value)}
                placeholder="Ex: Caisse Principale 1"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Opérations de caisse traitées
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.cashOperationsCount ?? 0}
                onChange={(e) => updateField('cashOperationsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Écarts constatés & justification
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.cashDiscrepancyReason ?? ''}
                onChange={(e) => updateField('cashDiscrepancyReason', e.target.value)}
                placeholder="Ex: Caisse équilibrée ou écart justifié par billet usé..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>

          {/* Ventilation stricte par devise sans mélange */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl bg-slate-50 p-2.5 border border-slate-200">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Recettes USD</span>
              <input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={data.authorizedReceiptsUSD ?? 0}
                onChange={(e) => updateField('authorizedReceiptsUSD', Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs font-bold text-emerald-700"
              />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Décaissements USD</span>
              <input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={data.authorizedDisbursementsUSD ?? 0}
                onChange={(e) => updateField('authorizedDisbursementsUSD', Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs font-bold text-rose-700"
              />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Recettes CDF</span>
              <input
                type="number"
                step="100"
                disabled={readOnly}
                value={data.authorizedReceiptsCDF ?? 0}
                onChange={(e) => updateField('authorizedReceiptsCDF', Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs font-bold text-blue-700"
              />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Décaissements CDF</span>
              <input
                type="number"
                step="100"
                disabled={readOnly}
                value={data.authorizedDisbursementsCDF ?? 0}
                onChange={(e) => updateField('authorizedDisbursementsCDF', Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs font-bold text-rose-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. SECTION COMPTABLE */}
      {(category === 'comptable' || (category === 'polyvalent' && activeServices.includes('comptable'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Calculator className="h-4 w-4 text-purple-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Comptable — Écritures, Rapprochements & Justificatifs
            </h5>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Période comptable
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.accountingPeriodName ?? ''}
                onChange={(e) => updateField('accountingPeriodName', e.target.value)}
                placeholder="Ex: Clôture Mars 2026"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Dossiers comptables traités
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.filesProcessedCount ?? 0}
                onChange={(e) => updateField('filesProcessedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Opérations comptabilisées
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.operationsBookedCount ?? 0}
                onChange={(e) => updateField('operationsBookedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-purple-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Rapprochements effectués
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.reconciliationsDoneCount ?? 0}
                onChange={(e) => updateField('reconciliationsDoneCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-emerald-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Écarts constatés
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.discrepanciesCount ?? 0}
                onChange={(e) => updateField('discrepanciesCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-amber-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Pièces justificatives manquantes
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.missingReceiptsCount ?? 0}
                onChange={(e) => updateField('missingReceiptsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-red-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Actions correctives entreprises
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.accountingCorrectiveActions ?? ''}
                onChange={(e) => updateField('accountingCorrectiveActions', e.target.value)}
                placeholder="Ex: Régularisation d'écriture, relance caissier..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Observations & Recommandations comptables
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.accountingObservations ?? ''}
                onChange={(e) => updateField('accountingObservations', e.target.value)}
                placeholder="Ex: Recommandation d'archivage physique des bordereaux..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTION AGENT DE CHANGE */}
      {(category === 'agent_change' || (category === 'polyvalent' && activeServices.includes('agent_change'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Agent de Change — Devises & Volumes Négociés (Zéro Amalgame)
            </h5>
          </div>

          <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 border border-amber-200">
            <strong>Règle de traçabilité stricte :</strong> Les volumes USD et CDF ne sont jamais additionnés dans un même total sans conversion officielle traçable.
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Nombre de changes traités
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.exchangeOperationsCount ?? 0}
                onChange={(e) => updateField('exchangeOperationsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Volume Total USD Traité
              </label>
              <input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={data.exchangeVolumeUSD ?? 0}
                onChange={(e) => updateField('exchangeVolumeUSD', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Volume Total CDF Traité
              </label>
              <input
                type="number"
                step="1000"
                disabled={readOnly}
                value={data.exchangeVolumeCDF ?? 0}
                onChange={(e) => updateField('exchangeVolumeCDF', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-blue-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Opérations en attente
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.pendingExchangeOpsCount ?? 0}
                onChange={(e) => updateField('pendingExchangeOpsCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-amber-700"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Écarts de taux, anomalies ou observations change
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={data.exchangeAnomaliesNotes ?? ''}
              onChange={(e) => updateField('exchangeAnomaliesNotes', e.target.value)}
              placeholder="Ex: Variation de taux de clôture, liquidités suffisantes..."
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
        </div>
      )}

      {/* 5. SECTION AGENT VIRTUEL */}
      {(category === 'agent_virtuel' || (category === 'polyvalent' && activeServices.includes('agent_virtuel'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Smartphone className="h-4 w-4 text-cyan-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Agent Virtuel — SMS, Flotte & Opérations Distantes
            </h5>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Demandes reçues
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.requestsReceivedCount ?? 0}
                onChange={(e) => updateField('requestsReceivedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Demandes résolues
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.requestsResolvedCount ?? 0}
                onChange={(e) => updateField('requestsResolvedCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Dossiers en attente
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.pendingVirtualFilesCount ?? 0}
                onChange={(e) => updateField('pendingVirtualFilesCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-amber-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Coupures de connexion
              </label>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={data.connectionIssuesCount ?? 0}
                onChange={(e) => updateField('connectionIssuesCount', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-rose-600"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Incidents techniques & Actions entreprises
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={data.virtualActionsTaken ?? ''}
              onChange={(e) => updateField('virtualActionsTaken', e.target.value)}
              placeholder="Ex: Basculement vers modem secondaire, validation manuelle effectuée..."
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
        </div>
      )}

      {/* 6. SECTION AGENT DE TERRAIN */}
      {(category === 'agent_terrain' || (category === 'polyvalent' && activeServices.includes('agent_terrain'))) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <MapPin className="h-4 w-4 text-rose-600" />
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Volet Agent de Terrain & Missions Extérieures
            </h5>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Mission attribuée
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.assignedMissionTitle ?? ''}
                onChange={(e) => updateField('assignedMissionTitle', e.target.value)}
                placeholder="Ex: Approvisionnement point de vente..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Objectif de mission
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.missionObjective ?? ''}
                onChange={(e) => updateField('missionObjective', e.target.value)}
                placeholder="Ex: Livraison sécurisée des fonds"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Lieu d'intervention
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.interventionLocation ?? ''}
                onChange={(e) => updateField('interventionLocation', e.target.value)}
                placeholder="Ex: Succursale Sud, Ville..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Activités réalisées & Résultats obtenus
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.fieldActivitiesCompleted ?? ''}
                onChange={(e) => updateField('fieldActivitiesCompleted', e.target.value)}
                placeholder="Ex: Remise contradictoire avec signature du bordereau..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Recommandations de sécurité / Référence justificatif
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={data.fieldRecommendations ?? ''}
                onChange={(e) => updateField('fieldRecommendations', e.target.value)}
                placeholder="Ex: Bordereau physique déposé au coffre..."
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Affichage en lecture seule (Consultation écran et Export PDF officiel)
 */
export function ReportAdaptiveCategoryView({ data }: { data?: AgentCategorySpecificData }) {
  if (!data) return null;

  const hasAnyData = Object.values(data).some((val) => val !== undefined && val !== null && val !== '');
  if (!hasAnyData) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Briefcase className="h-4 w-4 text-slate-700" />
        <h4 className="font-bold text-slate-900 uppercase tracking-wide">
          Déclarations & Volet Métier Spécifique (Vérifié)
        </h4>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.cashRegisterIdentifier && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Caisse concernée</span>
            <span className="font-bold text-slate-900">{data.cashRegisterIdentifier}</span>
          </div>
        )}
        {data.tellerOperationsCount !== undefined && data.tellerOperationsCount > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Opérations Guichet</span>
            <span className="font-bold text-slate-900">{data.tellerOperationsCount}</span>
          </div>
        )}
        {data.clientsServedCount !== undefined && data.clientsServedCount > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Clients servis</span>
            <span className="font-bold text-emerald-700">{data.clientsServedCount}</span>
          </div>
        )}
        {data.authorizedReceiptsUSD !== undefined && data.authorizedReceiptsUSD > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Recettes Caisse USD</span>
            <span className="font-bold text-emerald-700">${data.authorizedReceiptsUSD.toLocaleString('fr-FR')}</span>
          </div>
        )}
        {data.authorizedReceiptsCDF !== undefined && data.authorizedReceiptsCDF > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Recettes Caisse CDF</span>
            <span className="font-bold text-blue-700">{data.authorizedReceiptsCDF.toLocaleString('fr-FR')} CDF</span>
          </div>
        )}
        {data.exchangeOperationsCount !== undefined && data.exchangeOperationsCount > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Opérations de Change</span>
            <span className="font-bold text-slate-900">{data.exchangeOperationsCount}</span>
          </div>
        )}
        {data.exchangeVolumeUSD !== undefined && data.exchangeVolumeUSD > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Volume Change USD</span>
            <span className="font-bold text-emerald-700">${data.exchangeVolumeUSD.toLocaleString('fr-FR')}</span>
          </div>
        )}
        {data.exchangeVolumeCDF !== undefined && data.exchangeVolumeCDF > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Volume Change CDF</span>
            <span className="font-bold text-blue-700">{data.exchangeVolumeCDF.toLocaleString('fr-FR')} CDF</span>
          </div>
        )}
        {data.accountingPeriodName && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Période Comptable</span>
            <span className="font-bold text-purple-800">{data.accountingPeriodName}</span>
          </div>
        )}
        {data.reconciliationsDoneCount !== undefined && data.reconciliationsDoneCount > 0 && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Rapprochements</span>
            <span className="font-bold text-purple-800">{data.reconciliationsDoneCount}</span>
          </div>
        )}
        {data.assignedMissionTitle && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Mission Terrain</span>
            <span className="font-bold text-rose-800">{data.assignedMissionTitle}</span>
          </div>
        )}
        {data.interventionLocation && (
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <span className="text-[10px] text-slate-400 block">Lieu intervention</span>
            <span className="font-bold text-slate-900">{data.interventionLocation}</span>
          </div>
        )}
      </div>

      {data.cashDiscrepancyReason && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200">
          <span className="font-bold">Justification écarts de caisse : </span>
          <span>{data.cashDiscrepancyReason}</span>
        </div>
      )}

      {data.tellerAnomaliesNotes && (
        <div className="rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
          <span className="font-bold">Anomalies de guichet : </span>
          <span>{data.tellerAnomaliesNotes}</span>
        </div>
      )}
    </div>
  );
}
