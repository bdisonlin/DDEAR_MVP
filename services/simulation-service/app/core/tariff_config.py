"""
Configurable tariff parameter tables for Taiwan Taipower (台電).
All monetary values in NT$. Update these tables via tariff_data.json.
"""
import json
import os
from typing import Literal

VoltageLevel = Literal["low", "high"]

# Load JSON configuration
_config_path = os.path.join(os.path.dirname(__file__), "tariff_data.json")
with open(_config_path, "r", encoding="utf-8") as f:
    TARIFF_DATA = json.load(f)

# ── Exporting variables for backward-compatibility while we migrate ──
HV_TOU = TARIFF_DATA["tou"]["high"]
LV_COM_TOU = TARIFF_DATA["tou"]["low"]
RES_TIERS = TARIFF_DATA["progressive"]
HV_DEMAND_CHARGE_PER_KW = TARIFF_DATA["demand_charges"]["high"]
LV_COM_DEMAND_CHARGE_PER_KW = TARIFF_DATA["demand_charges"]["low"]

# Penalties
DEMAND_PENALTY_WITHIN_10PCT = TARIFF_DATA["penalties"]["demand_within_10pct"]
DEMAND_PENALTY_OVER_10PCT = TARIFF_DATA["penalties"]["demand_over_10pct"]
RES_TOU_EXCESS_THRESHOLD_KWH = TARIFF_DATA["penalties"]["res_tou_excess_threshold"]
RES_TOU_EXCESS_RATE_NTD_PER_KWH = TARIFF_DATA["penalties"]["res_tou_excess_rate"]

# Constants unaffected by general tariff changes
CARBON_FACTOR_KG_PER_KWH = 0.494
RE_FEED_IN_TARIFF_NTD_PER_KWH = 4.0


def _parse_month_day(date_str: str) -> tuple[int, int]:
    m, d = date_str.split("-")
    return int(m), int(d)

def _is_within_summer_range(month: int, day: int, start_m: int, start_d: int, end_m: int, end_d: int) -> bool:
    if month < start_m or month > end_m:
        return False
    if month == start_m and day < start_d:
        return False
    if month == end_m and day > end_d:
        return False
    return True

def is_summer(month: int, day: int, voltage: VoltageLevel) -> bool:
    v_key = voltage if voltage in TARIFF_DATA["seasons"] else "low"
    season = TARIFF_DATA["seasons"][v_key]
    start_m, start_d = _parse_month_day(season["summer_start"])
    end_m, end_d = _parse_month_day(season["summer_end"])
    return _is_within_summer_range(month, day, start_m, start_d, end_m, end_d)

def is_summer_vec(month, day, voltage: VoltageLevel):
    import numpy as np
    v_key = voltage if voltage in TARIFF_DATA["seasons"] else "low"
    season = TARIFF_DATA["seasons"][v_key]
    start_m, start_d = _parse_month_day(season["summer_start"])
    end_m, end_d = _parse_month_day(season["summer_end"])
    
    cond_start = (month > start_m) | ((month == start_m) & (day >= start_d))
    cond_end = (month < end_m) | ((month == end_m) & (day <= end_d))
    return cond_start & cond_end

def calc_demand_penalty(peak_kw: float, contracted_kw: float, demand_charge_per_kw: float) -> float:
    if contracted_kw <= 0 or peak_kw <= contracted_kw:
        return 0.0
    excess = peak_kw - contracted_kw
    threshold = contracted_kw * 0.10
    if excess <= threshold:
        return excess * demand_charge_per_kw * DEMAND_PENALTY_WITHIN_10PCT
    return (threshold * demand_charge_per_kw * DEMAND_PENALTY_WITHIN_10PCT +
            (excess - threshold) * demand_charge_per_kw * DEMAND_PENALTY_OVER_10PCT)

def calc_res_tou_excess(monthly_kwh: float, bill_type: str) -> float:
    if bill_type in ("res_2tier", "res_3tier"):
        over = monthly_kwh - RES_TOU_EXCESS_THRESHOLD_KWH
        if over > 0:
            return over * RES_TOU_EXCESS_RATE_NTD_PER_KWH
    return 0.0
