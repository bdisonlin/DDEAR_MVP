from typing import Optional, Literal
from pydantic import BaseModel, Field
from app.schemas.simulation import BaselineSummary

BillType = Literal[
    "tiered",         # 累進計價 — total kWh only
    "res_2tier",      # 住商簡易二段式 — 尖峰 + 離峰
    "res_3tier",      # 住商簡易三段式 — 尖峰 + 半尖峰 + 離峰
    "com_2tier",      # 商用二段式     — 尖峰 + 週六半尖峰 + 離峰
    "com_3tier",      # 商用三段式     — 尖峰 + 半尖峰 + 週六半尖峰 + 離峰
]

VoltageLevel = Literal["low", "high"]

# solar_pv:      台灣屋頂/地面型，日間（08–17）bell curve，夜間為零
# onshore_wind:  陸域風電，全天，清晨/深夜略高
# offshore_wind: 離岸風電，台灣海峽東北季風，全天穩定，夜間略高，CF 較高
# biomass:       生質能，可調度，全天近似穩定基載
ReSourceType = Literal["solar_pv", "onshore_wind", "offshore_wind", "biomass"]

# 產業別負載形狀選擇
IndustryType = Literal[
    "office_commercial",
    "heavy_industry",
    "semiconductor",
    "cold_chain",
    "retail",
]


class ReSourceConfig(BaseModel):
    """One RE source in the user's portfolio, defined at request level.
    The proportion of total re_kwh attributed to this source is derived by the
    backend from capacity_kw × CF (capacity factor), so users never input proportions.
    """
    source_type: ReSourceType
    capacity_kw: float = Field(..., gt=0)            # PPA contracted capacity
    ppa_rate_ntd_per_kwh: Optional[float] = Field(None, ge=0)


class MonthlyRow(BaseModel):
    month: int = Field(..., ge=1, le=12)

    # ── 累進計價 / fallback total ──────────────────────────────────────────────
    kwh: Optional[float] = Field(None, ge=0)

    # ── TOU period kWh ────────────────────────────────────────────────────────
    peak_kwh:    Optional[float] = Field(None, ge=0)
    semi_kwh:    Optional[float] = Field(None, ge=0)
    sat_kwh:     Optional[float] = Field(None, ge=0)
    offpeak_kwh: Optional[float] = Field(None, ge=0)

    # ── Demand & RE ───────────────────────────────────────────────────────────
    peak_kw: Optional[float] = Field(None, gt=0)   # 契約容量 kW (per-row override)

    re_kwh:         Optional[float] = Field(None, ge=0)
    re_peak_kwh:    Optional[float] = Field(None, ge=0)
    re_semi_kwh:    Optional[float] = Field(None, ge=0)
    re_sat_kwh:     Optional[float] = Field(None, ge=0)
    re_offpeak_kwh: Optional[float] = Field(None, ge=0)

    @property
    def total_kwh(self) -> float:
        if self.kwh is not None:
            return self.kwh
        return sum(v for v in [
            self.peak_kwh, self.semi_kwh, self.sat_kwh, self.offpeak_kwh
        ] if v is not None)

    @property
    def total_re_kwh(self) -> float:
        if self.re_kwh is not None:
            return self.re_kwh
        return sum(v for v in [
            self.re_peak_kwh, self.re_semi_kwh, self.re_sat_kwh, self.re_offpeak_kwh
        ] if v is not None)


class MonthlyBillRequest(BaseModel):
    year:           int          = Field(2024, ge=2015, le=2035)
    bill_type:      BillType     = "tiered"
    voltage:        VoltageLevel = "high"
    contracted_kw:  Optional[float]       = Field(None, gt=0)
    re_source_type:    Optional[ReSourceType] = None  # legacy single-source
    re_source_configs: list[ReSourceConfig] = []    # multi-source: capacity_kw + PPA per type
    industry_type:       IndustryType = "office_commercial"
    use_industry_shape:  bool         = False
    rows:                list[MonthlyRow] = Field(..., min_length=1, max_length=12)


class MonthlyBillSummary(BaselineSummary):
    re_kwh:                   float = 0.0
    suggested_re_capacity_kw: float = 0.0
    re_period_breakdown: Optional[dict[str, float]] = None
    annual_ppa_cost_ntd:      float = 0.0
