"""Pydantic request/response schemas."""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────

class SampleBaselineRequest(BaseModel):
    peak_kw: float = Field(default=1000, ge=100, le=50000)
    year: int = Field(default=2024, ge=2020, le=2030)


class TariffConfig(BaseModel):
    voltage: str = "high"               # "low" | "high" — determines summer dates
    contracted_kw: Optional[float] = None   # for demand penalty calculation
    # NT$/kWh — high-voltage defaults (2024); user may override
    summer_peak: float = 9.39
    summer_semi_peak: float = 4.15
    summer_off_peak: float = 2.53
    non_summer_peak: float = 0.0        # 非夏月無尖峰
    non_summer_semi_peak: float = 3.06
    non_summer_off_peak: float = 1.88
    demand_charge: float = 290.6        # NT$/kW/month 基本電費


class FinancialConfig(BaseModel):
    discount_rate: float = Field(default=0.05, ge=0.01, le=0.30)
    project_years: int = Field(default=20, ge=5, le=40)


class AssetParams(BaseModel):
    capacity_kw: float = Field(default=100, ge=0)
    capex_ntd: float = Field(default=0, ge=0)
    annual_om_ntd: float = Field(default=0, ge=0)
    # solar
    # wind
    capacity_factor: Optional[float] = Field(default=None, ge=0.05, le=1.0)
    # hvac
    efficiency_gain: Optional[float] = Field(default=None, ge=0.01, le=0.5)
    # storage
    capacity_kwh: Optional[float] = Field(default=None, ge=10)
    power_kw: Optional[float] = Field(default=None, ge=10)
    efficiency: Optional[float] = Field(default=None, ge=0.7, le=0.99)
    # ev
    num_chargers: Optional[int] = Field(default=None, ge=1)
    charger_kw: Optional[float] = Field(default=None, ge=3)
    smart_charging: Optional[bool] = True
    # sofc / natgas
    electrical_efficiency: Optional[float] = Field(default=None, ge=0.25, le=0.75)
    gas_price_ntd_per_kwh_fuel: Optional[float] = Field(default=None, ge=0.1, le=10.0)
    # PPA / green power transfer contract (solar_purchase, wind, hydro)
    transfer_ratio: float = Field(default=1.0, ge=0.01, le=1.0)     # P_mi 轉供比例
    monthly_cap_kwh: Optional[float] = Field(default=None, ge=0)    # M_ni 月度上限
    annual_cap_kwh: Optional[float] = Field(default=None, ge=0)     # Y_ni 年度上限


class AssetRequest(BaseModel):
    id: str
    name: str
    type: str  # solar_self | solar_purchase | wind | hydro | hvac | storage | ev
    params: AssetParams


class SimulateRequest(BaseModel):
    data_id: str
    assets: list[AssetRequest] = []
    tariff_config: TariffConfig = TariffConfig()
    financial_config: FinancialConfig = FinancialConfig()


# ── Response models ────────────────────────────────────────────────────────────

class BaselineSummary(BaseModel):
    data_id: str
    peak_kw: float
    avg_kw: float
    total_kwh: float
    annual_cost_ntd: float
    date_start: str
    date_end: str
    num_intervals: int


class MonthlyRow(BaseModel):
    month: str
    baseline_cost: float
    scenario_cost: float
    savings: float
    savings_pct: float
    re_ratio: float
    peak_demand_kw: float
    total_kwh: float
    peak_kwh: float
    semi_kwh: float
    offpeak_kwh: float
    demand_penalty_ntd: float = 0.0
    res_tou_excess_ntd: float = 0.0


class KpiResult(BaseModel):
    baseline_annual_cost: float
    scenario_annual_cost: float
    annual_savings: float
    savings_pct: float
    re_ratio: float
    re_kwh: float
    export_kwh: float
    export_revenue: float
    baseline_carbon_tons: float
    scenario_carbon_tons: float
    carbon_reduction_tons: float
    carbon_reduction_pct: float
    total_capex: float
    total_annual_om: float
    baseline_load_kwh: float
    net_load_kwh: float
    # Penalty & arbitrage KPIs
    demand_penalty_annual_ntd: float = 0.0
    demand_penalty_warning: bool = False
    res_tou_excess_annual_ntd: float = 0.0
    storage_price_spread_ntd_per_kwh: float = 0.0
    storage_arbitrage_revenue_annual_ntd: float = 0.0
    # Dispatchable generation (SOFC / NG)
    annual_fuel_cost_ntd: float = 0.0


class RoiResult(BaseModel):
    payback_years: Optional[float]
    npv: float
    irr: Optional[float]
    net_annual_benefit: float
    cash_flows: list[float]
    cumulative_cash_flows: list[float]


class LoadChartPoint(BaseModel):
    ts: str
    baseline_kw: float
    scenario_kw: float
    re_gen_kw: float


class HeatmapCell(BaseModel):
    month: int   # 1–12
    hour: int    # 0–23
    baseline_kw: float
    scenario_kw: float


class SimulationResponse(BaseModel):
    kpis: KpiResult
    monthly: list[MonthlyRow]
    roi: RoiResult
    load_chart: list[LoadChartPoint]              # representative week (672 pts)
    load_heatmap: list[HeatmapCell]               # 12 × 24 = 288 cells
    load_chart_by_month: dict[str, list[LoadChartPoint]] = {}  # key = "1"–"12"
    asset_ids: list[str]


class AssetTypeInfo(BaseModel):
    type: str
    label: str
    unit: str
    color: str
    capex_hint_ntd_per_unit: float
    default_capacity: float
