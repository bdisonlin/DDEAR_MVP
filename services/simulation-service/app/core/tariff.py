"""
台電時間電價計費引擎 (Taipower TOU Billing Engine)
Supports voltage-aware summer definition, demand penalty, and res-TOU excess charge.
"""
import numpy as np
import pandas as pd
from typing import Optional

from .tariff_config import (
    VoltageLevel, is_summer_vec,
    HV_TOU, HV_DEMAND_CHARGE_PER_KW,
    CARBON_FACTOR_KG_PER_KWH, RE_FEED_IN_TARIFF_NTD_PER_KWH,
    calc_demand_penalty, calc_res_tou_excess,
)

# Legacy constants — kept for backward-compatibility with simulator.py imports
TARIFF_RATES = HV_TOU
DEMAND_CHARGE_NTD_PER_KW = HV_DEMAND_CHARGE_PER_KW
CARBON_FACTOR_KG_PER_KWH = CARBON_FACTOR_KG_PER_KWH
RE_FEED_IN_TARIFF = RE_FEED_IN_TARIFF_NTD_PER_KWH


def _tou_periods(index: pd.DatetimeIndex,
                 voltage: VoltageLevel = "high") -> np.ndarray:
    """
    Classify each 15-min interval into peak / semi_peak / off_peak.

    High-voltage time schedule (台電高壓三段式):
      Peak hours (summer weekdays only): 10:00-12:00, 13:00-17:00
      Semi-peak: weekday 07:30-10:00, 12:00-13:00, 17:00-22:30
                 + non-summer weekday peak slots (→ semi)
                 + summer Saturday 07:30-22:30
      Off-peak: everything else
    """
    hour    = index.hour + index.minute / 60.0
    month   = index.month
    day     = index.day
    weekday = index.weekday   # 0=Mon … 6=Sun

    summer     = is_summer_vec(month, day, voltage)
    is_weekday = weekday < 5
    is_saturday = weekday == 5

    # Peak billing hours (weekday daytime)
    peak_slot = ((hour >= 10) & (hour < 12)) | ((hour >= 13) & (hour < 17))
    # Semi-peak billing hours (weekday shoulders)
    semi_slot = (
        ((hour >= 7.5) & (hour < 10))
        | ((hour >= 12) & (hour < 13))
        | ((hour >= 17) & (hour < 22.5))
    )

    # Peak only exists in summer; non-summer peak slots reclassified as semi
    is_peak = is_weekday & peak_slot & summer
    is_semi = (
        (is_weekday & semi_slot)
        | (is_weekday & peak_slot & ~summer)       # non-summer: peak→semi
        | (is_saturday & summer & (hour >= 7.5) & (hour < 22.5))
    )

    return np.where(is_peak, "peak",
           np.where(is_semi, "semi_peak", "off_peak"))


def calculate_electricity_cost(
    load_kw:       pd.Series,
    tariff_rates:  Optional[dict] = None,
    demand_charge: Optional[float] = None,
    voltage:       VoltageLevel = "high",
    contracted_kw: Optional[float] = None,
    bill_type:     str = "tiered",
) -> pd.DataFrame:
    """
    Calculate monthly electricity cost from 15-min interval load data (kW).

    Returns DataFrame indexed by Month with columns:
      energy_cost, demand_cost, demand_penalty, res_tou_excess,
      total_cost, peak_demand_kw, total_kwh, peak_kwh, semi_kwh, offpeak_kwh
    """
    if tariff_rates is None:
        tariff_rates = HV_TOU
    if demand_charge is None:
        demand_charge = HV_DEMAND_CHARGE_PER_KW

    df = pd.DataFrame({"load_kw": load_kw})
    month_arr = df.index.month
    day_arr   = df.index.day

    df["season"] = np.where(is_summer_vec(month_arr, day_arr, voltage),
                            "summer", "non_summer")
    df["tou"] = _tou_periods(df.index, voltage)

    rate = df.apply(lambda r: tariff_rates[r["season"]][r["tou"]], axis=1)
    df["energy_cost"] = df["load_kw"] * 0.25 * rate

    period = df.index.to_period("M")

    monthly = df.groupby(period).agg(
        energy_cost    = ("energy_cost", "sum"),
        peak_demand_kw = ("load_kw",    "max"),
        total_kwh      = ("load_kw",    lambda x: x.sum() * 0.25),
        peak_kwh       = ("load_kw",    lambda x: (x[df.loc[x.index, "tou"] == "peak"]).sum() * 0.25),
        semi_kwh       = ("load_kw",    lambda x: (x[df.loc[x.index, "tou"] == "semi_peak"]).sum() * 0.25),
        offpeak_kwh    = ("load_kw",    lambda x: (x[df.loc[x.index, "tou"] == "off_peak"]).sum() * 0.25),
    )

    monthly["demand_cost"] = monthly["peak_demand_kw"] * demand_charge

    # Demand penalty (超約罰款)
    if contracted_kw and contracted_kw > 0:
        monthly["demand_penalty"] = monthly["peak_demand_kw"].apply(
            lambda pk: calc_demand_penalty(pk, contracted_kw, demand_charge)
        )
    else:
        monthly["demand_penalty"] = 0.0

    # 住商簡易 TOU excess charge (超 2,000 度加收)
    monthly["res_tou_excess"] = monthly["total_kwh"].apply(
        lambda kwh: calc_res_tou_excess(kwh, bill_type)
    )

    monthly["total_cost"] = (
        monthly["energy_cost"]
        + monthly["demand_cost"]
        + monthly["demand_penalty"]
        + monthly["res_tou_excess"]
    )

    return monthly
