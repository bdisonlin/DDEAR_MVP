"""
Pre-computed 15-min RE generation profiles stored in PostgreSQL.

Each row is (source_type, year) → full-year pd.Series of instantaneous
capacity-factor values (0.0–1.0).  mean(series) ≈ annual CF of that source.

Usage
-----
  profile = get_or_create_re_profile("solar_pv", 2024)
  generation_kw = capacity_kw * profile          # scale to actual output

The profiles embed Taiwan-specific physics:
  solar_pv      — daytime bell curve, summer peak irradiance
  onshore_wind  — nocturnal peak, NE monsoon (Oct–Mar) stronger
  offshore_wind — Taiwan Strait NE monsoon, strongest Nov–Mar
  biomass       — near-flat dispatchable baseload
"""
from __future__ import annotations

import gzip
import io
import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── Physics constants ─────────────────────────────────────────────────────────

# Annual average CF (matches _CF_BY_SOURCE in monthly_bill route)
_ANNUAL_CF: dict[str, float] = {
    "solar_pv":      0.15,
    "onshore_wind":  0.27,
    "offshore_wind": 0.38,
    "biomass":       0.75,
}

ALL_SOURCE_TYPES: list[str] = list(_ANNUAL_CF.keys())

# Monthly seasonal multipliers (index 0 = Jan).  Mean ≈ 1.0 so they don't
# shift the annual CF — they only redistribute energy across months.
_MONTHLY_FACTORS: dict[str, np.ndarray] = {
    "solar_pv": np.array([
        0.72, 0.68, 0.82, 0.94, 1.02, 0.93,
        1.08, 1.12, 0.96, 0.90, 0.76, 0.68,
    ], dtype=float),
    "onshore_wind": np.array([
        1.28, 1.22, 1.12, 0.90, 0.80, 0.72,
        0.68, 0.72, 0.84, 1.10, 1.28, 1.32,
    ], dtype=float),
    "offshore_wind": np.array([
        1.50, 1.44, 1.28, 1.06, 0.74, 0.62,
        0.58, 0.64, 0.76, 1.12, 1.42, 1.52,
    ], dtype=float),
    "biomass": np.ones(12, dtype=float),
}

# Intra-day hourly shape (index 0 = hour 0).  Mean = 1.0 so it preserves CF.
_DAILY_SHAPE: dict[str, np.ndarray] = {
    "solar_pv": np.array([
        0.000, 0.000, 0.000, 0.000, 0.000, 0.020,
        0.100, 0.280, 0.550, 0.800, 0.960, 1.080,
        1.120, 1.100, 1.020, 0.860, 0.640, 0.330,
        0.100, 0.020, 0.000, 0.000, 0.000, 0.000,
    ], dtype=float),
    "onshore_wind": np.array([
        1.16, 1.20, 1.22, 1.20, 1.14, 1.06,
        0.96, 0.88, 0.84, 0.86, 0.90, 0.94,
        0.96, 0.96, 0.96, 0.96, 0.97, 0.98,
        1.00, 1.02, 1.06, 1.10, 1.13, 1.16,
    ], dtype=float),
    "offshore_wind": np.array([
        1.08, 1.10, 1.12, 1.12, 1.10, 1.07,
        1.02, 0.96, 0.93, 0.93, 0.94, 0.96,
        0.97, 0.97, 0.97, 0.97, 0.98, 0.99,
        1.00, 1.01, 1.03, 1.05, 1.07, 1.08,
    ], dtype=float),
    "biomass": np.array([
        0.96, 0.96, 0.96, 0.97, 0.98, 0.99,
        1.00, 1.01, 1.02, 1.02, 1.01, 1.01,
        1.01, 1.01, 1.01, 1.01, 1.01, 1.00,
        1.00, 0.99, 0.98, 0.97, 0.97, 0.96,
    ], dtype=float),
}


# ── Profile generation ────────────────────────────────────────────────────────

def generate_re_profile(source_type: str, year: int) -> pd.Series:
    """Compute full-year 15-min capacity-factor profile for one source type.

    The returned series has values in [0, 1] and mean ≈ annual CF of that
    source.  A small deterministic noise term adds realism without breaking
    reproducibility across restarts (seed derived from source_type + year).
    """
    annual_cf    = _ANNUAL_CF.get(source_type, 0.15)
    monthly_f    = _MONTHLY_FACTORS.get(source_type, np.ones(12))
    daily_s      = _DAILY_SHAPE.get(source_type, np.ones(24))

    daily_norm   = daily_s   / daily_s.mean()
    monthly_norm = monthly_f / monthly_f.mean()

    idx = pd.date_range(
        f"{year}-01-01", f"{year + 1}-01-01", freq="15min", inclusive="left"
    )
    h_factor = daily_norm[idx.hour]
    m_factor = monthly_norm[idx.month - 1]
    profile  = annual_cf * m_factor * h_factor

    # Deterministic noise (σ = 3 % of CF) for realistic inter-interval variation
    rng     = np.random.default_rng(seed=hash((source_type, year)) & 0xFFFF_FFFF)
    profile = np.clip(profile + rng.normal(0, annual_cf * 0.03, len(idx)), 0.0, 1.0)

    return pd.Series(profile, index=idx, name=source_type)


# ── Serialisation ─────────────────────────────────────────────────────────────

def _pack(series: pd.Series) -> bytes:
    return gzip.compress(series.to_json(date_format="iso").encode())


def _unpack(blob: bytes) -> pd.Series:
    j = gzip.decompress(blob).decode()
    s = pd.read_json(io.StringIO(j), typ="series")
    s.index = pd.to_datetime(s.index, utc=True).tz_convert(None)
    return s


# ── In-process LRU cache (avoids repeated DB/Redis round-trips) ───────────────

_profile_cache: dict[tuple[str, int], pd.Series] = {}


def get_or_create_re_profile(source_type: str, year: int) -> pd.Series:
    """Return the 15-min CF profile — from process cache, DB, or generated."""
    key = (source_type, year)
    if key in _profile_cache:
        return _profile_cache[key]

    from app.db.connection import engine, _DB_MODE
    if _DB_MODE and engine is not None:
        from sqlalchemy import text
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT series_gz FROM re_generation_profiles "
                     "WHERE source_type = :st AND year = :yr"),
                {"st": source_type, "yr": year},
            ).fetchone()
        if row is not None:
            profile = _unpack(bytes(row.series_gz))
            _profile_cache[key] = profile
            logger.debug("Loaded RE profile from DB: %s/%d", source_type, year)
            return profile

    # Generate on-demand, persist to DB
    profile = generate_re_profile(source_type, year)
    _persist_re_profile(source_type, year, profile)
    _profile_cache[key] = profile
    return profile


def _persist_re_profile(source_type: str, year: int, profile: pd.Series) -> None:
    from app.db.connection import engine, _DB_MODE
    if not _DB_MODE or engine is None:
        return
    blob = _pack(profile)
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO re_generation_profiles (source_type, year, series_gz)
            VALUES (:st, :yr, :blob)
            ON CONFLICT (source_type, year) DO NOTHING
        """), {"st": source_type, "yr": year, "blob": blob})
        conn.commit()
    logger.info("Persisted RE profile to DB: %s/%d", source_type, year)


def prewarm_profiles(years: list[int]) -> None:
    """Pre-compute and store all source × year combinations at startup."""
    for year in years:
        for st in ALL_SOURCE_TYPES:
            get_or_create_re_profile(st, year)
    logger.info("RE generation profiles ready: %s × years %s",
                ALL_SOURCE_TYPES, years)


# ── Bill-calibrated RE time series ────────────────────────────────────────────

def build_re_timeseries(
    rows: list,          # MonthlyRow objects (.month, .total_re_kwh)
    configs: list,       # ReSourceConfig objects (.source_type, .capacity_kw)
    proportions: dict,   # {source_type: float} summing to 1.0
    index: pd.DatetimeIndex,
    year: int,
) -> pd.Series:
    """Synthesize a 15-min RE generation series calibrated to monthly bill kWh.

    For each source, the DB profile provides the physical shape (CF curve with
    seasonal + intra-day variation).  The monthly total is then scaled to match
    the actual metered re_kwh on the bill, so the shape is realistic and the
    energy integral is exact.
    """
    result = pd.Series(0.0, index=index)

    # Pre-load all source profiles (cache hit after prewarm)
    profiles: dict[str, pd.Series] = {
        cfg.source_type: get_or_create_re_profile(cfg.source_type, year)
        for cfg in configs
    }

    for row in rows:
        total_re = row.total_re_kwh
        if total_re <= 0:
            continue

        month_mask = index.month == row.month
        if not month_mask.any():
            continue

        for cfg in configs:
            source_kwh = total_re * proportions.get(cfg.source_type, 0.0)
            if source_kwh <= 0:
                continue

            src_profile = profiles.get(cfg.source_type)
            if src_profile is None:
                continue

            # Slice DB profile to this month's intervals (reindex to simulation index)
            month_idx    = index[month_mask]
            profile_vals = src_profile.reindex(month_idx, method="nearest", tolerance="1min")
            profile_vals = profile_vals.fillna(0.0).values

            # Monthly calibration: scale shape so Σ(kw × 0.25h) = source_kwh
            sim_kwh = float(profile_vals.sum() * 0.25)
            if sim_kwh > 0:
                scale = source_kwh / sim_kwh
            else:
                scale = 0.0

            result[month_mask] += profile_vals * scale

    return result
