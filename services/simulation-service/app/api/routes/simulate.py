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
    sofc_profile, natgas_profile,
)
from app.core.re_profiles import get_or_create_re_profile
from app import store

router = APIRouter()


def _build_tariff(tc):
    return {
        "summer":     {"peak": tc.summer_peak,     "semi_peak": tc.summer_semi_peak,     "off_peak": tc.summer_off_peak},
        "non_summer": {"peak": tc.non_summer_peak, "semi_peak": tc.non_summer_semi_peak, "off_peak": tc.non_summer_off_peak},
    }


def _build_profile(atype, params, index, baseline):
    cap  = params.capacity_kw or 100.0
    year = index[0].year if len(index) > 0 else 2024
    if atype in ("solar_self", "solar_purchase"):
        # Use DB profile for consistent physics with bill-upload path
        db_profile = get_or_create_re_profile("solar_pv", year)
        aligned    = db_profile.reindex(index, method="nearest", tolerance="1min").fillna(0.0)
        return aligned * cap
    elif atype == "wind":
        source = "offshore_wind" if (params.capacity_factor or 0.30) >= 0.35 else "onshore_wind"
        db_profile = get_or_create_re_profile(source, year)
        aligned    = db_profile.reindex(index, method="nearest", tolerance="1min").fillna(0.0)
        return aligned * cap
    elif atype == "hydro":
        return hydro_profile(index, cap, params.capacity_factor or 0.40)
    elif atype == "hvac":
        return hvac_savings_profile(index, baseline, params.efficiency_gain or 0.15)
    elif atype == "ev":
        return ev_charging_profile(index, params.num_chargers or 5, params.charger_kw or 22.0, params.smart_charging)
    elif atype == "sofc":
        return sofc_profile(index, cap, params.capacity_factor or 0.85)
    elif atype == "natgas":
        return natgas_profile(index, cap, params.capacity_factor or 0.65)
    return pd.Series(0.0, index=index)


def _representative_week(year):
    return f"{year}-07-07", f"{year}-07-13 23:45"


def _week_range(year: int, month: int, week: int) -> tuple[str, str]:
    """Return a 7-day window for the given week (1–4) of a month.
    Week 1: days 1–7, Week 2: days 8–14, Week 3: days 15–21, Week 4: days 22–28.
    """
    starts = {1: 1, 2: 8, 3: 15, 4: 22}
    ends   = {1: 7, 2: 14, 3: 21, 4: 28}
    d0 = starts[week]
    d1 = ends[week]
    return f"{year}-{month:02d}-{d0:02d}", f"{year}-{month:02d}-{d1:02d} 23:45"


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
        sim["annual_savings"], sim["total_capex"],
        sim["total_annual_om"] + sim["annual_fuel_cost_ntd"],
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
        annual_fuel_cost_ntd=sim["annual_fuel_cost_ntd"],
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

    # If no RE assets were modelled but the baseline has a stored bill-derived
    # RE curve, use it so the load chart shows green-energy generation.
    re_generation = sim["re_generation"]
    if re_generation.sum() == 0 and record.baseline_re_series is not None:
        re_generation = record.baseline_re_series.reindex(re_generation.index, fill_value=0.0)

    year = baseline.index[0].year
    start, end = _representative_week(year)
    try:
        week_b  = baseline[start:end]
        week_s  = sim["net_load"][start:end]
        week_re = re_generation[start:end]
    except Exception:
        week_b  = baseline.iloc[:672]
        week_s  = sim["net_load"].iloc[:672]
        week_re = re_generation.iloc[:672]

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

    # Per-month-week data for the UI switcher; key = "{month}_{week}" e.g. "7_2"
    load_chart_by_month: dict[str, list[LoadChartPoint]] = {}
    for m in range(1, 13):
        for w in range(1, 5):
            w_start, w_end = _week_range(year, m, w)
            try:
                wb = baseline[w_start:w_end]
                ws = sim["net_load"][w_start:w_end]
                wr = re_generation[w_start:w_end]
                if len(wb) >= 96:
                    load_chart_by_month[f"{m}_{w}"] = [
                        LoadChartPoint(
                            ts=str(ts),
                            baseline_kw=round(float(bv), 2),
                            scenario_kw=round(float(sv), 2),
                            re_gen_kw=round(float(rv), 2),
                        )
                        for ts, bv, sv, rv in zip(wb.index, wb.values, ws.values, wr.values)
                    ]
            except Exception:
                pass

    response = SimulationResponse(
        kpis=kpis, monthly=monthly, roi=roi_result,
        load_chart=load_chart, load_heatmap=heatmap,
        load_chart_by_month=load_chart_by_month,
        asset_ids=[a.id for a in req.assets],
    )

    return response
