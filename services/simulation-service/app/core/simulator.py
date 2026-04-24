"""Digital Twin Simulation Engine."""
import numpy as np
import pandas as pd
from typing import Optional

from .tariff import calculate_electricity_cost, _tou_periods
from .tariff_config import (
    CARBON_FACTOR_KG_PER_KWH,
    RE_FEED_IN_TARIFF_NTD_PER_KWH,
    VoltageLevel,
)

# Natural gas: 56.1 tCO2/TJ = 0.2020 kg CO2/kWh_fuel (LHV, IPCC 2006)
_NATGAS_CO2_KG_PER_KWH_FUEL = 0.2020
_NATGAS_DEFAULT_GAS_PRICE    = 1.30   # NT$/kWh_fuel ≈ NT$13.7/m³ ÷ 10.55 kWh/m³

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


def _second_round_match(
    re_g_available:      pd.Series,
    baseline_load:       pd.Series,
    net_load_after_first: pd.Series,
    voltage:             VoltageLevel = "high",
) -> tuple[pd.Series, float]:
    """
    二次月結：第二階段跨時間點、同 TOU 時段餘電再媒合。

    B_tp  — 餘電量：G_available（含 transfer_ratio）超過基準負載的部分
    S_tp  — 剩餘需求：一次匹配後的 net_load
    QQ_tp = min(B_tp, S_tp)
    """
    index      = baseline_load.index
    tou_labels = _tou_periods(index, voltage)
    months     = index.to_period("M")

    # 餘電 = 含 ratio 的可用量超出負載的部分（不是原始物理發電）
    re_excess  = np.maximum(re_g_available.values - baseline_load.values, 0.0)
    rem_demand = net_load_after_first.values          # already ≥ 0 after first round

    second_round_kw = np.zeros(len(index))

    for month_period in months.unique():
        m_mask = np.asarray(months == month_period)
        for tp in ("peak", "semi_peak", "off_peak"):
            tp_mask = tou_labels == tp
            mask    = m_mask & tp_mask
            if not mask.any():
                continue

            # B_tp — 餘電量 (kWh)
            B_tp = float(re_excess[mask].sum()) * 0.25
            # S_tp — 剩餘需求 (kWh)
            S_tp = float(rem_demand[mask].sum()) * 0.25

            QQ_tp = min(B_tp, S_tp)
            if QQ_tp < 1e-9:
                continue

            # 二次分配：依各區間剩餘需求比例分回 kW
            deficit_kw = rem_demand[mask]
            denom = deficit_kw.sum()
            if denom < 1e-9:
                continue
            weights = deficit_kw / denom
            second_round_kw[mask] = (QQ_tp / 0.25) * weights   # kWh → kW

    total_second_round_kwh = float(second_round_kw.sum()) * 0.25
    return pd.Series(second_round_kw, index=index), total_second_round_kwh


def _apply_first_round_re(
    re_asset_data: list[dict],
    baseline_kw:   np.ndarray,
    index:         pd.DatetimeIndex,
) -> tuple[np.ndarray, np.ndarray]:
    """
    一次匹配 — 四公式實作（單一用電端情境）

    (1) G_mi = R_m × P_mi          發電端分配電量（含轉供比例）
    (2) U_ni = min(M_ni, Y_ni, C_ni) 用電端有效需求（含月度/年度上限）
               C_ni = baseline_load（單一用電端取得全部分配）
    (3) Q_t  = min(Σ G_ji, U_n_t)  契約總轉供量
    (4) q_mt = Q_t × (G_mt / Σ G_jt) 各資產分配量（比例分配）

    月/年上限以比例縮放（proportional scaling）方式向量化實現。
    當月實際轉供 > 上限時，等比例削減該月所有區間。

    Returns:
      Q_kw      — 每區間實際轉供量 (kW)，已套用上限
      G_display — 每區間 RE 物理發電總量 (kW)，供圖表顯示
    """
    n = len(baseline_kw)
    months = index.to_period("M")

    # (1) G_mi = R_m × P_mi；同時保留原始發電量供圖表
    G_each   = []   # shape (n,) per asset — 含 transfer ratio
    R_each   = []   # shape (n,) per asset — 原始發電（不含 ratio），供圖表
    for a in re_asset_data:
        R_m = a["profile"].values
        G_m = R_m * a["transfer_ratio"]
        G_each.append(G_m)
        R_each.append(R_m)

    G_total   = np.sum(G_each, axis=0)          # Σ G_ji per interval
    G_display = np.sum(R_each, axis=0)           # 物理發電（顯示用）

    # (2)+(3) U_n = baseline（無帽），Q_uncapped = min(Σ G, Load)
    Q_uncapped = np.minimum(G_total, baseline_kw)

    # Per-asset proportional share of Q_uncapped: q_m = Q × G_m / Σ G
    with np.errstate(divide="ignore", invalid="ignore"):
        G_safe = np.where(G_total > 1e-9, G_total, 1.0)

    Q_per_asset = np.zeros((n, len(re_asset_data)))
    for j, G_m in enumerate(G_each):
        Q_per_asset[:, j] = Q_uncapped * (G_m / G_safe)

    # Apply M_ni (月度上限) and Y_ni (年度上限) per asset — 比例縮放
    for j, a in enumerate(re_asset_data):
        # Monthly cap
        if a.get("monthly_cap_kwh"):
            cap = a["monthly_cap_kwh"]
            for month in months.unique():
                mask = np.asarray(months == month)
                actual_kwh = float(Q_per_asset[mask, j].sum()) * 0.25
                if actual_kwh > cap and actual_kwh > 1e-9:
                    Q_per_asset[mask, j] *= cap / actual_kwh

        # Annual cap
        if a.get("annual_cap_kwh"):
            cap = a["annual_cap_kwh"]
            actual_kwh = float(Q_per_asset[:, j].sum()) * 0.25
            if actual_kwh > cap and actual_kwh > 1e-9:
                Q_per_asset[:, j] *= cap / actual_kwh

    # (4) 加總各資產分配量 → 最終 Q_t
    Q_kw = Q_per_asset.sum(axis=1)
    # G_available = Σ R_m × P_m (post-transfer-ratio, pre-cap)；供二次月結計算餘電
    G_available = np.sum(G_each, axis=0)
    return Q_kw, G_display, G_available


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
    has_storage      = False
    storage_shifted_kwh  = 0.0
    total_fuel_cost_ntd  = 0.0
    total_combustion_co2_kg = 0.0

    # ── RE 資產：一次匹配（四公式） ────────────────────────────────────────────
    re_asset_data = []
    for asset in assets:
        if asset["type"] not in ("solar_self", "solar_purchase", "wind", "hydro"):
            continue
        profile = asset.get("profile", pd.Series(0.0, index=baseline_load.index))
        params  = asset.get("params", {})
        re_asset_data.append({
            "profile":        profile,
            "transfer_ratio": params.get("transfer_ratio", 1.0),
            "monthly_cap_kwh": params.get("monthly_cap_kwh"),
            "annual_cap_kwh":  params.get("annual_cap_kwh"),
        })
        total_capex     += asset.get("capex_ntd", 0.0)
        total_annual_om += asset.get("annual_om_ntd", 0.0)

    re_q_kw       = pd.Series(0.0, index=baseline_load.index)   # 實際轉供量（含 ratio+cap）
    re_g_avail_kw = pd.Series(0.0, index=baseline_load.index)   # 含 ratio 但未加帽，供二次月結

    if re_asset_data:
        Q_kw, G_display, G_available = _apply_first_round_re(
            re_asset_data, baseline_load.values, baseline_load.index
        )
        net_load       = pd.Series(
            np.maximum(baseline_load.values - Q_kw, 0.0), index=baseline_load.index
        )
        re_generation  = pd.Series(G_display,   index=baseline_load.index)
        re_q_kw        = pd.Series(Q_kw,        index=baseline_load.index)
        re_g_avail_kw  = pd.Series(G_available, index=baseline_load.index)

    # ── 非 RE 資產 ────────────────────────────────────────────────────────────
    for asset in assets:
        atype   = asset["type"]
        if atype in ("solar_self", "solar_purchase", "wind", "hydro"):
            continue   # already handled above
        profile = asset.get("profile", pd.Series(0.0, index=baseline_load.index))
        total_capex     += asset.get("capex_ntd", 0.0)
        total_annual_om += asset.get("annual_om_ntd", 0.0)

        if atype == "hvac":
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
        elif atype in ("sofc", "natgas"):
            # 可調度發電（化石燃料）：扣抵淨負載，超出部分棄電
            net_load = pd.Series(
                np.maximum(net_load.values - profile.values, 0.0),
                index=baseline_load.index,
            )
            params_a  = asset.get("params", {})
            eff       = params_a.get("electrical_efficiency",
                                     0.55 if atype == "sofc" else 0.38)
            gas_price = params_a.get("gas_price_ntd_per_kwh_fuel",
                                     _NATGAS_DEFAULT_GAS_PRICE)
            gen_kwh_a = float(profile.sum()) * 0.25
            fuel_kwh  = gen_kwh_a / max(eff, 0.01)
            total_fuel_cost_ntd     += fuel_kwh * gas_price
            total_combustion_co2_kg += fuel_kwh * _NATGAS_CO2_KG_PER_KWH_FUEL

    # ── 二次月結：同 TOU 時段餘電跨區間再媒合 ──────────────────────────────────
    if re_g_avail_kw.any():
        second_round_kw, second_round_kwh = _second_round_match(
            re_g_avail_kw, baseline_load, net_load, voltage
        )
        net_load = pd.Series(
            np.maximum(net_load.values - second_round_kw.values, 0.0),
            index=baseline_load.index,
        )
    else:
        second_round_kw  = pd.Series(0.0, index=baseline_load.index)
        second_round_kwh = 0.0

    cost_kwargs = dict(
        tariff_rates=tariff_rates,
        demand_charge=demand_charge,
        voltage=voltage,
        contracted_kw=contracted_kw,
        bill_type=bill_type,
    )
    baseline_monthly = calculate_electricity_cost(baseline_load, **cost_kwargs)
    scenario_monthly = calculate_electricity_cost(net_load,      **cost_kwargs)
    export_revenue   = 0.0  # 無躉售收益

    total_load_kwh  = float(baseline_load.sum()) * 0.25
    re_kwh          = float(re_generation.sum()) * 0.25   # 物理發電總量（顯示用）
    # 一次匹配實際轉供（Q_kw ≤ baseline，全部自用）+ 二次月結
    re_first_kwh    = float(re_q_kw.sum()) * 0.25
    re_consumed_kwh = re_first_kwh + second_round_kwh
    re_ratio        = min(re_consumed_kwh / total_load_kwh, 1.0) if total_load_kwh > 0 else 0.0
    export_kwh      = 0.0
    net_load_kwh    = float(net_load.sum()) * 0.25

    # 月度 RE 比例：一次匹配（Q_kw）+ 二次月結
    _re_consumed_ts = pd.Series(
        re_q_kw.values + second_round_kw.values,
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

    # Scenario carbon = grid electricity CO2 + natural gas combustion CO2
    scenario_carbon_kg  = net_load_kwh * CARBON_FACTOR_KG_PER_KWH + total_combustion_co2_kg
    baseline_carbon_kg  = total_load_kwh * CARBON_FACTOR_KG_PER_KWH

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
        "annual_fuel_cost_ntd": total_fuel_cost_ntd,
        "baseline_carbon_tons": baseline_carbon_kg / 1000,
        "scenario_carbon_tons": scenario_carbon_kg / 1000,
        "carbon_reduction_tons": (baseline_carbon_kg - scenario_carbon_kg) / 1000,
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
