"""
Synthetic generation / demand profiles for each asset type.
All profiles return pd.Series of power in kW aligned to the given DatetimeIndex.
"""
import numpy as np
import pandas as pd


# Monthly irradiance factor (Taiwan, rough)
_SOLAR_MONTHLY = {1:.60, 2:.65, 3:.70, 4:.75, 5:.80, 6:.85,
                   7:.90, 8:.88, 9:.80, 10:.70, 11:.65, 12:.60}

_WIND_MONTHLY  = {1:.80, 2:.85, 3:.90, 4:.85, 5:.70, 6:.60,
                   7:.55, 8:.50, 9:.60, 10:.75, 11:.80, 12:.85}

_HYDRO_MONTHLY = {1:.40, 2:.35, 3:.40, 4:.50, 5:.60, 6:.70,
                   7:.75, 8:.70, 9:.65, 10:.55, 11:.50, 12:.45}

_HVAC_COOLING_MONTHLY = {1:.20, 2:.20, 3:.40, 4:.60, 5:.75, 6:1.0,
                          7:1.0, 8:1.0, 9:.90, 10:.65, 11:.35, 12:.20}


def _rng_seed(capacity_kw: float) -> np.random.Generator:
    return np.random.default_rng(int(capacity_kw * 31) % (2**31))


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
                  capacity_factor: float = 0.30) -> pd.Series:
    rng = _rng_seed(capacity_kw + 1)
    hour = index.hour
    m_factor = np.array([_WIND_MONTHLY[m] for m in index.month])
    # Wind stronger at night / early morning in Taiwan
    hour_factor = 0.65 + 0.25 * np.cos(2 * np.pi * (hour - 3) / 24)
    noise = np.clip(rng.normal(1.0, 0.18, len(index)), 0.2, 1.8)
    gen = capacity_kw * capacity_factor * hour_factor * m_factor * noise
    return pd.Series(np.clip(gen, 0, capacity_kw), index=index)


def hydro_profile(index: pd.DatetimeIndex, capacity_kw: float) -> pd.Series:
    rng = _rng_seed(capacity_kw + 2)
    m_factor = np.array([_HYDRO_MONTHLY[m] for m in index.month])
    noise = np.clip(rng.normal(1.0, 0.05, len(index)), 0.8, 1.2)
    gen = capacity_kw * m_factor * noise
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
}
