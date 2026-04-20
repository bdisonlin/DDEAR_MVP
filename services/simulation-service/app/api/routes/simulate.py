"""Simulation endpoint — core Digital Twin computation."""
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.schemas.simulation import (
    SimulateRequest, SimulationResponse,
    MonthlyRow, KpiResult, RoiResult, LoadChartPoint, HeatmapCell,
)
from app.core.simulator import simulate_scenario
from app.core.roi import calculate_roi
from app.assets.asset_models import (
    solar_profile, wind_profile, hydro_profile,
    hvac_savings_profile, ev_charging_profile,
)
from app import store

router = APIRouter()


def _build_tariff(tc):
    return {
        "summer":     {"peak": tc.summer_peak,     "semi_peak": tc.summer_semi_peak,     "off_peak": tc.summer_off_peak},
        "non_summer": {"peak": tc.non_summer_peak, "semi_peak": tc.non_summer_semi_peak, "off_peak": tc.non_summer_off_peak},
    }


def _build_profile(atype, params, index, baseline):
    cap = params.capacity_kw or 100.0
    if atype in ("solar_self", "solar_purchase"):
        return solar_profile(index, cap)
    elif atype == "wind":
        return wind_profile(index, cap, params.capacity_factor or 0.30)
    elif atype == "hydro":
        return hydro_profile(index, cap)
    elif atype == "hvac":
        return hvac_savings_profile(index, baseline, params.efficiency_gain or 0.15)
    elif atype == "ev":
        return ev_charging_profile(index, params.num_chargers or 5, params.charger_kw or 22.0, params.smart_charging)
    return pd.Series(0.0, index=index)


def _representative_week(year):
    return f"{year}-07-07", f"{year}-07-13 23:45"


@router.post("", response_model=SimulationResponse)
def simulate(req: SimulateRequest):
    record = store.load(req.data_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"data_id '{req.data_id}' not found.")

    baseline = record.series

    # TariffConfig overrides stored metadata; fall back to stored values
    tc            = req.tariff_config
    voltage       = tc.voltage       or record.voltage       or "high"
    contracted_kw = tc.contracted_kw or record.contracted_kw
    bill_type     = record.bill_type

    tariff_rates  = _build_tariff(tc)
    demand_charge = tc.demand_charge
    idx           = baseline.index

    assets_prepared = []
    for a in req.assets:
        profile = _build_profile(a.type, a.params, idx, baseline)
        assets_prepared.append({
            "id":            a.id,
            "type":          a.type,
            "profile":       profile,
            "capex_ntd":     a.params.capex_ntd,
            "annual_om_ntd": a.params.annual_om_ntd,
            "params":        a.params.model_dump(),
        })

    sim = simulate_scenario(
        baseline, assets_prepared,
        tariff_rates=tariff_rates,
        demand_charge=demand_charge,
        voltage=voltage,
        contracted_kw=contracted_kw,
        bill_type=bill_type,
    )
    roi = calculate_roi(
        sim["annual_savings"], sim["total_capex"], sim["total_annual_om"],
        req.financial_config.project_years, req.financial_config.discount_rate,
    )

    kpis = KpiResult(
        baseline_annual_cost=sim["baseline_annual_cost"],
        scenario_annual_cost=sim["scenario_annual_cost"],
        annual_savings=sim["annual_savings"],
        savings_pct=sim["annual_savings"] / max(sim["baseline_annual_cost"], 1),
        re_ratio=sim["re_ratio"],
        re_kwh=sim["re_kwh"],
        export_kwh=sim["export_kwh"],
        export_revenue=sim["export_revenue"],
        baseline_carbon_tons=sim["baseline_carbon_tons"],
        scenario_carbon_tons=sim["scenario_carbon_tons"],
        carbon_reduction_tons=sim["carbon_reduction_tons"],
        carbon_reduction_pct=sim["carbon_reduction_tons"] / max(sim["baseline_carbon_tons"], 1),
        total_capex=sim["total_capex"],
        total_annual_om=sim["total_annual_om"],
        baseline_load_kwh=sim["baseline_load_kwh"],
        net_load_kwh=sim["net_load_kwh"],
        demand_penalty_annual_ntd=sim["demand_penalty_annual"],
        demand_penalty_warning=sim.get("demand_penalty_warning", False),
        res_tou_excess_annual_ntd=sim["res_tou_excess_annual"],
        storage_price_spread_ntd_per_kwh=sim["storage_price_spread"],
        storage_arbitrage_revenue_annual_ntd=sim.get("storage_arbitrage_revenue", 0.0),
    )

    bm = sim["baseline_monthly"]
    sm = sim["scenario_monthly"]
    monthly_re_ratio = sim["monthly_re_ratio"]
    monthly = []
    for period in bm.index:
        b_cost = float(bm.loc[period, "total_cost"])
        s_cost = float(sm.loc[period, "total_cost"]) if period in sm.index else b_cost
        monthly.append(MonthlyRow(
            month=str(period),
            baseline_cost=b_cost,
            scenario_cost=s_cost,
            savings=b_cost - s_cost,
            savings_pct=(b_cost - s_cost) / max(b_cost, 1),
            re_ratio=float(monthly_re_ratio.get(period, 0.0)),
            peak_demand_kw=float(sm.loc[period, "peak_demand_kw"]) if period in sm.index else 0,
            total_kwh=float(sm.loc[period, "total_kwh"])           if period in sm.index else 0,
            peak_kwh=float(sm.loc[period, "peak_kwh"])             if period in sm.index else 0,
            semi_kwh=float(sm.loc[period, "semi_kwh"])             if period in sm.index else 0,
            offpeak_kwh=float(sm.loc[period, "offpeak_kwh"])       if period in sm.index else 0,
            demand_penalty_ntd=float(sm.loc[period, "demand_penalty"]) if period in sm.index else 0,
            res_tou_excess_ntd=float(sm.loc[period, "res_tou_excess"]) if period in sm.index else 0,
        ))

    cumulative = roi.get("cumulative_cash_flows", [])
    roi_result = RoiResult(
        payback_years=None if roi["payback_years"] == float("inf") else roi["payback_years"],
        npv=roi["npv"],
        irr=roi.get("irr"),
        net_annual_benefit=roi["net_annual_benefit"],
        cash_flows=roi["cash_flows"],
        cumulative_cash_flows=list(cumulative) if hasattr(cumulative, "tolist") else cumulative,
    )

    year = baseline.index[0].year
    start, end = _representative_week(year)
    try:
        week_b  = baseline[start:end]
        week_s  = sim["net_load"][start:end]
        week_re = sim["re_generation"][start:end]
    except Exception:
        week_b  = baseline.iloc[:672]
        week_s  = sim["net_load"].iloc[:672]
        week_re = sim["re_generation"].iloc[:672]

    load_chart = [
        LoadChartPoint(
            ts=str(ts),
            baseline_kw=round(float(bv), 2),
            scenario_kw=round(float(sv), 2),
            re_gen_kw=round(float(rv), 2),
        )
        for ts, bv, sv, rv in zip(week_b.index, week_b.values, week_s.values, week_re.values)
    ]

    net_load = sim["net_load"]
    heatmap  = []
    for m in range(1, 13):
        for h in range(24):
            b_mask = (baseline.index.month == m) & (baseline.index.hour == h)
            s_mask = (net_load.index.month  == m) & (net_load.index.hour  == h)
            b_avg  = float(baseline[b_mask].mean()) if b_mask.any() else 0.0
            s_avg  = float(net_load[s_mask].mean()) if s_mask.any() else 0.0
            heatmap.append(HeatmapCell(month=m, hour=h,
                                       baseline_kw=round(b_avg, 1),
                                       scenario_kw=round(s_avg, 1)))

    return SimulationResponse(
        kpis=kpis, monthly=monthly, roi=roi_result,
        load_chart=load_chart, load_heatmap=heatmap,
        asset_ids=[a.id for a in req.assets],
    )
