"""
Configurable tariff parameter tables for Taiwan Taipower (台電).
All monetary values in NT$. Update these tables when Taipower adjusts rates.
"""
from typing import Literal

VoltageLevel = Literal["low", "high"]


# ── Summer season definition ─────────────────────────────────────────────────
# Low voltage (住宅 / 小商家): June 1 – September 30
# High / extra-high voltage:  May 16 – October 15

def is_summer(month: int, day: int, voltage: VoltageLevel) -> bool:
    """Return True if the date falls within the summer billing period."""
    if voltage == "high":
        if month == 5:  return day >= 16
        if month == 10: return day <= 15
        return 6 <= month <= 9
    return 6 <= month <= 9


def is_summer_vec(month, day, voltage: VoltageLevel):
    """Vectorised version for numpy arrays."""
    import numpy as np
    if voltage == "high":
        return (
            ((month == 5) & (day >= 16)) |
            (np.isin(month, [6, 7, 8, 9])) |
            ((month == 10) & (day <= 15))
        )
    return np.isin(month, [6, 7, 8, 9])


# ── High-voltage TOU rates (台電高壓三段式時間電價, 2024) ──────────────────────
# 非夏月無尖峰，峰值設 0 表示不適用
HV_TOU = {
    "summer":     {"peak": 9.39, "semi_peak": 4.15, "off_peak": 2.53},
    "non_summer": {"peak": 0.0,  "semi_peak": 3.06, "off_peak": 1.88},
}
HV_DEMAND_CHARGE_PER_KW = 290.6   # NT$/kW/month 基本電費

# ── Low-voltage commercial TOU (台電低壓商業時間電價, 2024) ────────────────────
LV_COM_TOU = {
    "summer":     {"peak": 6.07, "semi_peak": 3.29, "off_peak": 1.56},
    "non_summer": {"peak": 0.0,  "semi_peak": 2.49, "off_peak": 1.56},
}
LV_COM_DEMAND_CHARGE_PER_KW = 180.0   # NT$/kW/month (approximate)

# ── Residential tiered rates (住宅累進電價, 2026) ─────────────────────────────
# (upper_kwh | None=unlimited, summer_rate, non_summer_rate)
RES_TIERS = [
    (120,  1.78, 1.78),
    (330,  2.89, 2.89),
    (500,  4.15, 4.15),
    (700,  5.03, 5.03),
    (1000, 6.41, 6.41),
    (None, 8.86, 7.69),
]

# ── Carbon & RE constants ─────────────────────────────────────────────────────
CARBON_FACTOR_KG_PER_KWH    = 0.494   # kg CO₂e/kWh (MOEA 2023)
RE_FEED_IN_TARIFF_NTD_PER_KWH = 4.0

# ── Demand penalty (超約罰款) ──────────────────────────────────────────────────
DEMAND_PENALTY_WITHIN_10PCT = 2.0   # ≤10% over contracted → 2× demand charge
DEMAND_PENALTY_OVER_10PCT   = 3.0   # >10% over contracted → 3× demand charge

# ── 住商簡易 TOU excess charge ─────────────────────────────────────────────────
RES_TOU_EXCESS_THRESHOLD_KWH     = 2000.0
RES_TOU_EXCESS_RATE_NTD_PER_KWH  = 1.04


def calc_demand_penalty(peak_kw: float, contracted_kw: float,
                        demand_charge_per_kw: float) -> float:
    """Return monthly demand penalty (NT$) for exceeding contracted capacity."""
    if contracted_kw <= 0 or peak_kw <= contracted_kw:
        return 0.0
    excess    = peak_kw - contracted_kw
    threshold = contracted_kw * 0.10
    if excess <= threshold:
        return excess * demand_charge_per_kw * DEMAND_PENALTY_WITHIN_10PCT
    return (threshold * demand_charge_per_kw * DEMAND_PENALTY_WITHIN_10PCT +
            (excess - threshold) * demand_charge_per_kw * DEMAND_PENALTY_OVER_10PCT)


def calc_res_tou_excess(monthly_kwh: float, bill_type: str) -> float:
    """Return monthly excess-usage penalty for 住商簡易 TOU (NT$)."""
    if bill_type in ("res_2tier", "res_3tier"):
        over = monthly_kwh - RES_TOU_EXCESS_THRESHOLD_KWH
        if over > 0:
            return over * RES_TOU_EXCESS_RATE_NTD_PER_KWH
    return 0.0
