"""Digital Twin Simulation Engine."""
import numpy as np
import pandas as pd
from typing import Optional

from .tariff import calculate_electricity_cost
from .tariff_config import (
    CARBON_FACTOR_KG_PER_KWH,
    RE_FEED_IN_TARIFF_NTD_PER_KWH,
    VoltageLevel,
)

# Legacy alias
RE_FEED_IN_TARIFF = RE_FEED_IN_TARIFF_NTD_PER_KWH


def _apply_storage(load_kw, index, capacity_kwh, power_kw, efficiency=0.92):
    net = load_kw.copy()
    soc = capacity_kwh * 0.5
    dt  = 0.25
    hour    = index.hour
    weekday = index.weekday
    total_discharge_kwh = 0.0
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
            total_discharge_kwh += discharge
        net[i] = max(0, net[i])
    return net, total_discharge_kwh


def simulate_scenario(
    baseline_load:  pd.Series,
    assets:         list,
    tariff_rates:   Optional[dict] = None,
    demand_charge:  Optional[float] = None,
    voltage:        VoltageLevel = "high",
    contracted_kw:  Optional[float] = None,
    bill_type:      str = "tiered",
):
    from .tariff_config import HV_TOU, HV_DEMAND_CHARGE_PER_KW
    if tariff_rates  is None: tariff_rates  = HV_TOU
    if demand_charge is None: demand_charge = HV_DEMAND_CHARGE_PER_KW

    net_load      = baseline_load.copy()
    re_generation = pd.Series(0.0, index=baseline_load.index)
    total_capex      = 0.0
    total_annual_om  = 0.0
    export_kwh       = 0.0
    has_storage      = False
    storage_shifted_kwh = 0.0

    for asset in assets:
        atype   = asset["type"]
        profile = asset.get("profile", pd.Series(0.0, index=baseline_load.index))
        total_capex     += asset.get("capex_ntd", 0.0)
        total_annual_om += asset.get("annual_om_ntd", 0.0)

        if atype in ("solar_self", "solar_purchase", "wind", "hydro"):
            export = np.maximum(profile.values - net_load.values, 0.0)
            export_kwh += float(export.sum()) * 0.25
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
            has_storage = True
            params = asset.get("params", {})
            net_vals, shifted_kwh = _apply_storage(
                net_load.values, baseline_load.index,
                capacity_kwh=params.get("capacity_kwh", 500),
                power_kw=params.get("power_kw", 250),
                efficiency=params.get("efficiency", 0.92),
            )
            net_load = pd.Series(net_vals, index=baseline_load.index)
            storage_shifted_kwh += shifted_kwh
        elif atype == "ev":
            net_load = net_load + profile

    cost_kwargs = dict(
        tariff_rates=tariff_rates,
        demand_charge=demand_charge,
        voltage=voltage,
        contracted_kw=contracted_kw,
        bill_type=bill_type,
    )
    baseline_monthly = calculate_electricity_cost(baseline_load, **cost_kwargs)
    scenario_monthly = calculate_electricity_cost(net_load,      **cost_kwargs)
    export_revenue   = export_kwh * RE_FEED_IN_TARIFF

    total_load_kwh    = float(baseline_load.sum()) * 0.25
    re_kwh            = float(re_generation.sum()) * 0.25
    re_consumed_kwh   = max(re_kwh - export_kwh, 0.0)
    re_ratio          = min(re_consumed_kwh / total_load_kwh, 1.0) if total_load_kwh > 0 else 0.0
    net_load_kwh      = float(net_load.sum()) * 0.25

    _re_consumed_ts = pd.Series(
        np.minimum(re_generation.values, baseline_load.values),
        index=baseline_load.index,
    )
    _period = baseline_load.index.to_period("M")
    _monthly_re_consumed  = _re_consumed_ts.groupby(_period).sum() * 0.25
    _monthly_baseline_kwh = baseline_load.groupby(_period).sum() * 0.25
    monthly_re_ratio = (_monthly_re_consumed / _monthly_baseline_kwh.clip(lower=1e-9)).clip(upper=1.0)

    baseline_annual = float(baseline_monthly["total_cost"].sum())
    scenario_annual = float(scenario_monthly["total_cost"].sum()) - export_revenue

    # Storage price-spread arbitrage potential
    storage_price_spread = 0.0
    storage_arbitrage_revenue = 0.0
    if has_storage:
        sp  = tariff_rates.get("summer", {}).get("peak",     0.0)
        sop = tariff_rates.get("summer", {}).get("off_peak", 0.0)
        storage_price_spread = max(sp - sop, 0.0)
        storage_arbitrage_revenue = storage_shifted_kwh * storage_price_spread

    demand_penalty_annual = float(scenario_monthly["demand_penalty"].sum())
    demand_penalty_warning = demand_penalty_annual > 0

    return {
        "baseline_monthly":   baseline_monthly,
        "scenario_monthly":   scenario_monthly,
        "net_load":           net_load,
        "re_generation":      re_generation,
        "re_ratio":           re_ratio,
        "re_kwh":             re_kwh,
        "export_kwh":         export_kwh,
        "export_revenue":     export_revenue,
        "baseline_annual_cost": baseline_annual,
        "scenario_annual_cost": scenario_annual,
        "annual_savings":     baseline_annual - scenario_annual,
        "baseline_carbon_tons": total_load_kwh * CARBON_FACTOR_KG_PER_KWH / 1000,
        "scenario_carbon_tons": net_load_kwh   * CARBON_FACTOR_KG_PER_KWH / 1000,
        "carbon_reduction_tons": (total_load_kwh - net_load_kwh) * CARBON_FACTOR_KG_PER_KWH / 1000,
        "total_capex":        total_capex,
        "total_annual_om":    total_annual_om,
        "baseline_load_kwh":  total_load_kwh,
        "net_load_kwh":       net_load_kwh,
        "monthly_re_ratio":   monthly_re_ratio,
        "storage_price_spread": storage_price_spread,
        "storage_arbitrage_revenue": storage_arbitrage_revenue,
        "demand_penalty_annual": demand_penalty_annual,
        "demand_penalty_warning": demand_penalty_warning,
        "res_tou_excess_annual": float(scenario_monthly["res_tou_excess"].sum()),
    }
