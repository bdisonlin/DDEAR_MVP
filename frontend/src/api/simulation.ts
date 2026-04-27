import { simApi } from './client'
import type {
  BaselineSummary, AssetTypeInfo, SimulationResponse,
  TariffConfig, FinancialConfig, Asset, Insight,
  MonthlyBillRequest, MonthlyBillSummary,
} from '@/types'

export const generateSample = (peak_kw: number, year: number) =>
  simApi.post<BaselineSummary>('/baseline/sample', { peak_kw, year })

// Demo scenario: 1000kW factory with solar + BESS + wind PPA
export const DEMO_ASSETS: Asset[] = [
  {
    id: 'demo-solar', name: '屋頂太陽能 300kW', type: 'solar_self',
    color: '#FF9500', label: '☀️ 自發太陽能',
    params: { capacity_kw: 300, capex_ntd: 10_500_000, annual_om_ntd: 157_500 },
  },
  {
    id: 'demo-bess', name: '儲能系統 1000kWh', type: 'storage',
    color: '#34C759', label: '🔋 儲能 BESS',
    params: { capacity_kw: 500, capacity_kwh: 1000, power_kw: 500,
              efficiency: 0.90, capex_ntd: 8_000_000, annual_om_ntd: 120_000 },
  },
  {
    id: 'demo-wind', name: '風力 PPA 150kW', type: 'wind',
    color: '#5AC8FA', label: '💨 風力 PPA',
    params: { capacity_kw: 150, capacity_factor: 0.35,
              transfer_ratio: 1.0, capex_ntd: 0, annual_om_ntd: 1_620_000 },
  },
]

export const uploadBaseline = async (file: File): Promise<BaselineSummary> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/simulation/baseline/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const getAssetTypes = () =>
  simApi.get<AssetTypeInfo[]>('/assets')

export const runSimulation = (
  data_id: string,
  assets: Asset[],
  tariff: TariffConfig,
  financial: FinancialConfig,
): Promise<SimulationResponse> =>
  simApi.post<SimulationResponse>('/simulate', {
    data_id,
    assets: assets.map((a) => ({ id: a.id, name: a.name, type: a.type, params: a.params })),
    tariff_config: tariff,
    financial_config: financial,
  })

export const uploadMonthlyBill = (req: MonthlyBillRequest): Promise<MonthlyBillSummary> =>
  simApi.post<MonthlyBillSummary>('/baseline/monthly', req)

export const fetchInsights = (result: SimulationResponse, assetTypes: string[]): Promise<Insight[]> =>
  simApi.post<Insight[]>('/insights', {
    annual_savings: result.kpis.annual_savings,
    savings_pct: result.kpis.savings_pct,
    re_ratio: result.kpis.re_ratio,
    re_kwh: result.kpis.re_kwh,
    carbon_reduction_tons: result.kpis.carbon_reduction_tons,
    carbon_reduction_pct: result.kpis.carbon_reduction_pct,
    total_capex: result.kpis.total_capex,
    payback_years: result.roi.payback_years,
    npv: result.roi.npv,
    irr: result.roi.irr,
    net_load_kwh: result.kpis.net_load_kwh,
    baseline_load_kwh: result.kpis.baseline_load_kwh,
    export_kwh: result.kpis.export_kwh,
    asset_types: assetTypes,
  })
