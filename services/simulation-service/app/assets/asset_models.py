"""
Synthetic generation / demand profiles for each asset type.
All profiles return pd.Series of power in kW aligned to the given DatetimeIndex.
"""
import numpy as np
import pandas as pd


# Monthly irradiance factor (Taiwan, rough)
_SOLAR_MONTHLY = {1:.60, 2:.65, 3:.70, 4:.75, 5:.80, 6:.85,
                   7:.90, 8:.88, 9:.80, 10:.70, 11:.65, 12:.60}

# ── Taiwan offshore wind monthly CF (Taiwan Strait, NE-monsoon dominant) ──────
# Source: Formosa 1 / Greater Changhua project data; NE monsoon Oct–Mar,
# SW monsoon May–Sep; annual mean ≈ 0.38
_WIND_MONTHLY_BASE = {
    1: .58, 2: .54, 3: .44, 4: .27,
    5: .22, 6: .18, 7: .26, 8: .30,
    9: .38, 10: .52, 11: .57, 12: .62,
}

# ── Taiwan hydro monthly CF (reservoir + run-of-river mix) ───────────────────
# Driven by plum rains (梅雨 May–Jun) and typhoon rainfall (Jul–Sep);
# dry season Nov–Apr; annual mean ≈ 0.40
_HYDRO_MONTHLY_BASE = {
    1: .22, 2: .17, 3: .22, 4: .30,
    5: .53, 6: .63, 7: .70, 8: .67,
    9: .60, 10: .44, 11: .28, 12: .22,
}

_HVAC_COOLING_MONTHLY = {1:.20, 2:.20, 3:.40, 4:.60, 5:.75, 6:1.0,
                          7:1.0, 8:1.0, 9:.90, 10:.65, 11:.35, 12:.20}


def _rng_seed(capacity_kw: float) -> np.random.Generator:
    return np.random.default_rng(int(capacity_kw * 31) % (2**31))


def _ar1_daily_noise(rng: np.random.Generator, n_intervals: int,
                     phi: float, sigma: float) -> np.ndarray:
    """AR(1) daily weather state, broadcast to 15-min intervals."""
    n_days = (n_intervals + 95) // 96
    noise = np.zeros(n_days)
    noise[0] = rng.normal(0, sigma)
    innov_std = sigma * np.sqrt(1 - phi ** 2)
    for i in range(1, n_days):
        noise[i] = phi * noise[i - 1] + rng.normal(0, innov_std)
    day_idx = np.clip(np.arange(n_intervals) // 96, 0, n_days - 1)
    return noise[day_idx]


def _apply_shutdown_events(gen: np.ndarray, index: pd.DatetimeIndex,
                            month_range: tuple[int, int],
                            n_per_year: int, dur_range: tuple[int, int],
                            rng: np.random.Generator) -> np.ndarray:
    """Zero-out random shutdown windows within specified months."""
    gen = np.asarray(gen, dtype=float).copy()
    lo_m, hi_m = month_range
    candidates = np.where((index.month >= lo_m) & (index.month <= hi_m))[0]
    if len(candidates) == 0:
        return gen
    n_years = max(1, int(len(index) / (96 * 365)))
    n_events = n_per_year * n_years
    for _ in range(n_events):
        pos   = int(rng.integers(0, len(candidates)))
        start = candidates[pos]
        dur   = int(rng.integers(dur_range[0], dur_range[1] + 1))
        gen[start: start + dur] = 0.0
    return gen


def solar_profile(index: pd.DatetimeIndex, capacity_kw: float) -> pd.Series:
    rng = _rng_seed(capacity_kw)
    hour = index.hour + index.minute / 60.0
    sunrise, sunset = 6.0, 18.5
    bell = np.maximum(0.0, np.sin(np.pi * (hour - sunrise) / (sunset - sunrise)))
    m_factor = np.array([_SOLAR_MONTHLY[m] for m in index.month])
    noise = np.clip(rng.normal(1.0, 0.06, len(index)), 0.6, 1.4)
    gen = capacity_kw * bell * m_factor * noise
    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def wind_profile(index: pd.DatetimeIndex, capacity_kw: float,
                  capacity_factor: float = 0.35) -> pd.Series:
    """
    Taiwan offshore wind model.

    Seasonal basis: NE monsoon (Oct–Mar) drives the high-wind half-year;
    SW monsoon (May–Sep) is weak. Monthly base CFs are scaled to match the
    user-specified annual capacity_factor.

    Physical effects modelled:
    - Diurnal: offshore sea-land thermal contrast → slight night enhancement
    - Day-to-day persistence: AR(1) with φ=0.75 (synoptic weather patterns)
    - Typhoon shutdowns (Jul–Oct): 2–4 events/year, 12–48 h cut-out each
    - Within-day turbulence: small Gaussian noise (σ=8 %)
    """
    rng = _rng_seed(capacity_kw + 1)
    n   = len(index)

    # Scale monthly profile to hit requested annual CF
    base_annual = np.mean(list(_WIND_MONTHLY_BASE.values()))
    scale = capacity_factor / base_annual
    monthly_cf = {k: min(v * scale, 0.97) for k, v in _WIND_MONTHLY_BASE.items()}

    m_base   = np.array([monthly_cf[m] for m in index.month])
    hour     = np.asarray(index.hour, dtype=float)
    # Offshore: slight peak 02–04h, dip 14–16h (sea-breeze interaction)
    diurnal  = 0.90 + 0.12 * np.cos(2 * np.pi * (hour - 3) / 24)

    # AR(1) day-to-day persistence (synoptic weather state)
    day_noise = _ar1_daily_noise(rng, n, phi=0.75, sigma=0.14)
    persistence = np.clip(1.0 + day_noise, 0.05, 1.90)

    # Within-interval turbulence
    turbulence = np.clip(rng.normal(1.0, 0.08, n), 0.50, 1.50)

    gen = capacity_kw * m_base * diurnal * persistence * turbulence

    # Typhoon cut-out shutdowns (Jul–Oct): ~3 events/year, 12–48 h each
    gen = _apply_shutdown_events(gen, index, (7, 10),
                                  n_per_year=3, dur_range=(48, 193), rng=rng)

    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def hydro_profile(index: pd.DatetimeIndex, capacity_kw: float,
                   capacity_factor: float = 0.40) -> pd.Series:
    """
    Taiwan reservoir + run-of-river hydro model.

    Seasonal basis: wet season driven by 梅雨 plum rains (May–Jun) and typhoon
    rainfall (Jul–Sep); dry season Nov–Apr with weakest output in Feb.
    Monthly base CFs are scaled to match user-specified annual capacity_factor.

    Physical effects modelled:
    - Reservoir buffering: high AR(1) persistence (φ=0.88), low variance
    - Typhoon flood shutdowns (Jul–Sep): excess flow → 1–3 day outage, ~2/year
    - Drought events (Jan–Apr): 10–30 day period at 20–45 % capacity, ~1/year
    - No significant diurnal pattern (reservoir dispatch is controllable)
    """
    rng = _rng_seed(capacity_kw + 2)
    n   = len(index)

    base_annual = np.mean(list(_HYDRO_MONTHLY_BASE.values()))
    scale = capacity_factor / base_annual
    monthly_cf = {k: min(v * scale, 0.97) for k, v in _HYDRO_MONTHLY_BASE.items()}

    m_base = np.array([monthly_cf[m] for m in index.month])

    # Reservoir buffering: smoother than wind (φ=0.88, σ=0.07)
    day_noise   = _ar1_daily_noise(rng, n, phi=0.88, sigma=0.07)
    persistence = np.clip(1.0 + day_noise, 0.10, 1.60)

    gen = capacity_kw * m_base * persistence

    # Typhoon flood shutdowns (Jul–Sep): excess inflow → 24–72 h outage, ~2/year
    gen = _apply_shutdown_events(gen, index, (7, 9),
                                  n_per_year=2, dur_range=(96, 289), rng=rng)

    # Drought events (Jan–Apr): extended 10–30 day period at 20–45 % capacity
    drought_candidates = np.where((index.month >= 1) & (index.month <= 4))[0]
    if len(drought_candidates) > 0:
        n_years = max(1, int(n / (96 * 365)))
        for _ in range(n_years):
            pos      = int(rng.integers(0, len(drought_candidates)))
            start    = drought_candidates[pos]
            dur      = int(rng.integers(960, 2881))   # 10–30 days in 15-min slots
            factor   = float(rng.uniform(0.20, 0.45))
            end      = min(start + dur, n)
            gen[start:end] *= factor

    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def hvac_savings_profile(index: pd.DatetimeIndex, baseline_load: pd.Series,
                          efficiency_gain: float = 0.15) -> pd.Series:
    """HVAC COP improvement → load reduction during cooling hours."""
    hour = index.hour
    m_factor = np.array([_HVAC_COOLING_MONTHLY[m] for m in index.month])
    active = ((hour >= 8) & (hour <= 20)).astype(float)
    reduction = baseline_load.values * efficiency_gain * active * m_factor
    return pd.Series(np.clip(reduction, 0, baseline_load.values), index=index)


def storage_profile(index: pd.DatetimeIndex, capacity_kw: float) -> pd.Series:
    """Storage is handled inside the simulator; profile here is informational (rated power)."""
    return pd.Series(np.full(len(index), capacity_kw), index=index)


def sofc_profile(index: pd.DatetimeIndex, capacity_kw: float,
                  capacity_factor: float = 0.85) -> pd.Series:
    """SOFC runs as near-constant baseload; very low output variance."""
    rng = _rng_seed(capacity_kw + 10)
    noise = np.clip(rng.normal(1.0, 0.02, len(index)), 0.88, 1.05)
    gen = capacity_kw * capacity_factor * noise
    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def natgas_profile(index: pd.DatetimeIndex, capacity_kw: float,
                    capacity_factor: float = 0.65) -> pd.Series:
    """Natural gas generator: peak-shaving mode, primarily during business hours."""
    rng = _rng_seed(capacity_kw + 20)
    hour = index.hour
    # Full output 07:00–22:00, near-idle overnight
    day_factor = np.where((hour >= 7) & (hour < 22), 1.0, 0.05)
    noise = np.clip(rng.normal(1.0, 0.05, len(index)), 0.75, 1.20)
    gen = capacity_kw * capacity_factor * day_factor * noise
    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def ev_charging_profile(index: pd.DatetimeIndex, num_chargers: int = 10,
                         charger_kw: float = 22.0, smart: bool = True) -> pd.Series:
    rng = _rng_seed(num_chargers * charger_kw)
    hour = index.hour
    if smart:
        # Smart charging: 22:00–07:00
        active = ((hour >= 22) | (hour <= 7)).astype(float) * 0.75
    else:
        # Uncontrolled: peak at 08:00-10:00 and 17:00-20:00
        active = np.where(
            ((hour >= 8) & (hour < 10)) | ((hour >= 17) & (hour < 20)), 0.65,
            np.where((hour >= 10) & (hour < 17), 0.25, 0.05)
        )
    noise = np.clip(rng.normal(1.0, 0.12, len(index)), 0.5, 1.5)
    load = num_chargers * charger_kw * active * noise
    return pd.Series(np.clip(load, 0, num_chargers * charger_kw), index=index)


ASSET_REGISTRY = {
    "solar_self":     {"label": "☀️ 自發自用太陽能", "unit": "kWp",  "fn": solar_profile,       "color": "#f9c74f"},
    "solar_purchase": {"label": "☀️ 外購太陽能",     "unit": "kWp",  "fn": solar_profile,       "color": "#f8961e"},
    "wind":           {"label": "💨 外購風力發電",    "unit": "kW",   "fn": wind_profile,        "color": "#43aa8b"},
    "hydro":          {"label": "💧 外購水力發電",    "unit": "kW",   "fn": hydro_profile,       "color": "#4d908e"},
    "hvac":           {"label": "❄️ 空調效率提升",   "unit": "kW效益","fn": None,               "color": "#577590"},
    "storage":        {"label": "🔋 儲能系統",        "unit": "kWh",  "fn": None,               "color": "#90be6d"},
    "ev":             {"label": "⚡ 充電樁",          "unit": "kW",   "fn": None,               "color": "#277da1"},
    "sofc":           {"label": "🔥 固態氧化物燃料電池 (SOFC)", "unit": "kW", "fn": sofc_profile,   "color": "#e76f51"},
    "natgas":         {"label": "⚙️ 天然氣發電機",   "unit": "kW",   "fn": natgas_profile,      "color": "#6d6875"},
}
