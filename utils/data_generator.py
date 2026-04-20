"""Synthetic baseline load profile generator for demo purposes."""
import numpy as np
import pandas as pd


def generate_sample_load(year: int = 2024, peak_kw: float = 1000.0,
                          seed: int = 42) -> pd.Series:
    """
    Realistic industrial factory load profile — 15-min intervals for one full year.
    Assumes a discrete-manufacturing factory with:
      - 35% base load (24/7 facilities, compressors, lighting)
      - Production schedule Mon–Fri 08:00-20:00, Sat 08:00-14:00
      - HVAC cooling load (summer-heavy)
      - Lunch dip 12:00-13:00
    """
    rng = np.random.default_rng(seed)
    index = pd.date_range(f"{year}-01-01", f"{year+1}-01-01", freq="15min", inclusive="left")

    hour = index.hour + index.minute / 60.0
    month = index.month
    weekday = index.weekday  # 0=Mon

    base = 0.35 * peak_kw

    is_production = (
        ((weekday < 5) & (hour >= 8) & (hour <= 20))
        | ((weekday == 5) & (hour >= 8) & (hour <= 14))
    )
    lunch_dip = ((hour >= 12) & (hour < 13)).astype(float) * 0.5
    production_factor = np.where(is_production, 1.0 - lunch_dip * 0.5, 0.0)
    production = production_factor * 0.48 * peak_kw

    summer = np.isin(month, [6, 7, 8, 9]).astype(float)
    cooling_hour = np.where((hour >= 8) & (hour <= 19), 1.0, 0.2)
    # Monthly cooling factor
    monthly_cool = np.array(
        [0.25, 0.25, 0.45, 0.60, 0.75, 1.0, 1.0, 1.0, 0.90, 0.65, 0.35, 0.25]
    )[month - 1]
    cooling = 0.18 * peak_kw * cooling_hour * monthly_cool

    # High-frequency noise + daily demand variation
    daily_var = 1.0 + 0.04 * rng.standard_normal(len(index))
    noise = rng.normal(0, 0.015 * peak_kw, len(index))

    load = (base + production + cooling) * daily_var + noise
    load = np.clip(load, base * 0.85, peak_kw * 1.02)

    return pd.Series(load, index=index, name="load_kw")


def parse_interval_csv(uploaded_file):
    """
    Parse user-uploaded CSV with columns: timestamp, load_kw
    Returns 15-min indexed pd.Series or None on error.
    """
    try:
        df = pd.read_csv(uploaded_file, parse_dates=[0])
        df.columns = ["timestamp", "load_kw"]
        df = df.set_index("timestamp").sort_index()
        df = df.resample("15min").mean().interpolate()
        return df["load_kw"]
    except Exception:
        return None
