"""
Digital Twin Simulation Engine
Applies stacked assets onto the baseline load and computes scenario metrics.
"""
import numpy as np
import pandas as pd
from .tariff import (
    calculate_electricity_cost,
    CARBON_FACTOR_KG_PER_KWH,
    RE_FEED_IN_TARIFF,
    TARIFF_RATES,
    DEMAND_CHARGE_NTD_PER_KW,
)


def _apply_storage_vectorised(load_kw, index,
                               capacity_kwh, power_kw,
                               efficiency=0.92):
    """
    Simple rule-based storage dispatch:
      - Charge 00:00-07:00 (off-peak)
      - Discharge 10:00-17:00 weekdays (peak)
    """
    net = load_kw.copy()
    soc = capacity_kwh * 0.5
    dt = 0.25  # 15-min

    hour = index.hour
    weekday = index.weekday

    for i in range(len(net)):
        h = hour[i]
        if 0 <= h < 7:
            charge = min(power_kw * dt, (capacity_kwh - soc) / efficiency)
            charge = max(0, charge)
            net[i] += charge
            soc += charge * efficiency
        elif 10 <= h < 17 and weekday[i] < 5:
            discharge = min(power_kw * dt, soc * efficiency)
            discharge = max(0, discharge)
            net[i] -= discharge
            soc -= discharge / efficiency
        net[i] = max(0, net[i])
    return net


def simulate_scenario(
    baseline_load,
    assets,
    tariff_rates=None,
    demand_charge=None,
):
    """
    Run a Digital Twin scenario with the stacked assets.

    Each asset dict must have:
      type        : str   (solar_self | solar_purchase | wind | hydro | hvac | storage | ev)
      profile     : pd.Series aligned to baseline_load.index   (kW)
      capex_ntd   : float
      annual_om_ntd : float
      params      : dict  (extra params, e.g. storage capacity)
    """
    if tariff_rates is None:
        tariff_rates = TARIFF_RATES
    if demand_charge is None:
        demand_charge = DEMAND_CHARGE_NTD_PER_KW

    net_load = baseline_load.copy()
    re_generation = pd.Series(0.0, index=baseline_load.index)
    total_capex = 0.0
    total_annual_om = 0.0
    export_kwh_total = 0.0

    for asset in assets:
        atype = asset["type"]
        profile: pd.Series = asset.get("profile", pd.Series(0.0, index=baseline_load.index))
        total_capex += asset.get("capex_ntd", 0.0)
        total_annual_om += asset.get("annual_om_ntd", 0.0)

        if atype in ("solar_self", "solar_purchase", "wind", "hydro"):
            consumed = np.minimum(net_load.values, profile.values)
            export = np.maximum(profile.values - net_load.values, 0.0)
            export_kwh_total += float(export.sum()) * 0.25
            net_load = pd.Series(
                np.maximum(net_load.values - profile.values, 0.0),
                index=baseline_load.index,
            )
            re_generation += profile

        elif atype == "hvac":
            net_load = pd.Series(
                np.maximum(net_load.values - profile.values, 0.0),
                index=baseline_load.index,
            )

        elif atype == "storage":
            params = asset.get("params", {})
            net_load = pd.Series(
                _apply_storage_vectorised(
                    net_load.values,
                    baseline_load.index,
                    capacity_kwh=params.get("capacity_kwh", 500),
                    power_kw=params.get("power_kw", 250),
                    efficiency=params.get("efficiency", 0.92),
                ),
                index=baseline_load.index,
            )

        elif atype == "ev":
            net_load = net_load + profile  # EV adds load

    # --- Cost calculations ---
    baseline_monthly = calculate_electricity_cost(baseline_load, tariff_rates, demand_charge)
    scenario_monthly = calculate_electricity_cost(net_load, tariff_rates, demand_charge)

    # Feed-in tariff revenue from exported RE
    export_revenue = export_kwh_total * RE_FEED_IN_TARIFF

    # RE ratio
    total_load_kwh = float(baseline_load.sum()) * 0.25
    re_kwh = float(re_generation.sum()) * 0.25
    re_ratio = min(re_kwh / total_load_kwh, 1.0) if total_load_kwh > 0 else 0.0

    # Carbon
    net_load_kwh = float(net_load.sum()) * 0.25
    baseline_carbon = total_load_kwh * CARBON_FACTOR_KG_PER_KWH / 1000
    scenario_carbon = net_load_kwh * CARBON_FACTOR_KG_PER_KWH / 1000

    baseline_annual = float(baseline_monthly["total_cost"].sum())
    scenario_annual = float(scenario_monthly["total_cost"].sum()) - export_revenue

    return {
        "baseline_monthly": baseline_monthly,
        "scenario_monthly": scenario_monthly,
        "net_load": net_load,
        "re_generation": re_generation,
        "re_ratio": re_ratio,
        "re_kwh": re_kwh,
        "export_kwh": export_kwh_total,
        "export_revenue": export_revenue,
        "baseline_annual_cost": baseline_annual,
        "scenario_annual_cost": scenario_annual,
        "annual_savings": baseline_annual - scenario_annual,
        "baseline_carbon_tons": baseline_carbon,
        "scenario_carbon_tons": scenario_carbon,
        "carbon_reduction_tons": baseline_carbon - scenario_carbon,
        "total_capex": total_capex,
        "total_annual_om": total_annual_om,
        "baseline_load_kwh": total_load_kwh,
        "net_load_kwh": net_load_kwh,
    }
