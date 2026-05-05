"""Baseline creation from monthly electricity bill data."""
import uuid
from fastapi import APIRouter, HTTPException

from app.schemas.monthly_bill import MonthlyBillRequest, MonthlyBillSummary, ReSourceConfig
from app.core.monthly_synthesis import synthesize_from_monthly, distribute_re_to_periods
from app.core.tariff import calculate_electricity_cost
from app import store

router = APIRouter()

# Typical Taiwan capacity factors per RE source type
_CF_BY_SOURCE: dict[str, float] = {
    "solar_pv":      0.15,   # ~14–17% — Taiwan rooftop/ground-mount
    "onshore_wind":  0.27,   # ~25–30% — Taiwan onshore
    "offshore_wind": 0.38,   # ~35–40% — Taiwan Strait offshore
    "biomass":       0.75,   # ~70–80% — dispatchable baseload
}
_DEFAULT_CF = 0.15


def _compute_proportions(configs: list[ReSourceConfig]) -> dict[str, float]:
    """Derive each source's share of total RE from capacity_kw × CF.

    This embeds the physics of intermittent generation: a 500 kW solar array
    (CF 15%) contributes less expected energy than a 300 kW offshore wind farm
    (CF 38%), so the wind farm receives a larger proportional share of the
    actual metered re_kwh even though it has lower nameplate capacity.
    """
    expected = {
        cfg.source_type: cfg.capacity_kw * _CF_BY_SOURCE.get(cfg.source_type, _DEFAULT_CF)
        for cfg in configs
    }
    total = sum(expected.values())
    if total == 0:
        equal = 1.0 / len(configs)
        return {cfg.source_type: equal for cfg in configs}
    return {src: exp / total for src, exp in expected.items()}


@router.post("", response_model=MonthlyBillSummary)
def create_from_monthly_bill(req: MonthlyBillRequest):
    """Synthesize a 15-min load profile from monthly electricity bill rows."""
    try:
        series = synthesize_from_monthly(
            req.year, req.rows, req.bill_type, req.voltage,
            req.industry_type, req.use_industry_shape,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"合成失敗：{exc}")

    data_id = str(uuid.uuid4())[:12]
    store.save(
        data_id, series,
        voltage=req.voltage,
        contracted_kw=req.contracted_kw,
        bill_type=req.bill_type,
    )

    monthly_cost = calculate_electricity_cost(
        series,
        voltage=req.voltage,
        contracted_kw=req.contracted_kw,
        bill_type=req.bill_type,
    )

    total_re_kwh = float(sum(r.total_re_kwh for r in req.rows))

    # ── Resolve multi-source configs and proportions ──────────────────────────
    # Proportions are never user-input; they're derived from capacity_kw × CF.
    # Fall back to legacy single-source when re_source_configs is empty.
    configs   = req.re_source_configs
    proportions: dict[str, float] = {}
    if configs:
        proportions = _compute_proportions(configs)
    elif req.re_source_type and total_re_kwh > 0:
        # Legacy path: single source = 100%
        configs = [ReSourceConfig(
            source_type=req.re_source_type,
            capacity_kw=1.0,
            ppa_rate_ntd_per_kwh=None,
        )]
        proportions = {req.re_source_type: 1.0}

    # ── Annual PPA cost ───────────────────────────────────────────────────────
    annual_ppa_cost_ntd = 0.0
    for row in req.rows:
        for cfg in configs:
            if cfg.ppa_rate_ntd_per_kwh is not None:
                annual_ppa_cost_ntd += (
                    row.total_re_kwh
                    * proportions.get(cfg.source_type, 0.0)
                    * cfg.ppa_rate_ntd_per_kwh
                )

    # ── RE period breakdown ───────────────────────────────────────────────────
    re_period_breakdown: dict[str, float] | None = None
    if configs and total_re_kwh > 0:
        accumulated: dict[str, float] = {}
        for row in req.rows:
            if row.total_re_kwh <= 0:
                continue
            has_period_re = any(v is not None for v in [
                row.re_peak_kwh, row.re_semi_kwh, row.re_sat_kwh, row.re_offpeak_kwh
            ])
            if has_period_re and len(configs) == 1:
                # User supplied per-period breakdown for single source — use directly
                for key, val in {
                    "peak": row.re_peak_kwh, "semi": row.re_semi_kwh,
                    "sat":  row.re_sat_kwh,  "offpeak": row.re_offpeak_kwh,
                }.items():
                    if val is not None and val > 0:
                        accumulated[key] = accumulated.get(key, 0.0) + val
            else:
                # Distribute each source's share via its physics-based generation profile
                for cfg in configs:
                    kwh_for_source = row.total_re_kwh * proportions.get(cfg.source_type, 0.0)
                    if kwh_for_source <= 0:
                        continue
                    month_breakdown = distribute_re_to_periods(
                        total_kwh=kwh_for_source,
                        source_type=cfg.source_type,
                        bill_type=req.bill_type,
                        voltage=req.voltage,
                        month=row.month,
                        year=req.year,
                    )
                    for k, v in month_breakdown.items():
                        accumulated[k] = accumulated.get(k, 0.0) + v

        if accumulated:
            re_period_breakdown = {k: round(v, 1) for k, v in sorted(accumulated.items())}

    # ── Suggested RE capacity ─────────────────────────────────────────────────
    # If user provided capacities, sum them directly; else back-calculate from CF.
    if configs and req.re_source_configs:
        suggested_cap = round(sum(cfg.capacity_kw for cfg in req.re_source_configs), 1)
    elif total_re_kwh > 0:
        cf = _CF_BY_SOURCE.get(req.re_source_type or "", _DEFAULT_CF)
        suggested_cap = round(total_re_kwh / (8760 * cf), 1)
    else:
        suggested_cap = 0.0

    return MonthlyBillSummary(
        data_id=data_id,
        peak_kw=float(series.max()),
        avg_kw=float(series.mean()),
        total_kwh=float(series.sum() * 0.25),
        annual_cost_ntd=float(monthly_cost["total_cost"].sum()),
        date_start=str(series.index[0].date()),
        date_end=str(series.index[-1].date()),
        num_intervals=len(series),
        re_kwh=total_re_kwh,
        suggested_re_capacity_kw=suggested_cap,
        re_period_breakdown=re_period_breakdown,
        annual_ppa_cost_ntd=annual_ppa_cost_ntd,
    )
