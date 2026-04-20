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
    year:          int          = Field(2024, ge=2015, le=2035)
    bill_type:     BillType     = "tiered"
    voltage:       VoltageLevel = "high"
    contracted_kw: Optional[float] = Field(None, gt=0)
    rows:          list[MonthlyRow] = Field(..., min_length=1, max_length=12)


class MonthlyBillSummary(BaselineSummary):
    re_kwh:                    float = 0.0
    suggested_re_capacity_kw:  float = 0.0
