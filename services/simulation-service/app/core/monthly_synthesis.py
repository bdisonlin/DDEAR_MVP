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

from app.schemas.monthly_bill import MonthlyRow, BillType, VoltageLevel, ReSourceType, IndustryType
from app.core.tariff_config import is_summer

# ── Normalized weekday load shapes (hour 0-23, peak = 1.0) ───────────────────
# Values are engineering estimates; no single public dataset is cited.
# The TOU period re-scaling in synthesize_from_monthly() corrects period-level
# totals to match the bill exactly — these shapes only govern intra-period
# distribution.
_INDUSTRY_SHAPES: dict[str, dict] = {
    # 商辦 / 輕工業：午休下沉，15:00 冷氣+設備尖峰，週末六成
    "office_commercial": {
        "weekday": np.array([
            0.28, 0.26, 0.25, 0.24, 0.24, 0.32,
            0.50, 0.68, 0.83, 0.92, 0.95, 0.94,
            0.80, 0.78, 0.96, 1.00, 0.98, 0.90,
            0.72, 0.58, 0.47, 0.40, 0.35, 0.30,
        ], dtype=float),
        "we_factor": 0.62,
    },
    # 重工業 / 三班制：全天平坦，週末接近工作日（輪班）
    "heavy_industry": {
        "weekday": np.array([
            0.88, 0.87, 0.86, 0.86, 0.87, 0.88,
            0.90, 0.93, 0.97, 1.00, 1.00, 0.99,
            0.97, 0.96, 0.98, 1.00, 0.99, 0.98,
            0.96, 0.94, 0.93, 0.92, 0.91, 0.90,
        ], dtype=float),
        "we_factor": 0.92,
    },
    # 半導體 / 晶圓廠：極度平坦，潔淨室 24h 維持，幾乎無波動
    "semiconductor": {
        "weekday": np.array([
            0.97, 0.97, 0.96, 0.96, 0.97, 0.97,
            0.98, 0.99, 1.00, 1.00, 1.00, 1.00,
            0.99, 0.99, 1.00, 1.00, 1.00, 0.99,
            0.99, 0.98, 0.98, 0.97, 0.97, 0.97,
        ], dtype=float),
        "we_factor": 0.98,
    },
    # 冷鏈 / 冷凍倉儲：夜間壓縮機高，白天進出貨造成負載略低
    "cold_chain": {
        "weekday": np.array([
            0.95, 0.97, 0.99, 1.00, 1.00, 0.98,
            0.90, 0.82, 0.75, 0.72, 0.74, 0.76,
            0.78, 0.78, 0.76, 0.74, 0.75, 0.78,
            0.82, 0.86, 0.90, 0.92, 0.94, 0.95,
        ], dtype=float),
        "we_factor": 0.88,
    },
    # 零售 / 百貨：10:00 開店，21:00 關店，開閉店邊緣陡升陡降
    "retail": {
        "weekday": np.array([
            0.12, 0.10, 0.09, 0.09, 0.10, 0.12,
            0.18, 0.25, 0.38, 0.60, 0.88, 0.97,
            1.00, 0.99, 0.98, 0.99, 1.00, 0.98,
            0.95, 0.90, 0.78, 0.45, 0.22, 0.14,
        ], dtype=float),
        "we_factor": 1.10,  # 週末人流更多
    },
}

_SEASONAL = np.array([
    0.88, 0.90, 0.94, 0.98, 1.05, 1.14,
    1.20, 1.18, 1.08, 0.99, 0.92, 0.88,
])


def _shape_at(hour: int, minute: int, is_weekend: bool,
              industry_type: IndustryType = "office_commercial") -> float:
    profile   = _INDUSTRY_SHAPES.get(industry_type, _INDUSTRY_SHAPES["office_commercial"])
    weekday   = profile["weekday"]
    we_factor = profile["we_factor"]
    shape = weekday * (we_factor if is_weekend else 1.0)
    h1    = (hour + 1) % 24
    frac  = minute / 60.0
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
        # Saturday: 週六半尖峰 07:00-22:00 (both seasons)
        if dow == 5:
            if 7 <= hour < 22:
                return "sat"
            return "offpeak"
        # Weekday
        if summer:
            # 尖峰 Peak: 10:00-12:00, 13:00-17:00 (Taiwan TPC high-voltage commercial)
            if (10 <= hour < 12) or (13 <= hour < 17):
                return "peak"
            # 半尖峰 Semi (com_3tier): remaining business hours 07:00-22:00
            if bill_type == "com_3tier" and 7 <= hour < 22:
                return "semi"
            # com_2tier has no semi; business hours outside peak count as peak
            if bill_type == "com_2tier" and 9 <= hour < 22:
                return "peak"
            return "offpeak"
        else:
            # Non-summer: no distinct peak; semi covers 07:00-22:00
            if bill_type == "com_3tier" and 7 <= hour < 22:
                return "semi"
            # com_2tier non-summer: all offpeak (no summer peak period)
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


# ── RE source-type generation profiles (hour 0-23, normalised to peak=1.0) ──
#
# solar_pv:      台灣屋頂/地面型，日間 bell curve，09–15 最強，夜間為零
# onshore_wind:  陸域風電，全天，清晨/深夜略高，受地形影響
# offshore_wind: 離岸風電，台灣海峽東北季風主導，全天穩定，夜間略高，CF 最高
# biomass:       生質能可調度基載，全天近平，略低於滿載以反映維護排程

_RE_PROFILES: dict[str, np.ndarray] = {
    "solar_pv": np.array([
        0.00, 0.00, 0.00, 0.00, 0.00, 0.02,
        0.08, 0.22, 0.52, 0.78, 0.93, 0.99,
        1.00, 0.97, 0.88, 0.70, 0.46, 0.20,
        0.05, 0.01, 0.00, 0.00, 0.00, 0.00,
    ], dtype=float),
    "onshore_wind": np.array([
        0.88, 0.90, 0.92, 0.93, 0.93, 0.91,
        0.86, 0.78, 0.72, 0.68, 0.66, 0.68,
        0.70, 0.70, 0.68, 0.66, 0.68, 0.74,
        0.82, 0.86, 0.88, 0.88, 0.89, 0.89,
    ], dtype=float),
    "offshore_wind": np.array([
        0.95, 0.97, 0.98, 1.00, 1.00, 0.98,
        0.94, 0.88, 0.82, 0.78, 0.76, 0.78,
        0.80, 0.80, 0.78, 0.76, 0.78, 0.84,
        0.90, 0.93, 0.94, 0.95, 0.95, 0.95,
    ], dtype=float),
    "biomass": np.array([
        0.90, 0.90, 0.90, 0.90, 0.90, 0.90,
        0.92, 0.92, 0.92, 0.92, 0.92, 0.92,
        0.90, 0.90, 0.90, 0.90, 0.90, 0.90,
        0.90, 0.90, 0.90, 0.90, 0.90, 0.90,
    ], dtype=float),
}


def _estimate_period_kwh_from_profile(
    month:         int,
    year:          int,
    bill_type:     BillType,
    voltage:       VoltageLevel,
    industry_type: IndustryType,
    total_kwh:     float,
) -> dict[str, float]:
    """
    Distribute total_kwh across TOU periods according to the industry load
    profile's natural energy-weighted allocation.  Used when per-period bill
    data is missing OR when use_industry_shape=True overrides the bill data.
    """
    profile   = _INDUSTRY_SHAPES.get(industry_type, _INDUSTRY_SHAPES["office_commercial"])
    weekday   = profile["weekday"]
    we_factor = profile["we_factor"]

    start = pd.Timestamp(f"{year}-{month:02d}-01")
    end_y, end_m = (year + 1, 1) if month == 12 else (year, month + 1)
    end   = pd.Timestamp(f"{end_y}-{end_m:02d}-01") - pd.Timedelta("15min")
    idx   = pd.date_range(start, end, freq="15min")

    hours   = idx.hour.to_numpy()
    minutes = idx.minute.to_numpy()
    is_we   = np.array(idx.dayofweek >= 5)
    h_next  = (hours + 1) % 24
    frac    = minutes / 60.0
    wd_vals = weekday[hours] * (1 - frac) + weekday[h_next] * frac
    weights = np.where(is_we, wd_vals * we_factor, wd_vals)

    period_weights: dict[str, float] = {}
    for i, ts in enumerate(idx):
        p = _tou_period(ts, bill_type, voltage)
        period_weights[p] = period_weights.get(p, 0.0) + float(weights[i]) * 0.25

    total_weight = sum(period_weights.values())
    if total_weight < 1e-9:
        return {}
    return {k: round(v / total_weight * total_kwh, 2) for k, v in period_weights.items()}


def distribute_re_to_periods(
    total_kwh:   float,
    source_type: ReSourceType,
    bill_type:   BillType,
    voltage:     VoltageLevel,
    month:       int,
    year:        int = 2024,
) -> dict[str, float]:
    """
    Given a monthly total RE transfer (kWh) and an energy source type, estimate
    how much of that RE falls within each TOU billing period.

    Returns a dict with keys from {"peak","semi","sat","offpeak"} and kWh values
    summing to total_kwh.  For 'tiered' bill_type only "offpeak" (fallback) is used
    since there are no periods to distinguish.
    """
    if total_kwh <= 0:
        return {}

    profile = _RE_PROFILES.get(source_type, _RE_PROFILES["solar_pv"])

    # Build 15-min timestamp index for the given month
    start = pd.Timestamp(f"{year}-{month:02d}-01")
    end_y, end_m = (year + 1, 1) if month == 12 else (year, month + 1)
    end   = pd.Timestamp(f"{end_y}-{end_m:02d}-01") - pd.Timedelta("15min")
    idx   = pd.date_range(start, end, freq="15min")

    # Generation weight per 15-min slot (interpolated from hourly profile)
    hours   = idx.hour.to_numpy()
    minutes = idx.minute.to_numpy()
    h_next  = (hours + 1) % 24
    frac    = minutes / 60.0
    weights = profile[hours] * (1 - frac) + profile[h_next] * frac  # shape: (N,)

    total_weight = weights.sum() * 0.25   # ≈ energy-weighted hours
    if total_weight < 1e-9:
        return {}

    # Scale so that sum(gen * 0.25h) == total_kwh
    gen_kw = weights * (total_kwh / total_weight)   # kW at each interval

    # Classify each interval into TOU periods and accumulate kWh
    period_kwh: dict[str, float] = {"peak": 0.0, "semi": 0.0, "sat": 0.0, "offpeak": 0.0}
    if bill_type == "tiered":
        # No TOU periods — everything collapses to total
        period_kwh["offpeak"] = float(total_kwh)
    else:
        for i, ts in enumerate(idx):
            p = _tou_period(ts, bill_type, voltage)
            period_kwh[p] += float(gen_kw[i]) * 0.25

    # Drop zero-value periods
    return {k: round(v, 2) for k, v in period_kwh.items() if v > 0}


def synthesize_from_monthly(
    year:               int,
    rows:               list[MonthlyRow],
    bill_type:          BillType     = "tiered",
    voltage:            VoltageLevel = "high",
    industry_type:      IndustryType = "office_commercial",
    use_industry_shape: bool         = False,
) -> pd.Series:
    """
    Return a 15-min kW series covering the full calendar year.

    use_industry_shape=False (default):
        TOU period totals are forced to match the bill exactly; industry type
        only controls within-period shape variation (subtle).

    use_industry_shape=True  (industry comparison mode):
        Period distribution is estimated from the industry load profile using
        the monthly total kWh as the only bill constraint.  Bill per-period
        data is ignored, making industry differences clearly visible.
        Missing-period data is always filled with industry estimates regardless
        of this flag.
    """
    """Return a 15-min kW series covering the full calendar year."""
    idx = pd.date_range(f"{year}-01-01", f"{year}-12-31 23:45", freq="15min")
    rng = np.random.default_rng(year)

    hours   = idx.hour.to_numpy()
    minutes = idx.minute.to_numpy()
    dow     = idx.dayofweek.to_numpy()
    months  = idx.month.to_numpy()

    raw = np.empty(len(idx), dtype=float)
    for i in range(len(idx)):
        base     = _shape_at(int(hours[i]), int(minutes[i]), bool(dow[i] >= 5), industry_type)
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
            total_for_month = float(row.total_kwh)

            # Industry-profile period estimates: always computed so missing
            # periods can be filled; also used exclusively when use_industry_shape=True
            estimated: dict[str, float] = {}
            if total_for_month > 0:
                estimated = _estimate_period_kwh_from_profile(
                    m, year, bill_type, voltage, industry_type, total_for_month
                )

            for period in ("peak", "semi", "sat", "offpeak"):
                if use_industry_shape:
                    target = estimated.get(period)
                else:
                    target = _period_target(row, period)
                    if target is None:          # fill gap with industry estimate
                        target = estimated.get(period)
                if target is None:
                    continue
                pmask = month_mask & (period_labels == period)
                if pmask.any() and target > 0:
                    _rescale_period(series, pmask, target)
                elif pmask.any() and target == 0:
                    series[pmask] = 0.0

    return series


# ── RE generation time-series synthesis ──────────────────────────────────────
# Hourly normalized profiles (peak = 1.0).  The synthesis scales each month's
# RE kWh onto these shapes so the integral matches the metered bill value.

_RE_HOURLY_PROFILES: dict[str, np.ndarray] = {
    # 台灣屋頂 / 地面型太陽能：日間 bell curve，夜間為零
    "solar_pv": np.array([
        0.00, 0.00, 0.00, 0.00, 0.00, 0.01,
        0.05, 0.16, 0.35, 0.58, 0.80, 0.95,
        1.00, 0.97, 0.88, 0.72, 0.48, 0.20,
        0.05, 0.01, 0.00, 0.00, 0.00, 0.00,
    ], dtype=float),
    # 陸域風電：全天，清晨與深夜略高
    "onshore_wind": np.array([
        1.10, 1.14, 1.15, 1.12, 1.08, 1.04,
        0.94, 0.88, 0.85, 0.87, 0.90, 0.93,
        0.94, 0.94, 0.94, 0.94, 0.95, 0.96,
        0.98, 1.00, 1.04, 1.07, 1.09, 1.11,
    ], dtype=float),
    # 離岸風電：台灣海峽東北季風，全天穩定，夜間略高
    "offshore_wind": np.array([
        1.06, 1.08, 1.10, 1.10, 1.08, 1.05,
        1.01, 0.96, 0.92, 0.92, 0.93, 0.95,
        0.96, 0.96, 0.96, 0.96, 0.97, 0.98,
        0.99, 1.00, 1.02, 1.04, 1.05, 1.06,
    ], dtype=float),
    # 生質能：可調度，近似穩定基載
    "biomass": np.ones(24, dtype=float),
}


def synthesize_re_timeseries(
    rows: list,          # list of MonthlyRow (schema objects with .month, .total_re_kwh)
    configs: list,       # list of ReSourceConfig (with .source_type)
    proportions: dict,   # {source_type: fraction} summing to 1.0
    index: pd.DatetimeIndex,
) -> pd.Series:
    """Synthesize a 15-min RE generation series from monthly bill RE data.

    For each month, the total re_kwh is split across sources by *proportions*
    (derived from capacity × CF), then each source's share is spread over
    15-min intervals using the source-specific hourly generation profile.
    The result preserves monthly energy totals exactly.
    """
    result = pd.Series(0.0, index=index)

    for row in rows:
        total_re = row.total_re_kwh
        if total_re <= 0:
            continue

        month_mask = index.month == row.month
        month_idx  = index[month_mask]
        if len(month_idx) == 0:
            continue

        month_vals = np.zeros(len(month_idx))

        for cfg in configs:
            source_kwh = total_re * proportions.get(cfg.source_type, 0.0)
            if source_kwh <= 0:
                continue

            profile_24h = _RE_HOURLY_PROFILES.get(cfg.source_type, np.ones(24))
            # Normalize so profile sums to 1 (represents energy fraction)
            profile_24h = profile_24h / profile_24h.sum()

            # Expand each hour to 4 × 15-min intervals, then tile over all days
            profile_15m = np.repeat(profile_24h, 4)
            n_intervals  = len(month_idx)
            tiled        = np.tile(profile_15m, n_intervals // 96 + 1)[:n_intervals]
            tiled        = tiled / tiled.sum()   # re-normalize after tile

            # kW so that Σ(kW × 0.25 h) = source_kwh
            month_vals += (source_kwh / 0.25) * tiled

        result[month_mask] = month_vals

    return result
