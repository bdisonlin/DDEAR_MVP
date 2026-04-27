"""
AI Optimization Engine — server-side port of the frontend EnergyStrategy logic.

All core business logic lives here so that the IP remains on the server and
cannot be inspected from the browser bundle.
"""
from __future__ import annotations
import math
import os
import logging
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

DR_DISPATCH_H = 2  # TPC DR events: max 2 hours per call

CAPEX_UNIT: dict[str, float] = {
    "self_solar": 50_000,
    "solar_ppa":   3_000,
    "wind_ppa":    5_000,
    "hydro_ppa":   4_000,
    "natgas":     25_000,
    "sofc":       80_000,
    "bess":       60_000,
}

@dataclass
class DRPeriod:
    id: str
    label: str
    label_sub: str
    start: int
    end: int
    rate_multiplier: float
    events_per_year: int

DR_PRESETS: list[DRPeriod] = [
    DRPeriod("summer_peak", "夏季尖峰",   "10–17時", 10, 17, 1.35, 60),
    DRPeriod("summer_semi", "夏季半尖峰", "17–22時", 17, 22, 1.00, 80),
    DRPeriod("nonsummer",   "非夏月半峰", "07–22時",  7, 22, 0.80, 50),
]

@dataclass
class EnergyParams:
    self_solar: float = 0.0
    solar_ppa:  float = 0.0
    wind_ppa:   float = 0.0
    hydro_ppa:  float = 0.0
    natgas:     float = 0.0
    sofc:       float = 0.0
    bess:       float = 0.0

@dataclass
class HourlyPoint:
    hour: int
    existing_gen:   float = 0.0
    existing_solar: float = 0.0
    bess:           float = 0.0
    self_solar:     float = 0.0
    solar_ppa:      float = 0.0
    wind_ppa:       float = 0.0
    hydro_ppa:      float = 0.0
    sofc:           float = 0.0
    natgas:         float = 0.0
    grid:           float = 0.0

@dataclass
class KPIs:
    capex:      float = 0.0
    dr_revenue: float = 0.0
    cfe_rate:   float = 0.0
    carbon:     float = 0.0

@dataclass
class Scenario:
    id:               str
    label:            str
    load_profile:     list[float]   # 24-h demand kW
    peak_kw:          float
    existing_gen_kw:  float = 0.0
    gen_paralleled:   bool  = False
    existing_solar_kw: float = 0.0

@dataclass
class DRScore:
    dr:          DRPeriod
    score:       float
    value_label: str
    load_pct:    int
    params:      EnergyParams
    hourly_data: list[HourlyPoint]
    kpis:        KPIs
    ai_text:     str


# ── Asset Sizing ───────────────────────────────────────────────────────────────

def _peak_2h_avg(slice_: list[float]) -> float:
    """Best 2-hour contiguous average in slice."""
    if not slice_:
        return 0.0
    if len(slice_) < DR_DISPATCH_H:
        return sum(slice_) / len(slice_)
    best = 0.0
    for i in range(len(slice_) - DR_DISPATCH_H + 1):
        avg = sum(slice_[i: i + DR_DISPATCH_H]) / DR_DISPATCH_H
        if avg > best:
            best = avg
    return best


def _solar_factor(hour: int) -> float:
    if 6 <= hour <= 18:
        return math.sin(math.pi * (hour - 6) / 12)
    return 0.0


def get_dynamic_presets(dr_start: int, dr_end: int, scenario: Scenario) -> dict[str, EnergyParams]:
    is_daytime = 10 <= dr_start <= 16
    is_morning = dr_start < 10

    dr_slice = scenario.load_profile[dr_start: min(dr_end, 24)]
    avg_dr_load = _peak_2h_avg(dr_slice) if dr_slice else scenario.peak_kw * 0.6

    gen_offset = scenario.existing_gen_kw * (0.9 if scenario.gen_paralleled else 0.0)

    # Existing solar average over DR window
    existing_solar_dr_avg = 0.0
    if dr_slice and scenario.existing_solar_kw > 0:
        for i, _ in enumerate(dr_slice):
            h  = dr_start + i
            sf = math.sin(math.pi * (h - 6) / 12) * 0.88 if 6 <= h <= 18 else 0.0
            existing_solar_dr_avg += scenario.existing_solar_kw * sf
        existing_solar_dr_avg /= len(dr_slice)

    net_needed = max(0.0, avg_dr_load - gen_offset - existing_solar_dr_avg)

    solar_avail = 0.0
    if dr_slice:
        for i, _ in enumerate(dr_slice):
            h = dr_start + i
            solar_avail += math.sin(math.pi * (h - 6) / 12) * 0.85 if 6 <= h <= 18 else 0.0
        solar_avail /= len(dr_slice)

    return {
        "costMin": EnergyParams(
            self_solar=0,
            solar_ppa=round(net_needed * 0.20) if solar_avail > 0.25 else 0,
            wind_ppa=round(net_needed * 0.20)  if is_morning else 0,
            hydro_ppa=0,
            natgas=round(net_needed * (0.70 if is_daytime else 0.85)),
            sofc=0,
            bess=round(min(600, DR_DISPATCH_H * net_needed * 0.15)),
        ),
        "esg": EnergyParams(
            self_solar=0,
            solar_ppa=(
                round(net_needed * (0.60 if is_daytime else 0.30))
                if solar_avail > 0.15
                else round(net_needed * 0.15)
            ),
            wind_ppa=round(net_needed * (0.15 if is_daytime else 0.45)),
            hydro_ppa=round(net_needed * 0.20),
            natgas=0,
            sofc=0,
            bess=min(2000, round(DR_DISPATCH_H * net_needed * 0.90)),
        ),
        "lowCarbon": EnergyParams(
            self_solar=0,
            solar_ppa=(
                round(net_needed * (0.25 if is_daytime else 0.12))
                if solar_avail > 0.15
                else 0
            ),
            wind_ppa=round(net_needed * (0.15 if is_daytime else 0.38)),
            hydro_ppa=round(net_needed * 0.13),
            natgas=0,
            sofc=round(net_needed * 0.60),
            bess=min(2000, round(DR_DISPATCH_H * net_needed * 0.35)),
        ),
    }


# ── Hourly Simulation ──────────────────────────────────────────────────────────

def generate_hourly_data(
    p: EnergyParams,
    dr_start: int,
    dr_end: int,
    load_profile: list[float],
    scenario: Scenario,
) -> list[HourlyPoint]:
    points: list[HourlyPoint] = []
    pre_ramp = 2
    dr_dispatch_end = min(dr_start + DR_DISPATCH_H, dr_end)

    for h in range(25):
        hour      = h % 24
        base_load = load_profile[hour]

        is_dr       = dr_start <= hour < dr_end
        near_dr     = dr_start - 1 <= hour < dr_end + 1
        in_dispatch = dr_start <= hour < dr_dispatch_end

        sf = _solar_factor(hour)

        # Existing paralleled gen (2h dispatch limit)
        existing_gen = 0.0
        if scenario.gen_paralleled and scenario.existing_gen_kw > 0:
            if in_dispatch:
                existing_gen = scenario.existing_gen_kw * 0.92
            elif near_dr:
                existing_gen = scenario.existing_gen_kw * 0.55
            else:
                existing_gen = scenario.existing_gen_kw * 0.28

        existing_solar = scenario.existing_solar_kw * sf * 0.88

        self_solar = p.self_solar * sf * 0.90
        solar_ppa  = p.solar_ppa  * sf * 0.85

        wind_factor = max(0.30, 0.65 + 0.20 * math.cos(math.pi * hour / 12) + 0.15 * math.sin(math.pi * hour / 6))
        wind_ppa    = p.wind_ppa  * wind_factor
        hydro_ppa   = p.hydro_ppa * (0.88 + 0.05 * math.sin(math.pi * hour / 12))

        # natgas: DR-only peaker
        if in_dispatch:
            natgas_f = 1.00
        elif is_dr:
            natgas_f = 0.12
        elif near_dr:
            natgas_f = 0.15
        else:
            natgas_f = 0.0
        natgas = p.natgas * natgas_f

        # SOFC: continuous baseload, ramps up during dispatch
        if in_dispatch:
            sofc_f = 0.95
        elif is_dr:
            sofc_f = 0.40
        else:
            sofc_f = 0.82
        sofc = p.sofc * sofc_f

        # BESS: discharged during 2h dispatch window
        bess = 0.0
        if in_dispatch:
            bess = p.bess * 0.90
        elif is_dr:
            bess = p.bess * 0.08
        elif dr_start - pre_ramp <= hour < dr_start:
            bess = p.bess * 0.35 * ((hour - (dr_start - pre_ramp)) / pre_ramp)
        elif dr_end <= hour < dr_end + 1:
            bess = p.bess * 0.05

        total_supply = (existing_gen + existing_solar + bess + self_solar
                        + solar_ppa + wind_ppa + hydro_ppa + sofc + natgas)
        grid = max(0.0, base_load - total_supply)

        points.append(HourlyPoint(
            hour=h,
            existing_gen=existing_gen, existing_solar=existing_solar,
            bess=bess, self_solar=self_solar, solar_ppa=solar_ppa,
            wind_ppa=wind_ppa, hydro_ppa=hydro_ppa, sofc=sofc,
            natgas=natgas, grid=grid,
        ))
    return points


# ── KPI Calculation ────────────────────────────────────────────────────────────

def calculate_kpis(p: EnergyParams, data: list[HourlyPoint], dr: DRPeriod, scenario: Scenario) -> KPIs:
    capex = sum(getattr(p, k) * v for k, v in CAPEX_UNIT.items())

    dr_dispatch_hours = min(DR_DISPATCH_H, dr.end - dr.start)
    dr_capacity = min(
        p.natgas * 0.5 + (p.bess / DR_DISPATCH_H) * 0.90 + p.sofc * 0.6,
        scenario.peak_kw * 0.35,
    )
    dr_revenue = dr_capacity * dr_dispatch_hours * dr.events_per_year * 5 * dr.rate_multiplier

    total_load_kwh = sum(scenario.load_profile)
    clean_hourly = sum(
        d.self_solar + d.solar_ppa + d.wind_ppa + d.hydro_ppa
        + d.bess * 0.85 + d.existing_solar
        for d in data[:24]
    )
    cfe_rate = min(1.0, clean_hourly / total_load_kwh) if total_load_kwh > 0 else 0.0

    yr = 365
    carbon = (
        sum(d.grid        for d in data[:24]) * yr * 0.494 +
        sum(d.natgas      for d in data[:24]) * yr * 0.202 +
        sum(d.sofc        for d in data[:24]) * yr * 0.126 +
        sum(d.existing_gen for d in data[:24]) * yr * 0.202
    ) / 1000

    return KPIs(capex=capex, dr_revenue=dr_revenue, cfe_rate=cfe_rate, carbon=carbon)


# ── AI Text Generation ─────────────────────────────────────────────────────────

def _build_ai_text_template(
    objective: str,
    dr: DRPeriod,
    scenario: Scenario,
    load_pct: int,
) -> str:
    is_daytime  = 10 <= dr.start <= 16
    dispatch_str = f"{dr.start}:00–{dr.start + DR_DISPATCH_H}:00"
    align_note  = f"此時段與貴廠用電尖峰吻合度 {load_pct}%，"

    parts = []
    if scenario.existing_gen_kw > 0:
        label = "並聯機組" if scenario.gen_paralleled else "備用機組"
        parts.append(f"現有 {int(scenario.existing_gen_kw)} kW {label}")
    if scenario.existing_solar_kw > 0:
        parts.append(f"既有 {int(scenario.existing_solar_kw)} kW 太陽能自發自用")
    gen_note = f"（{'・'.join(parts)}）" if parts else ""

    if objective == "costMin":
        return (
            f"【財務最大化・{dr.label}】{gen_note}{align_note}"
            f"天然氣機組於 DR 調度 {dispatch_str} 滿載供電（{DR_DISPATCH_H}h 調度上限），"
            "其後維持低載待機；BESS 同步釋能補充峰值缺口。"
            "以最低邊際成本最大化需量反應收益，整體碳排偏高。"
        )
    if objective == "esg":
        if is_daytime:
            return (
                f"【ESG 絕對優先・日峰】{gen_note}{align_note}"
                f"白天充裕太陽能 PPA 全程供電；BESS 蓄滿後於 {dispatch_str} DR 調度期間完全釋能"
                f"（{DR_DISPATCH_H}h 上限）。全程零天然氣，CFE 達成率近 100%，CAPEX 較高為必要代價。"
            )
        return (
            f"【ESG 絕對優先・夜峰】{gen_note}{align_note}"
            f"大容量 BESS 於日間利用太陽能充電，DR 調度 {dispatch_str} 期間完全釋能"
            f"（{DR_DISPATCH_H}h 上限）。風力 PPA 提供夜間潔淨基載，全程零化石燃料。"
        )
    # lowCarbon
    return (
        f"【碳排最小化・{dr.label}】{gen_note}{align_note}"
        f"SOFC 高效燃料電池（效率 60%+，碳強度低於天然氣 40%）於 {dispatch_str} 滿載運轉"
        f"（{DR_DISPATCH_H}h 調度上限），其後降載維持基載；BESS 協同削峰。"
        "風力 PPA 補充夜間潔淨電力。"
    )


async def _call_claude(prompt: str) -> str | None:
    """Call Anthropic Claude to generate an enhanced explanation. Returns None on failure."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("Claude API call failed, falling back to template: %s", exc)
        return None


async def get_ai_text(
    objective: str,
    dr: DRPeriod,
    scenario: Scenario,
    load_pct: int,
    params: EnergyParams,
    kpis: KPIs,
) -> str:
    template = _build_ai_text_template(objective, dr, scenario, load_pct)

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return template

    obj_map = {"costMin": "財務最大化", "esg": "ESG 絕對優先", "lowCarbon": "碳排最小化"}
    obj_label = obj_map.get(objective, objective)

    prompt = (
        f"你是一位台灣電力需量反應（DR）投資顧問，用繁體中文回答。\n"
        f"客戶場景：{scenario.label}，峰值 {scenario.peak_kw:.0f} kW，"
        f"優化目標：{obj_label}。\n"
        f"建議 DR 時段：{dr.label}（{dr.label_sub}），"
        f"與客戶用電尖峰吻合度 {load_pct}%。\n"
        f"資產配置：天然氣 {params.natgas:.0f} kW、SOFC {params.sofc:.0f} kW、"
        f"BESS {params.bess:.0f} kWh、太陽能PPA {params.solar_ppa:.0f} kW、"
        f"風力PPA {params.wind_ppa:.0f} kW。\n"
        f"預估年度 DR 收益 {kpis.dr_revenue/10_000:.0f} 萬元，"
        f"CFE {kpis.cfe_rate*100:.1f}%，碳排 {kpis.carbon:.0f} tCO₂e，"
        f"CAPEX {kpis.capex/10_000:.0f} 萬元。\n\n"
        "請用 2–3 句話給出具體、專業的投資建議說明（直接輸出說明文字，不加標題或前綴）。"
    )

    enhanced = await _call_claude(prompt)
    return enhanced if enhanced else template


# ── Main Scoring Function ──────────────────────────────────────────────────────

async def compute_dr_scores(
    objective: Literal["costMin", "esg", "lowCarbon"],
    scenario: Scenario,
) -> list[DRScore]:
    results: list[DRScore] = []

    for dr in DR_PRESETS:
        dr_slice = scenario.load_profile[dr.start: min(dr.end, 24)]
        peak2h   = _peak_2h_avg(dr_slice)
        load_alignment = min(1.0, peak2h / scenario.peak_kw) if scenario.peak_kw > 0 else 0.5
        load_pct = round(load_alignment * 100)

        presets  = get_dynamic_presets(dr.start, dr.end, scenario)
        p        = presets[objective]
        data     = generate_hourly_data(p, dr.start, dr.end, scenario.load_profile, scenario)
        kpis     = calculate_kpis(p, data, dr, scenario)

        if objective == "costMin":
            score = kpis.dr_revenue * (0.3 + 0.7 * load_alignment) - kpis.capex / 20
            value_label = (
                f"DR {kpis.dr_revenue/1_000_000:.1f}M/年"
                if kpis.dr_revenue >= 1_000_000
                else f"DR {kpis.dr_revenue/10_000:.0f} 萬/年"
            )
        elif objective == "esg":
            score = kpis.cfe_rate * 100 - kpis.capex / 5_000_000
            value_label = f"CFE {kpis.cfe_rate * 100:.1f}%"
        else:
            score = (-kpis.carbon + kpis.dr_revenue / 300_000) * (0.4 + 0.6 * load_alignment)
            value_label = f"{round(kpis.carbon):,} tCO₂e"

        ai_text = await get_ai_text(objective, dr, scenario, load_pct, p, kpis)

        results.append(DRScore(
            dr=dr,
            score=score,
            value_label=value_label,
            load_pct=load_pct,
            params=p,
            hourly_data=data,
            kpis=kpis,
            ai_text=ai_text,
        ))

    results.sort(key=lambda x: x.score, reverse=True)
    return results
