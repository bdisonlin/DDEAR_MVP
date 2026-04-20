import { simApi } from './client'
import type {
  BaselineSummary, AssetTypeInfo, SimulationResponse,
  TariffConfig, FinancialConfig, Asset, Insight,
  MonthlyBillRequest, MonthlyBillSummary,
} from '@/types'

export const generateSample = (peak_kw: number, year: number) =>
  simApi.post<BaselineSummary>('/baseline/sample', { peak_kw, year })

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
