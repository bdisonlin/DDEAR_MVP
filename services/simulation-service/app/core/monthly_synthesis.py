"""
Synthesize 15-min load profile from monthly electricity bill data.

Algorithm (tiered billing):
  1. Build a normalized intra-day load shape (weekday / weekend × seasonal factor).
  2. Apply small Gaussian noise (seed = year) for realism.
  3. Scale each month so Σ(kW × 0.25 h) = target monthly kWh.
  4. Optionally soft-cap at the reported peak demand (契約容量).

Algorithm (TOU billing — additional step):
  5. For each TOU period, re-scale the subset of intervals that fall within
     that period so the period kWh matches the reported value.  The relative
     intra-period shape is preserved; only the magnitude is adjusted.
"""
import numpy as np
import pandas as pd
from typing import Optional

from app.schemas.monthly_bill import MonthlyRow, BillType, VoltageLevel
from app.core.tariff_config import is_summer

# ── Normalized weekday load shape (hour 0-23, peak = 1.0 at 15:00) ──────────
_WD = np.array([
    0.28, 0.26, 0.25, 0.24, 0.24, 0.32,
    0.50, 0.68, 0.83, 0.92, 0.95, 0.94,
    0.80, 0.78, 0.96, 1.00, 0.98, 0.90,
    0.72, 0.58, 0.47, 0.40, 0.35, 0.30,
], dtype=float)
_WE_FACTOR = 0.62

_SEASONAL = np.array([
    0.88, 0.90, 0.94, 0.98, 1.05, 1.14,
    1.20, 1.18, 1.08, 0.99, 0.92, 0.88,
])


def _shape_at(hour: int, minute: int, is_weekend: bool) -> float:
    shape = _WD * (_WE_FACTOR if is_weekend else 1.0)
    h1   = (hour + 1) % 24
    frac = minute / 60.0
    return float(shape[hour] * (1 - frac) + shape[h1] * frac)


# ── TOU period classifiers ────────────────────────────────────────────────────

def _tou_period(ts: pd.Timestamp, bill_type: BillType,
                voltage: VoltageLevel = "high") -> str:
    """Classify a timestamp into a bill-data period label."""
    dow    = ts.dayofweek
    hour   = ts.hour
    month  = ts.month
    day    = ts.day
    summer = is_summer(month, day, voltage)

    is_sunday = dow == 6

    if bill_type in ("res_2tier", "res_3tier"):
        if dow >= 5:
            return "offpeak"
        if summer:
            if 9 <= hour < 24:
                return "peak"
            if bill_type == "res_3tier" and 7 <= hour < 9:
                return "semi"
            return "offpeak"
        else:
            if bill_type == "res_3tier" and 7 <= hour < 22:
                return "semi"
            return "offpeak"

    if bill_type in ("com_2tier", "com_3tier"):
        if is_sunday:
            return "offpeak"
        if dow == 5:
            if summer and 9 <= hour < 24:
                return "sat"
            if not summer and 7 <= hour < 22:
                return "sat"
            return "offpeak"
        # Weekday
        if summer and 9 <= hour < 24:
            return "peak"
        if bill_type == "com_3tier" and 7 <= hour < 9:
            return "semi"
        # Non-summer weekday: no peak, semi replaces peak hours
        if not summer and bill_type == "com_3tier" and 9 <= hour < 22:
            return "semi"
        if not summer and bill_type == "com_2tier":
            return "offpeak"
        return "offpeak"

    return "offpeak"


def _period_target(row: MonthlyRow, period: str) -> Optional[float]:
    return {
        "peak":    row.peak_kwh,
        "semi":    row.semi_kwh,
        "sat":     row.sat_kwh,
        "offpeak": row.offpeak_kwh,
    }.get(period)


def _rescale_period(series: pd.Series, mask: np.ndarray,
                    target_kwh: float) -> None:
    cur = float(series[mask].sum()) * 0.25
    if cur > 1e-6:
        series[mask] = series[mask] * (target_kwh / cur)


def synthesize_from_monthly(
    year:          int,
    rows:          list[MonthlyRow],
    bill_type:     BillType = "tiered",
    voltage:       VoltageLevel = "high",
) -> pd.Series:
    """Return a 15-min kW series covering the full calendar year."""
    idx = pd.date_range(f"{year}-01-01", f"{year}-12-31 23:45", freq="15min")
    rng = np.random.default_rng(year)

    hours   = idx.hour.to_numpy()
    minutes = idx.minute.to_numpy()
    dow     = idx.dayofweek.to_numpy()
    months  = idx.month.to_numpy()

    raw = np.empty(len(idx), dtype=float)
    for i in range(len(idx)):
        base     = _shape_at(int(hours[i]), int(minutes[i]), bool(dow[i] >= 5))
        seasonal = float(_SEASONAL[months[i] - 1])
        noise    = float(rng.normal(1.0, 0.012))
        raw[i]   = max(0.05, base * seasonal * noise)

    series = pd.Series(raw, index=idx, dtype=float)

    month_map: dict[int, MonthlyRow] = {r.month: r for r in rows}
    avg_base_kwh = float(np.mean([
        r.total_kwh / _SEASONAL[r.month - 1]
        for r in rows if r.total_kwh > 0
    ])) if rows else 1.0

    for m in range(1, 13):
        mask = series.index.month == m
        row  = month_map.get(m)
        total_kwh = float(row.total_kwh) if row else avg_base_kwh * float(_SEASONAL[m - 1])

        cur_kwh = float(series[mask].sum()) * 0.25
        if cur_kwh > 0:
            series[mask] *= total_kwh / cur_kwh

        # Soft-cap at contracted capacity (契約容量)
        cap_kw = row.peak_kw if row and row.peak_kw and row.peak_kw > 0 else None
        if cap_kw:
            cap = float(cap_kw) * 1.02
            if float(series[mask].max()) > cap:
                series[mask] = series[mask].clip(upper=cap)
                cur_kwh = float(series[mask].sum()) * 0.25
                if cur_kwh > 0:
                    series[mask] *= total_kwh / cur_kwh

    # TOU period-level re-scaling
    if bill_type != "tiered":
        period_labels = np.empty(len(idx), dtype=object)
        for i, ts in enumerate(idx):
            period_labels[i] = _tou_period(ts, bill_type, voltage)

        for m in range(1, 13):
            row = month_map.get(m)
            if row is None:
                continue
            month_mask = months == m
            for period in ("peak", "semi", "sat", "offpeak"):
                target = _period_target(row, period)
                if target is None:
                    continue
                pmask = month_mask & (period_labels == period)
                if pmask.any() and target > 0:
                    _rescale_period(series, pmask, target)
                elif pmask.any() and target == 0:
                    series[pmask] = 0.0

    return series
