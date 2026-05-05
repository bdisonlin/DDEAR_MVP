export interface BaselineSummary {
  data_id: string
  peak_kw: number
  avg_kw: number
  total_kwh: number
  annual_cost_ntd: number
  date_start: string
  date_end: string
  num_intervals: number
}

export type VoltageLevel = 'low' | 'high'

export interface TariffConfig {
  voltage: VoltageLevel
  contracted_kw?: number | null
  summer_peak: number
  summer_semi_peak: number
  summer_off_peak: number
  non_summer_peak: number
  non_summer_semi_peak: number
  non_summer_off_peak: number
  demand_charge: number
}

export interface FinancialConfig {
  discount_rate: number
  project_years: number
}

export interface AssetParams {
  capacity_kw: number
  capex_ntd: number
  annual_om_ntd: number
  capacity_factor?: number
  efficiency_gain?: number
  capacity_kwh?: number
  power_kw?: number
  efficiency?: number
  num_chargers?: number
  charger_kw?: number
  smart_charging?: boolean
  electrical_efficiency?: number
  gas_price_ntd_per_kwh_fuel?: number
  // PPA contract parameters
  transfer_ratio?: number        // P_mi 轉供比例 0–1
  monthly_cap_kwh?: number       // M_ni 月度上限
  annual_cap_kwh?: number        // Y_ni 年度上限
}

export interface Asset {
  id: string
  name: string
  type: string
  params: AssetParams
  color: string
  label: string
}

export interface AssetTypeInfo {
  type: string
  label: string
  unit: string
  color: string
  capex_hint_ntd_per_unit: number
  default_capacity: number
}

export interface KpiResult {
  baseline_annual_cost: number
  scenario_annual_cost: number
  annual_savings: number
  savings_pct: number
  re_ratio: number
  re_kwh: number
  export_kwh: number
  export_revenue: number
  baseline_carbon_tons: number
  scenario_carbon_tons: number
  carbon_reduction_tons: number
  carbon_reduction_pct: number
  total_capex: number
  total_annual_om: number
  baseline_load_kwh: number
  net_load_kwh: number
  demand_penalty_annual_ntd: number
  res_tou_excess_annual_ntd: number
  storage_price_spread_ntd_per_kwh: number
  annual_fuel_cost_ntd: number
}

export interface MonthlyRow {
  month: string
  baseline_cost: number
  scenario_cost: number
  savings: number
  savings_pct: number
  re_ratio: number
  peak_demand_kw: number
  total_kwh: number
  peak_kwh: number
  semi_kwh: number
  offpeak_kwh: number
  demand_penalty_ntd: number
  res_tou_excess_ntd: number
}

export interface RoiResult {
  payback_years: number | null
  npv: number
  irr: number | null
  net_annual_benefit: number
  cash_flows: number[]
  cumulative_cash_flows: number[]
}

export interface LoadChartPoint {
  ts: string
  baseline_kw: number
  scenario_kw: number
  re_gen_kw: number
}

export interface HeatmapCell {
  month: number   // 1–12
  hour: number    // 0–23
  baseline_kw: number
  scenario_kw: number
}

export interface SimulationResponse {
  kpis: KpiResult
  monthly: MonthlyRow[]
  roi: RoiResult
  load_chart: LoadChartPoint[]
  load_heatmap: HeatmapCell[]
  load_chart_by_month: Record<string, LoadChartPoint[]>
  asset_ids: string[]
}

export interface Insight {
  type: 'success' | 'warning' | 'info' | 'tip'
  title: string
  body: string
  metric?: string
}

// ── Monthly Bill Upload ───────────────────────────────────────────────────────

export type BillType = 'tiered' | 'res_2tier' | 'res_3tier' | 'com_2tier' | 'com_3tier'

export interface BillRow {
  month: number
  // tiered
  kwh: string
  // TOU period kWh
  peak_kwh: string
  semi_kwh: string
  sat_kwh: string
  offpeak_kwh: string
  // demand + RE
  peak_kw: string
  re_kwh: string
  re_peak_kwh: string
  re_semi_kwh: string
  re_sat_kwh: string
  re_offpeak_kwh: string
}

export interface ReSourceConfig {
  source_type: ReSourceType
  capacity_kw: number                    // PPA contracted capacity; proportion derived by backend via CF
  ppa_rate_ntd_per_kwh: number | null
}

// UI draft (string inputs for controlled form fields)
export interface ReSourceConfigDraft {
  source_type: ReSourceType
  capacity_kw: string          // "500" kW
  ppa_rate: string             // "3.50" NT$/kWh, empty = not set
}

export interface MonthlyBillRequestRow {
  month: number
  kwh?: number
  peak_kwh?: number
  semi_kwh?: number
  sat_kwh?: number
  offpeak_kwh?: number
  peak_kw?: number
  re_kwh?: number
  re_peak_kwh?: number
  re_semi_kwh?: number
  re_sat_kwh?: number
  re_offpeak_kwh?: number
}

export type ReSourceType = 'solar_pv' | 'onshore_wind' | 'offshore_wind' | 'biomass'

export type IndustryType =
  | 'office_commercial'
  | 'heavy_industry'
  | 'semiconductor'
  | 'cold_chain'
  | 'retail'

export interface MonthlyBillRequest {
  year: number
  bill_type: BillType
  voltage: VoltageLevel
  contracted_kw?: number | null
  re_source_type?: ReSourceType          // legacy single-source
  re_source_configs?: ReSourceConfig[]  // multi-source: capacity_kw + PPA; proportions derived by backend
  industry_type: IndustryType
  use_industry_shape: boolean
  rows: MonthlyBillRequestRow[]
}

export interface MonthlyBillSummary extends BaselineSummary {
  re_kwh: number
  suggested_re_capacity_kw: number
  re_period_breakdown?: Record<string, number>
  annual_ppa_cost_ntd?: number
}

// ── Demand Response ────────────────────────────────────────────────────────────

export type DRProgram =
  | 'planned_monthly'
  | 'planned_daily'
  | 'rt_guaranteed'
  | 'rt_flexible'
  | 'bid_economic'
  | 'bid_reliable'

export type DRNotification = 'day_ahead' | 'same_day_2h' | 'same_day_1h'

export interface DRConfig {
  program: DRProgram
  contracted_kw: number
  bid_price_ntd_per_kwh: number
  event_duration_hours: number
  notification_type: DRNotification
  peak_hours: number[]
}

export interface MonthlyDRRow {
  month: string
  cbl_kw: number
  actual_reduction_kw: number
  execution_rate: number
  discount_rate: number
  events: number
  flow_revenue: number
  basic_fee_discount: number
  penalty: number
  net_revenue: number
}

export interface DRSettlement {
  program: DRProgram
  program_label: string
  contracted_kw: number
  bid_price: number
  cbl_kw: number
  avg_actual_reduction_kw: number
  avg_execution_rate: number
  total_events_per_year: number
  total_event_hours: number
  annual_flow_revenue: number
  annual_basic_fee_discount: number
  annual_penalty: number
  annual_net_revenue: number
  has_penalty: boolean
  notification_type: DRNotification
  avg_discount_rate: number
  monthly: MonthlyDRRow[]
}
