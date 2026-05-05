import { create } from 'zustand'
import type {
  Asset, BaselineSummary, MonthlyBillSummary, SimulationResponse,
  TariffConfig, FinancialConfig, AssetTypeInfo, Insight,
  DRConfig, DRSettlement, ReSourceConfig,
} from '@/types'

export type AnyBaseline = BaselineSummary | MonthlyBillSummary

interface SandboxState {
  baseline: AnyBaseline | null
  setBaseline: (b: AnyBaseline | null) => void

  reSourceConfigs: ReSourceConfig[] | null
  setReSourceConfigs: (c: ReSourceConfig[] | null) => void

  assetTypes: AssetTypeInfo[]
  setAssetTypes: (types: AssetTypeInfo[]) => void

  assets: Asset[]
  addAsset: (asset: Asset) => void
  removeAsset: (id: string) => void
  clearAssets: () => void

  simResult: SimulationResponse | null
  setSimResult: (r: SimulationResponse | null) => void
  isSimulating: boolean
  setIsSimulating: (v: boolean) => void
  simError: string | null
  setSimError: (e: string | null) => void

  insights: Insight[]
  setInsights: (i: Insight[]) => void
  isLoadingInsights: boolean
  setIsLoadingInsights: (v: boolean) => void

  tariff: TariffConfig
  setTariff: (t: TariffConfig) => void
  financial: FinancialConfig
  setFinancial: (f: FinancialConfig) => void

  // Demand Response
  drConfig: DRConfig
  setDrConfig: (cfg: DRConfig) => void
  drResult: DRSettlement | null
  setDrResult: (r: DRSettlement | null) => void
  isDrSimulating: boolean
  setIsDrSimulating: (v: boolean) => void
  drError: string | null
  setDrError: (e: string | null) => void
}

const defaultTariff: TariffConfig = {
  voltage: 'high',
  contracted_kw: null,
  // High-voltage TOU defaults (台電高壓三段式, 2024)
  summer_peak: 9.39, summer_semi_peak: 4.15, summer_off_peak: 2.53,
  non_summer_peak: 0.0, non_summer_semi_peak: 3.06, non_summer_off_peak: 1.88,
  demand_charge: 290.6,
}

const defaultDrConfig: DRConfig = {
  program: 'rt_flexible',
  contracted_kw: 500,
  bid_price_ntd_per_kwh: 3.0,
  event_duration_hours: 2.0,
  notification_type: 'day_ahead',
  peak_hours: [13, 14, 15, 16, 17],
}

export const useSandboxStore = create<SandboxState>((set) => ({
  baseline: null,
  setBaseline: (b) => set({ baseline: b, assets: [], simResult: null, insights: [], drResult: null, reSourceConfigs: null }),

  reSourceConfigs: null,
  setReSourceConfigs: (c) => set({ reSourceConfigs: c }),

  assetTypes: [],
  setAssetTypes: (types) => set({ assetTypes: types }),

  assets: [],
  addAsset: (asset) => set((s) => ({ assets: [...s.assets, asset] })),
  removeAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),
  clearAssets: () => set({ assets: [], simResult: null, insights: [] }),

  simResult: null,
  setSimResult: (r) => set({ simResult: r }),
  isSimulating: false,
  setIsSimulating: (v) => set({ isSimulating: v }),
  simError: null,
  setSimError: (e) => set({ simError: e }),

  insights: [],
  setInsights: (i) => set({ insights: i }),
  isLoadingInsights: false,
  setIsLoadingInsights: (v) => set({ isLoadingInsights: v }),

  tariff: defaultTariff,
  setTariff: (t) => set({ tariff: t }),
  financial: { discount_rate: 0.05, project_years: 20 },
  setFinancial: (f) => set({ financial: f }),

  drConfig: defaultDrConfig,
  setDrConfig: (cfg) => set({ drConfig: cfg }),
  drResult: null,
  setDrResult: (r) => set({ drResult: r }),
  isDrSimulating: false,
  setIsDrSimulating: (v) => set({ isDrSimulating: v }),
  drError: null,
  setDrError: (e) => set({ drError: e }),
}))
