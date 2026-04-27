from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class ScenarioIn(BaseModel):
    id: str
    label: str
    load_profile: list[float] = Field(..., min_length=24, max_length=24)
    peak_kw: float
    existing_gen_kw: float = 0.0
    gen_paralleled: bool = False
    existing_solar_kw: Optional[float] = None


class EnergyParamsOut(BaseModel):
    self_solar: float
    solar_ppa: float
    wind_ppa: float
    hydro_ppa: float
    natgas: float
    sofc: float
    bess: float


class HourlyDataOut(BaseModel):
    hour: int
    existing_gen: float
    existing_solar: float
    bess: float
    self_solar: float
    solar_ppa: float
    wind_ppa: float
    hydro_ppa: float
    sofc: float
    natgas: float
    grid: float


class KPIsOut(BaseModel):
    capex: float
    dr_revenue: float
    cfe_rate: float
    carbon: float


class DRScoreOut(BaseModel):
    dr_id: str
    dr_label: str
    dr_label_sub: str
    dr_start: int
    dr_end: int
    rate_multiplier: float
    events_per_year: int
    score: float
    value_label: str
    load_pct: int
    params: EnergyParamsOut
    hourly_data: list[HourlyDataOut]
    kpis: KPIsOut
    ai_text: str


class StrategyRequest(BaseModel):
    scenario: ScenarioIn
    objective: Literal['costMin', 'esg', 'lowCarbon']


class StrategyResponse(BaseModel):
    scores: list[DRScoreOut]
    objective: str
    scenario_id: str
