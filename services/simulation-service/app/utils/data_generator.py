"""Synthetic baseline load profile generator."""
import numpy as np
import pandas as pd


def generate_sample_load(year: int = 2024, peak_kw: float = 1000.0, seed: int = 42) -> pd.Series:
    rng = np.random.default_rng(seed)
    index = pd.date_range(f"{year}-01-01", f"{year+1}-01-01", freq="15min", inclusive="left")

    hour = index.hour + index.minute / 60.0
    month = index.month
    weekday = index.weekday

    base = 0.35 * peak_kw
    is_prod = ((weekday < 5) & (hour >= 8) & (hour <= 20)) | ((weekday == 5) & (hour >= 8) & (hour <= 14))
    lunch = ((hour >= 12) & (hour < 13)).astype(float) * 0.5
    production = np.where(is_prod, (1.0 - lunch * 0.5) * 0.48 * peak_kw, 0.0)

    monthly_cool = np.array([0.25,0.25,0.45,0.60,0.75,1.0,1.0,1.0,0.90,0.65,0.35,0.25])[month - 1]
    cooling_hour = np.where((hour >= 8) & (hour <= 19), 1.0, 0.2)
    cooling = 0.18 * peak_kw * cooling_hour * monthly_cool

    daily_var = 1.0 + 0.04 * rng.standard_normal(len(index))
    noise = rng.normal(0, 0.015 * peak_kw, len(index))

    load = (base + production + cooling) * daily_var + noise
    return pd.Series(np.clip(load, base * 0.85, peak_kw * 1.02), index=index, name="load_kw")
