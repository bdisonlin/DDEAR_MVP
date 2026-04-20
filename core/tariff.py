"""
台電高壓時間電價 (High Voltage TOU Tariff Model)
Approximate 2024 rates for TPC high-voltage TOU customers.
"""
import numpy as np
import pandas as pd

# NT$/kWh — 台電高壓時間電價 (2024 approximate)
TARIFF_RATES = {
    "summer": {"peak": 6.07, "semi_peak": 3.29, "off_peak": 1.56},
    "non_summer": {"peak": 4.27, "semi_peak": 2.49, "off_peak": 1.56},
}
DEMAND_CHARGE_NTD_PER_KW = 290.6   # 基本電費 NT$/kW/月
CARBON_FACTOR_KG_PER_KWH = 0.494   # kg CO₂e/kWh (MOEA 2023)
RE_FEED_IN_TARIFF = 4.0            # 餘電售回 NT$/kWh (green power)


def _tou_periods(index: pd.DatetimeIndex) -> np.ndarray:
    """Vectorised TOU period classification."""
    hour = index.hour + index.minute / 60.0
    month = index.month
    weekday = index.weekday  # 0=Mon … 6=Sun

    is_summer = np.isin(month, [6, 7, 8, 9])
    is_weekday = weekday < 5
    is_saturday = weekday == 5

    peak_hours = ((hour >= 10) & (hour < 12)) | ((hour >= 13) & (hour < 17))
    semi_hours_wd = (
        ((hour >= 7.5) & (hour < 10))
        | ((hour >= 12) & (hour < 13))
        | ((hour >= 17) & (hour < 22.5))
    )

    is_peak = is_weekday & peak_hours
    is_semi = (is_weekday & semi_hours_wd) | (is_summer & is_saturday & (hour >= 7.5) & (hour < 22.5))

    return np.where(is_peak, "peak", np.where(is_semi, "semi_peak", "off_peak"))


def calculate_electricity_cost(
    load_kw: pd.Series,
    tariff_rates=None,
    demand_charge=None,
) -> pd.DataFrame:
    """
    Calculate monthly electricity cost from 15-min interval load data (kW).
    Returns DataFrame indexed by Month with cost breakdown columns.
    """
    if tariff_rates is None:
        tariff_rates = TARIFF_RATES
    if demand_charge is None:
        demand_charge = DEMAND_CHARGE_NTD_PER_KW

    df = pd.DataFrame({"load_kw": load_kw})
    df["season"] = np.where(np.isin(df.index.month, [6, 7, 8, 9]), "summer", "non_summer")
    df["tou"] = _tou_periods(df.index)

    peak_r = df.apply(lambda r: tariff_rates[r["season"]][r["tou"]], axis=1)
    df["energy_cost"] = df["load_kw"] * 0.25 * peak_r  # kWh × rate

    monthly = df.groupby(df.index.to_period("M")).agg(
        energy_cost=("energy_cost", "sum"),
        peak_demand_kw=("load_kw", "max"),
        total_kwh=("load_kw", lambda x: x.sum() * 0.25),
        peak_kwh=("load_kw", lambda x: (x[df.loc[x.index, "tou"] == "peak"]).sum() * 0.25),
        semi_kwh=("load_kw", lambda x: (x[df.loc[x.index, "tou"] == "semi_peak"]).sum() * 0.25),
        offpeak_kwh=("load_kw", lambda x: (x[df.loc[x.index, "tou"] == "off_peak"]).sum() * 0.25),
    )
    monthly["demand_cost"] = monthly["peak_demand_kw"] * demand_charge
    monthly["total_cost"] = monthly["energy_cost"] + monthly["demand_cost"]
    return monthly
