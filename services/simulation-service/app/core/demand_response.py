"""
Demand Response (DR) simulation engine.
Implements CBL calculation, execution rate, and TPC settlement rules.
"""
import numpy as np
import pandas as pd
from app.schemas.demand_response import (
    DRProgram, NotificationType, DRRequest, MonthlyDRRow, DRSettlement,
)

# ── Program defaults ───────────────────────────────────────────────────────────
PROGRAM_META: dict[DRProgram, dict] = {
    DRProgram.PLANNED_MONTHLY: {
        "label": "計畫性－月選8日型",
        "default_events": 96,           # 8 days × 12 months
        "has_penalty": False,
        "basic_fee_eligible": False,
        "basic_fee_ntd_per_kw": 0,
        "win_rate": 1.0,
    },
    DRProgram.PLANNED_DAILY: {
        "label": "計畫性－日選時段型",
        "default_events": 240,
        "has_penalty": False,
        "basic_fee_eligible": False,
        "basic_fee_ntd_per_kw": 0,
        "win_rate": 1.0,
    },
    DRProgram.RT_GUARANTEED: {
        "label": "即時性－保證反應型",
        "default_events": 30,
        "has_penalty": True,
        "basic_fee_eligible": True,
        "basic_fee_ntd_per_kw": 65,
        "win_rate": 1.0,
    },
    DRProgram.RT_FLEXIBLE: {
        "label": "即時性－彈性反應型",
        "default_events": 30,
        "has_penalty": False,
        "basic_fee_eligible": False,
        "basic_fee_ntd_per_kw": 0,
        "win_rate": 1.0,
    },
    DRProgram.BID_ECONOMIC: {
        "label": "競價－經濟型",
        "default_events": 20,
        "has_penalty": False,
        "basic_fee_eligible": False,
        "basic_fee_ntd_per_kw": 0,
        "win_rate": 0.60,
    },
    DRProgram.BID_RELIABLE: {
        "label": "競價－可靠型",
        "default_events": 20,
        "has_penalty": True,
        "basic_fee_eligible": True,
        "basic_fee_ntd_per_kw": 78,
        "win_rate": 0.80,
    },
}


def _discount_rate(exec_rate: float, notif: NotificationType) -> float:
    """
    TPC tiered discount table (彈性/經濟型基準 — same structure for all programs).
    Emergency same-day notification adds +20 percentage points.
    """
    if exec_rate < 0.60:
        base = 0.0
    elif exec_rate < 0.80:
        base = 1.0
    elif exec_rate <= 1.20:
        base = 1.1
    else:
        base = 1.2

    if notif in (NotificationType.SAME_DAY_2H, NotificationType.SAME_DAY_1H):
        base = min(base + 0.20, 1.40)

    return round(base, 4)


def simulate_dr(series: pd.Series, req: DRRequest) -> DRSettlement:
    """
    Simulate annual DR participation and calculate settlement.

    CBL approach:
      For each month, compute the 75th-percentile of weekday peak-hour 15-min
      demands as a proxy for "average of the top 5 similar business days".
      Actual reduction is estimated as the spread between the 75th and 25th
      percentiles — i.e., how much the load *could* come down if the user
      actively curtails. Capped at contracted_kw × 1.3.
    """
    meta = PROGRAM_META[req.program]
    n_events_target = req.events_per_year or meta["default_events"]
    win_rate: float = meta["win_rate"]
    effective_events = max(1, int(n_events_target * win_rate))
    events_per_month = max(1, effective_events // 12)

    # Filter to peak hours and weekdays
    peak_mask = series.index.hour.isin(req.peak_hours) & (series.index.dayofweek < 5)
    peak_series = series[peak_mask]

    periods = peak_series.index.to_period("M")
    unique_periods = sorted(periods.unique())

    rows: list[MonthlyDRRow] = []
    for period in unique_periods:
        month_data = peak_series[periods == period]
        if len(month_data) < 4:
            continue

        # CBL: 75th-pct of peak-hour demands (proxy for top-5-day avg)
        cbl_kw = float(month_data.quantile(0.75))

        # Achievable reduction: a well-managed facility can curtail up to 65%
        # of its CBL (e.g. turn off HVAC, defer EV charging, ramp down chillers).
        # Actual reduction = contracted_kw, provided that doesn't exceed 65% of CBL.
        max_feasible = cbl_kw * 0.65
        actual_reduction_kw = min(req.contracted_kw, max_feasible)

        # 競價型最低有效抑低門檻：台電規定競價型不得低於 20 kW，不足則按 0 計算
        if req.program in (DRProgram.BID_ECONOMIC, DRProgram.BID_RELIABLE):
            if actual_reduction_kw < 20.0:
                actual_reduction_kw = 0.0

        exec_rate = actual_reduction_kw / req.contracted_kw if req.contracted_kw > 0 else 0.0
        disc = _discount_rate(exec_rate, req.notification_type)

        # Flow revenue: actual × hours × events × price × discount
        flow_rev = (
            actual_reduction_kw
            * req.event_duration_hours
            * events_per_month
            * req.bid_price_ntd_per_kwh
            * disc
        )

        # Basic fee discount (only for eligible programs and exec_rate ≥ 60%)
        basic_fee = 0.0
        if meta["basic_fee_eligible"] and exec_rate >= 0.60:
            basic_fee = (
                req.contracted_kw
                * meta["basic_fee_ntd_per_kw"]
                * disc
                / 12
            )

        # Penalty: shortfall × hours × events × price (only for penalty programs)
        penalty = 0.0
        if meta["has_penalty"] and actual_reduction_kw < req.contracted_kw:
            shortfall = req.contracted_kw - actual_reduction_kw
            penalty = (
                shortfall
                * req.event_duration_hours
                * events_per_month
                * req.bid_price_ntd_per_kwh
            )

        rows.append(MonthlyDRRow(
            month=str(period),
            cbl_kw=round(cbl_kw, 1),
            actual_reduction_kw=round(actual_reduction_kw, 1),
            execution_rate=round(exec_rate, 4),
            discount_rate=round(disc, 4),
            events=events_per_month,
            flow_revenue=round(flow_rev, 0),
            basic_fee_discount=round(basic_fee, 0),
            penalty=round(penalty, 0),
            net_revenue=round(flow_rev + basic_fee - penalty, 0),
        ))

    if not rows:
        raise ValueError("No valid peak-hour data to compute CBL — check data_id and peak_hours.")

    avg_cbl = float(np.mean([r.cbl_kw for r in rows]))
    avg_red = float(np.mean([r.actual_reduction_kw for r in rows]))
    avg_exec = avg_red / req.contracted_kw if req.contracted_kw > 0 else 0.0
    avg_disc = float(np.mean([r.discount_rate for r in rows]))

    return DRSettlement(
        program=req.program,
        program_label=meta["label"],
        contracted_kw=req.contracted_kw,
        bid_price=req.bid_price_ntd_per_kwh,
        cbl_kw=round(avg_cbl, 1),
        avg_actual_reduction_kw=round(avg_red, 1),
        avg_execution_rate=round(avg_exec, 4),
        total_events_per_year=effective_events,
        total_event_hours=round(effective_events * req.event_duration_hours, 1),
        annual_flow_revenue=round(sum(r.flow_revenue for r in rows), 0),
        annual_basic_fee_discount=round(sum(r.basic_fee_discount for r in rows), 0),
        annual_penalty=round(sum(r.penalty for r in rows), 0),
        annual_net_revenue=round(sum(r.net_revenue for r in rows), 0),
        has_penalty=meta["has_penalty"],
        notification_type=req.notification_type,
        avg_discount_rate=round(avg_disc, 4),
        monthly=rows,
    )
