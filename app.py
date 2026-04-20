"""
DDEAR MVP — Energy Digital Twin Sandbox
用電數位孿生沙盒：動態模擬能源資產投資效益
"""
import uuid
import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

from core.tariff import TARIFF_RATES, DEMAND_CHARGE_NTD_PER_KW, CARBON_FACTOR_KG_PER_KWH
from core.simulator import simulate_scenario
from core.roi import calculate_roi
from assets.asset_models import (
    solar_profile, wind_profile, hydro_profile,
    hvac_savings_profile, ev_charging_profile, ASSET_REGISTRY,
)
from utils.data_generator import generate_sample_load, parse_interval_csv

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="DDEAR — Energy Digital Twin",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── CSS ──────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  .metric-card { background:#1e1e2e; border-radius:12px; padding:16px; margin:4px 0; }
  .asset-tag   { display:inline-block; padding:4px 10px; border-radius:20px;
                 font-size:13px; font-weight:600; margin:2px; }
  .section-title { font-size:18px; font-weight:700; color:#c9d1d9; margin:12px 0 4px; }
  div[data-testid="stMetricDelta"] > div { font-size: 13px; }
</style>
""", unsafe_allow_html=True)

# ─── Session State Init ────────────────────────────────────────────────────────
def _init():
    defaults = {
        "baseline_load": None,
        "assets": [],               # list of asset dicts
        "sim": None,                # latest simulation results
        "tariff_rates": TARIFF_RATES,
        "demand_charge": DEMAND_CHARGE_NTD_PER_KW,
        "discount_rate": 0.05,
        "project_years": 20,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init()


# ─── Helpers ──────────────────────────────────────────────────────────────────
def run_simulation():
    if st.session_state.baseline_load is None:
        st.session_state.sim = None
        return
    st.session_state.sim = simulate_scenario(
        st.session_state.baseline_load,
        st.session_state.assets,
        st.session_state.tariff_rates,
        st.session_state.demand_charge,
    )


def _fmt_ntd(v: float) -> str:
    if abs(v) >= 1e6:
        return f"NT$ {v/1e6:.2f}M"
    return f"NT$ {v:,.0f}"


def _color(val, positive_good=True):
    if val == 0:
        return "off"
    return "normal" if (val > 0) == positive_good else "inverse"


def _build_asset_profile(atype: str, params: dict,
                          index: pd.DatetimeIndex,
                          baseline_load: pd.Series) -> pd.Series:
    cap = params.get("capacity_kw", 100)
    if atype in ("solar_self", "solar_purchase"):
        return solar_profile(index, cap)
    elif atype == "wind":
        return wind_profile(index, cap, params.get("capacity_factor", 0.30))
    elif atype == "hydro":
        return hydro_profile(index, cap)
    elif atype == "hvac":
        return hvac_savings_profile(index, baseline_load, params.get("efficiency_gain", 0.15))
    elif atype == "storage":
        return pd.Series(0.0, index=index)  # handled internally by simulator
    elif atype == "ev":
        return ev_charging_profile(
            index,
            num_chargers=params.get("num_chargers", 5),
            charger_kw=params.get("charger_kw", 22),
            smart=params.get("smart_charging", True),
        )
    return pd.Series(0.0, index=index)


# ─── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ⚡ DDEAR 能源沙盒")
    st.markdown("---")

    # ── Data Loading ──────────────────────────────────────────────────────────
    st.markdown("### 📂 基準資料")
    data_source = st.radio("資料來源", ["使用示範資料", "上傳 CSV"], horizontal=True)

    if data_source == "使用示範資料":
        col1, col2 = st.columns(2)
        with col1:
            peak_kw = st.number_input("尖峰需量 (kW)", 200, 10000, 1000, step=100)
        with col2:
            year = st.selectbox("年份", [2023, 2024, 2025], index=1)

        if st.button("載入示範資料", use_container_width=True, type="primary"):
            with st.spinner("產生示範負載曲線…"):
                st.session_state.baseline_load = generate_sample_load(year, peak_kw)
            run_simulation()
            st.success("示範資料已載入！")

    else:
        uploaded = st.file_uploader(
            "上傳 15 分鐘用電 CSV（欄位：timestamp, load_kw）",
            type=["csv"]
        )
        if uploaded:
            load = parse_interval_csv(uploaded)
            if load is not None:
                st.session_state.baseline_load = load
                run_simulation()
                st.success(f"已載入 {len(load):,} 筆資料")
            else:
                st.error("CSV 格式錯誤，請確認欄位為 timestamp, load_kw")

    # ── Tariff Config ─────────────────────────────────────────────────────────
    with st.expander("⚙️ 電費費率設定", expanded=False):
        st.caption("台電高壓時間電價 (NT$/kWh)")
        col1, col2 = st.columns(2)
        with col1:
            s_peak = st.number_input("夏季尖峰", 3.0, 12.0, 6.07, 0.01)
            s_semi = st.number_input("夏季半尖峰", 1.5, 8.0, 3.29, 0.01)
            s_off  = st.number_input("夏季離峰", 0.5, 4.0, 1.56, 0.01)
        with col2:
            n_peak = st.number_input("非夏季尖峰", 2.0, 10.0, 4.27, 0.01)
            n_semi = st.number_input("非夏季半尖峰", 1.0, 6.0, 2.49, 0.01)
            n_off  = st.number_input("非夏季離峰", 0.5, 4.0, 1.56, 0.01)
        demand_ch = st.number_input("基本電費 (NT$/kW/月)", 100, 600, 290, 1)

        if st.button("更新費率", use_container_width=True):
            st.session_state.tariff_rates = {
                "summer": {"peak": s_peak, "semi_peak": s_semi, "off_peak": s_off},
                "non_summer": {"peak": n_peak, "semi_peak": n_semi, "off_peak": n_off},
            }
            st.session_state.demand_charge = float(demand_ch)
            run_simulation()

    st.markdown("---")

    # ── Asset Management ──────────────────────────────────────────────────────
    st.markdown("### 🏭 新增能源資產")

    if st.session_state.baseline_load is None:
        st.info("請先載入基準資料")
    else:
        atype = st.selectbox(
            "資產類型",
            list(ASSET_REGISTRY.keys()),
            format_func=lambda k: ASSET_REGISTRY[k]["label"],
        )
        info = ASSET_REGISTRY[atype]
        st.caption(f"單位：{info['unit']}")

        params: dict = {}

        if atype in ("solar_self", "solar_purchase"):
            params["capacity_kw"] = st.slider("裝置容量 (kWp)", 10, 5000, 200, 10)
            capex_per_kw = st.number_input("造價 (NT$/kWp)", 10000, 80000, 35000, 1000)
            params["capex_ntd"] = params["capacity_kw"] * capex_per_kw
            params["annual_om_ntd"] = params["capex_ntd"] * 0.015

        elif atype == "wind":
            params["capacity_kw"] = st.slider("裝置容量 (kW)", 100, 10000, 500, 100)
            params["capacity_factor"] = st.slider("容量因子", 0.20, 0.50, 0.30, 0.01)
            capex_per_kw = st.number_input("造價 (NT$/kW)", 30000, 150000, 70000, 5000)
            params["capex_ntd"] = params["capacity_kw"] * capex_per_kw
            params["annual_om_ntd"] = params["capex_ntd"] * 0.02

        elif atype == "hydro":
            params["capacity_kw"] = st.slider("裝置容量 (kW)", 50, 5000, 300, 50)
            capex_per_kw = st.number_input("造價 (NT$/kW)", 40000, 200000, 90000, 5000)
            params["capex_ntd"] = params["capacity_kw"] * capex_per_kw
            params["annual_om_ntd"] = params["capex_ntd"] * 0.025

        elif atype == "hvac":
            params["efficiency_gain"] = st.slider("效率提升幅度", 0.05, 0.40, 0.15, 0.01,
                                                    format="%.0f%%",
                                                    help="COP 改善後節省的空調用電比例")
            params["capacity_kw"] = 0
            capex_total = st.number_input("設備投資 (NT$)", 500000, 50000000, 3000000, 100000)
            params["capex_ntd"] = float(capex_total)
            params["annual_om_ntd"] = capex_total * 0.01

        elif atype == "storage":
            params["capacity_kwh"] = st.slider("儲能容量 (kWh)", 100, 10000, 1000, 100)
            params["power_kw"] = st.slider("額定功率 (kW)", 50, 5000, 500, 50)
            params["efficiency"] = st.slider("往返效率", 0.80, 0.97, 0.92, 0.01)
            params["capacity_kw"] = params["power_kw"]
            capex_per_kwh = st.number_input("造價 (NT$/kWh)", 8000, 40000, 15000, 1000)
            params["capex_ntd"] = params["capacity_kwh"] * capex_per_kwh
            params["annual_om_ntd"] = params["capex_ntd"] * 0.02

        elif atype == "ev":
            params["num_chargers"] = st.slider("充電樁數量", 1, 100, 10)
            params["charger_kw"] = st.selectbox("單樁功率 (kW)", [7.4, 11, 22, 50, 120], index=2)
            params["smart_charging"] = st.toggle("智慧排程充電", value=True)
            params["capacity_kw"] = params["num_chargers"] * params["charger_kw"]
            capex_per = st.number_input("每樁造價 (NT$)", 30000, 500000, 80000, 10000)
            params["capex_ntd"] = params["num_chargers"] * capex_per
            params["annual_om_ntd"] = params["capex_ntd"] * 0.03

        asset_name = st.text_input("資產名稱（選填）",
                                    value=f"{info['label']} #{len(st.session_state.assets)+1}")

        if st.button("➕ 加入沙盒", use_container_width=True, type="primary"):
            idx = st.session_state.baseline_load.index
            profile = _build_asset_profile(atype, params, idx, st.session_state.baseline_load)
            asset = {
                "id": str(uuid.uuid4())[:8],
                "name": asset_name,
                "type": atype,
                "profile": profile,
                "capex_ntd": params.get("capex_ntd", 0),
                "annual_om_ntd": params.get("annual_om_ntd", 0),
                "params": params,
                "color": info["color"],
            }
            st.session_state.assets.append(asset)
            run_simulation()
            st.success(f"已加入：{asset_name}")

    # ── Asset List ────────────────────────────────────────────────────────────
    if st.session_state.assets:
        st.markdown("---")
        st.markdown("### 🗂️ 沙盒資產列表")
        for i, a in enumerate(st.session_state.assets):
            col_n, col_x = st.columns([5, 1])
            with col_n:
                st.markdown(
                    f'<span class="asset-tag" style="background:{a["color"]}22;'
                    f'color:{a["color"]};border:1px solid {a["color"]}44">'
                    f'{a["name"]}</span>',
                    unsafe_allow_html=True,
                )
            with col_x:
                if st.button("✕", key=f"del_{a['id']}", help="移除此資產"):
                    st.session_state.assets.pop(i)
                    run_simulation()
                    st.rerun()

        if st.button("🗑️ 清空所有資產", use_container_width=True):
            st.session_state.assets = []
            run_simulation()
            st.rerun()

    # ── ROI Config ────────────────────────────────────────────────────────────
    with st.expander("📊 財務分析設定", expanded=False):
        st.session_state.discount_rate = st.slider(
            "折現率 (WACC)", 0.01, 0.15, 0.05, 0.01, format="%.0f%%"
        )
        st.session_state.project_years = st.slider("分析年限 (年)", 5, 30, 20)


# ─── Main Content ─────────────────────────────────────────────────────────────
if st.session_state.baseline_load is None:
    # Welcome screen
    st.markdown("## ⚡ DDEAR 能源數位孿生沙盒")
    st.markdown("""
    **Dynamic Digital Energy Asset ROI**

    透過數位孿生技術，模擬不同能源資產組合對企業用電成本、再生能源比例及碳排放的影響，
    協助決策者快速評估投資回本期 (ROI)。

    ---
    #### 快速開始
    1. 在左側側欄選擇「使用示範資料」或上傳您的 15 分鐘用電 CSV
    2. 點擊「載入示範資料」建立基準
    3. 在「新增能源資產」區域加入太陽能、儲能、風力等資產
    4. 即時查看沙盒模擬結果

    ---
    #### 支援資產類型
    """)
    cols = st.columns(4)
    for i, (k, v) in enumerate(ASSET_REGISTRY.items()):
        with cols[i % 4]:
            st.markdown(
                f'<div style="background:{v["color"]}22;border:1px solid {v["color"]}44;'
                f'border-radius:8px;padding:8px;text-align:center;margin:4px;">'
                f'<b>{v["label"]}</b></div>',
                unsafe_allow_html=True,
            )
    st.stop()

# ─── Dashboard ────────────────────────────────────────────────────────────────
baseline = st.session_state.baseline_load
sim = st.session_state.sim
assets = st.session_state.assets

st.markdown("## ⚡ DDEAR 能源數位孿生沙盒")

# ── KPI Header ────────────────────────────────────────────────────────────────
if sim:
    savings = sim["annual_savings"]
    re_ratio = sim["re_ratio"]
    carbon_red = sim["carbon_reduction_tons"]
    capex = sim["total_capex"]

    roi_result = calculate_roi(
        savings,
        capex,
        sim["total_annual_om"],
        st.session_state.project_years,
        st.session_state.discount_rate,
    )
    payback = roi_result["payback_years"]

    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric(
        "年度電費節省",
        _fmt_ntd(savings),
        f"{'↓' if savings > 0 else '↑'} {abs(savings / max(sim['baseline_annual_cost'], 1)):.1%}",
        delta_color="normal" if savings > 0 else "inverse",
    )
    k2.metric(
        "再生能源比例",
        f"{re_ratio:.1%}",
        f"+{re_ratio:.1%}" if re_ratio > 0 else "無變化",
        delta_color="normal" if re_ratio > 0 else "off",
    )
    k3.metric(
        "年減碳量",
        f"{carbon_red:.1f} tCO₂e",
        f"-{carbon_red / max(sim['baseline_carbon_tons'], 1):.1%}" if carbon_red > 0 else "",
        delta_color="normal" if carbon_red > 0 else "off",
    )
    k4.metric(
        "總投資金額",
        _fmt_ntd(capex),
    )
    k5.metric(
        "回本年限",
        f"{payback:.1f} 年" if payback != float("inf") else "—",
        f"NPV {_fmt_ntd(roi_result['npv'])}",
        delta_color="normal" if roi_result["npv"] > 0 else "inverse",
    )

st.markdown("---")

# ── Tabs ──────────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4, tab5 = st.tabs(
    ["📊 總覽", "⚡ 用電曲線", "💰 電費分析", "🌱 減碳分析", "📈 ROI 回本"]
)

# ── Tab 1: Overview ───────────────────────────────────────────────────────────
with tab1:
    if not assets:
        st.info("👈 從左側側欄新增能源資產，開始沙盒模擬")

    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.markdown('<div class="section-title">年度電費比較</div>', unsafe_allow_html=True)
        if sim:
            fig = go.Figure()
            labels = ["基準 (現況)", "模擬 (加入資產後)"]
            values = [sim["baseline_annual_cost"], sim["scenario_annual_cost"]]
            colors = ["#4361ee", "#06d6a0"]
            fig.add_trace(go.Bar(
                x=labels, y=values,
                marker_color=colors,
                text=[_fmt_ntd(v) for v in values],
                textposition="outside",
            ))
            fig.update_layout(
                height=320, margin=dict(t=20, b=20, l=10, r=10),
                yaxis_title="NT$/年", showlegend=False,
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            )
            st.plotly_chart(fig, use_container_width=True)

    with col_right:
        st.markdown('<div class="section-title">能源結構（模擬後）</div>', unsafe_allow_html=True)
        if sim and assets:
            re_kwh = sim["re_kwh"]
            grid_kwh = sim["net_load_kwh"]
            total = re_kwh + grid_kwh
            fig2 = go.Figure(go.Pie(
                labels=["再生能源 (RE)", "台電用電"],
                values=[re_kwh, grid_kwh],
                hole=0.55,
                marker_colors=["#06d6a0", "#4361ee"],
                textinfo="label+percent",
            ))
            fig2.add_annotation(text=f"RE<br>{re_ratio:.0%}", x=0.5, y=0.5,
                                 font_size=18, showarrow=False)
            fig2.update_layout(
                height=320, margin=dict(t=20, b=20, l=10, r=10),
                showlegend=True,
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            )
            st.plotly_chart(fig2, use_container_width=True)
        elif not assets:
            st.markdown("_新增資產後顯示_")

    # Monthly comparison table
    if sim:
        st.markdown('<div class="section-title">逐月成本比較</div>', unsafe_allow_html=True)
        bm = sim["baseline_monthly"].copy()
        sm = sim["scenario_monthly"].copy()
        compare = pd.DataFrame({
            "月份": [str(p) for p in bm.index],
            "基準電費 (NT$)": bm["total_cost"].round(0).astype(int),
            "模擬電費 (NT$)": sm["total_cost"].round(0).astype(int),
            "節省 (NT$)": (bm["total_cost"] - sm["total_cost"]).round(0).astype(int),
            "節省 %": ((bm["total_cost"] - sm["total_cost"]) / bm["total_cost"] * 100).round(1),
        })
        def _color_savings(val):
            return "color: #06d6a0" if isinstance(val, (int, float)) and val > 0 else ""

        st.dataframe(
            compare.style.applymap(_color_savings, subset=["節省 (NT$)", "節省 %"]),
            use_container_width=True, hide_index=True,
        )


# ── Tab 2: Load Profile ───────────────────────────────────────────────────────
with tab2:
    st.markdown('<div class="section-title">典型週用電曲線</div>', unsafe_allow_html=True)

    # Show a representative week (first full week of July = summer peak)
    sample_week = baseline["2024-07-01":"2024-07-07"]
    if len(sample_week) == 0:
        sample_week = baseline.iloc[:7*96]

    fig_load = go.Figure()
    fig_load.add_trace(go.Scatter(
        x=sample_week.index, y=sample_week.values,
        name="基準負載", line=dict(color="#4361ee", width=2), fill="tozeroy",
        fillcolor="rgba(67,97,238,0.1)",
    ))

    if sim and assets:
        net_week = sim["net_load"].loc[sample_week.index]
        fig_load.add_trace(go.Scatter(
            x=net_week.index, y=net_week.values,
            name="模擬後淨負載", line=dict(color="#06d6a0", width=2, dash="dash"),
        ))
        re_week = sim["re_generation"].loc[sample_week.index]
        if re_week.sum() > 0:
            fig_load.add_trace(go.Scatter(
                x=re_week.index, y=re_week.values,
                name="RE 發電量", line=dict(color="#f9c74f", width=1.5),
                fill="tozeroy", fillcolor="rgba(249,199,79,0.15)",
            ))

    fig_load.update_layout(
        height=400, xaxis_title="時間", yaxis_title="kW",
        legend=dict(orientation="h", y=1.02),
        plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
        hovermode="x unified",
    )
    st.plotly_chart(fig_load, use_container_width=True)

    # Monthly heatmap — avg load per hour
    st.markdown('<div class="section-title">月平均用電熱圖 (kW)</div>', unsafe_allow_html=True)
    df_heat = baseline.to_frame()
    df_heat["hour"] = df_heat.index.hour
    df_heat["month"] = df_heat.index.month
    pivot = df_heat.groupby(["month", "hour"])["load_kw"].mean().unstack(level=1)

    month_labels = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"]
    fig_heat = px.imshow(
        pivot.values,
        x=[f"{h:02d}:00" for h in range(24)],
        y=month_labels[:len(pivot)],
        color_continuous_scale="RdYlGn_r",
        aspect="auto",
        labels=dict(x="小時", y="月份", color="kW"),
    )
    fig_heat.update_layout(height=320, margin=dict(t=20, b=20),
                            plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
    st.plotly_chart(fig_heat, use_container_width=True)


# ── Tab 3: Cost Analysis ──────────────────────────────────────────────────────
with tab3:
    if sim is None:
        st.info("請先載入資料")
    else:
        col_a, col_b = st.columns(2)

        with col_a:
            st.markdown('<div class="section-title">年度電費組成瀑布圖</div>', unsafe_allow_html=True)
            bm = sim["baseline_monthly"]
            sm = sim["scenario_monthly"]

            items = [
                ("基準電費", sim["baseline_annual_cost"], ""),
                ("流動電費節省", -(sm["energy_cost"].sum() - bm["energy_cost"].sum()), "decreasing"),
                ("基本電費節省", -(sm["demand_cost"].sum() - bm["demand_cost"].sum()), "decreasing"),
                ("餘電收入", sim["export_revenue"], "relative"),
                ("O&M 成本", -sim["total_annual_om"], "relative"),
                ("模擬後電費", sim["scenario_annual_cost"], "total"),
            ]
            measures = [x[2] if x[2] else "relative" for x in items]
            measures[0] = "absolute"
            measures[-1] = "total"

            fig_wf = go.Figure(go.Waterfall(
                name="電費", orientation="v",
                measure=measures,
                x=[x[0] for x in items],
                y=[x[1] for x in items],
                connector={"line": {"color": "rgb(63, 63, 63)"}},
                decreasing={"marker": {"color": "#06d6a0"}},
                increasing={"marker": {"color": "#ef233c"}},
                totals={"marker": {"color": "#4361ee"}},
                text=[_fmt_ntd(x[1]) for x in items],
                textposition="outside",
            ))
            fig_wf.update_layout(
                height=400, yaxis_title="NT$",
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
                margin=dict(t=20, b=20),
            )
            st.plotly_chart(fig_wf, use_container_width=True)

        with col_b:
            st.markdown('<div class="section-title">逐月電費對比</div>', unsafe_allow_html=True)
            months = [str(p) for p in bm.index]
            fig_bar = go.Figure()
            fig_bar.add_trace(go.Bar(name="基準", x=months, y=bm["total_cost"],
                                     marker_color="#4361ee"))
            fig_bar.add_trace(go.Bar(name="模擬後", x=months, y=sm["total_cost"],
                                     marker_color="#06d6a0"))
            fig_bar.update_layout(
                barmode="group", height=400, yaxis_title="NT$",
                legend=dict(orientation="h", y=1.02),
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
                margin=dict(t=30, b=20),
            )
            st.plotly_chart(fig_bar, use_container_width=True)

        # TOU breakdown
        st.markdown('<div class="section-title">尖離峰電費結構 (模擬後)</div>', unsafe_allow_html=True)
        tou_data = {
            "時段": ["尖峰", "半尖峰", "離峰"],
            "基準用電量 (kWh)": [
                bm["peak_kwh"].sum(), bm["semi_kwh"].sum(), bm["offpeak_kwh"].sum()
            ],
            "模擬後用電量 (kWh)": [
                sm["peak_kwh"].sum(), sm["semi_kwh"].sum(), sm["offpeak_kwh"].sum()
            ],
        }
        df_tou = pd.DataFrame(tou_data)
        df_tou["削減量 (kWh)"] = df_tou["基準用電量 (kWh)"] - df_tou["模擬後用電量 (kWh)"]
        df_tou["削減 %"] = (df_tou["削減量 (kWh)"] / df_tou["基準用電量 (kWh)"] * 100).round(1)
        st.dataframe(df_tou.style.format({
            "基準用電量 (kWh)": "{:,.0f}",
            "模擬後用電量 (kWh)": "{:,.0f}",
            "削減量 (kWh)": "{:,.0f}",
            "削減 %": "{:.1f}%",
        }), use_container_width=True, hide_index=True)


# ── Tab 4: Carbon ─────────────────────────────────────────────────────────────
with tab4:
    if sim is None:
        st.info("請先載入資料")
    else:
        col_c1, col_c2 = st.columns([1, 1])

        with col_c1:
            st.markdown('<div class="section-title">年度碳排放量比較</div>', unsafe_allow_html=True)
            fig_carbon = go.Figure()
            fig_carbon.add_trace(go.Bar(
                x=["基準碳排", "模擬後碳排"],
                y=[sim["baseline_carbon_tons"], sim["scenario_carbon_tons"]],
                marker_color=["#ef233c", "#06d6a0"],
                text=[f"{v:,.1f} tCO₂e" for v in
                      [sim["baseline_carbon_tons"], sim["scenario_carbon_tons"]]],
                textposition="outside",
            ))
            fig_carbon.update_layout(
                height=340, yaxis_title="公噸 CO₂e", showlegend=False,
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
                margin=dict(t=30, b=20),
            )
            st.plotly_chart(fig_carbon, use_container_width=True)

        with col_c2:
            st.markdown('<div class="section-title">減碳效益</div>', unsafe_allow_html=True)
            carbon_red = sim["carbon_reduction_tons"]
            carbon_pct = carbon_red / sim["baseline_carbon_tons"] * 100
            re_ratio = sim["re_ratio"]

            m1, m2 = st.columns(2)
            m1.metric("年減碳量", f"{carbon_red:.1f} tCO₂e",
                       f"-{carbon_pct:.1f}%", delta_color="normal")
            m2.metric("RE 比例", f"{re_ratio:.1%}",
                       f"目標 100%", delta_color="off")

            # Gauge chart
            fig_gauge = go.Figure(go.Indicator(
                mode="gauge+number+delta",
                value=re_ratio * 100,
                title={"text": "再生能源比例 (%)"},
                delta={"reference": 0, "valueformat": ".1f"},
                gauge={
                    "axis": {"range": [0, 100]},
                    "bar": {"color": "#06d6a0"},
                    "steps": [
                        {"range": [0, 30], "color": "#fee2e2"},
                        {"range": [30, 60], "color": "#fef9c3"},
                        {"range": [60, 100], "color": "#dcfce7"},
                    ],
                    "threshold": {
                        "line": {"color": "orange", "width": 3},
                        "value": 50,
                    },
                },
            ))
            fig_gauge.update_layout(
                height=260, margin=dict(t=30, b=10),
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            )
            st.plotly_chart(fig_gauge, use_container_width=True)

        # Equivalence
        st.markdown('<div class="section-title">減碳相當於…</div>', unsafe_allow_html=True)
        eq_col1, eq_col2, eq_col3 = st.columns(3)
        eq_col1.metric("🚗 減少汽車行駛", f"{carbon_red * 4500:,.0f} km",
                        help="每公噸CO₂e ≈ 4,500 公里")
        eq_col2.metric("🌳 種植樹木", f"{carbon_red * 55:,.0f} 棵/年",
                        help="每棵樹每年吸收約 18 kg CO₂")
        eq_col3.metric("✈️ 減少飛行", f"{carbon_red * 0.9:,.1f} 趟",
                        help="台北-東京 來回 ≈ 1.1 tCO₂e")


# ── Tab 5: ROI ────────────────────────────────────────────────────────────────
with tab5:
    if sim is None or sim["total_capex"] == 0:
        st.info("請先在沙盒中新增資產以計算 ROI")
    else:
        roi = calculate_roi(
            sim["annual_savings"],
            sim["total_capex"],
            sim["total_annual_om"],
            st.session_state.project_years,
            st.session_state.discount_rate,
        )

        r1, r2, r3, r4 = st.columns(4)
        r1.metric("總投資 (CAPEX)", _fmt_ntd(sim["total_capex"]))
        r2.metric("年淨效益", _fmt_ntd(roi["net_annual_benefit"]),
                   delta_color="normal" if roi["net_annual_benefit"] > 0 else "inverse")
        r3.metric("NPV", _fmt_ntd(roi["npv"]),
                   delta_color="normal" if roi["npv"] > 0 else "inverse")
        irr_val = roi["irr"]
        r4.metric("IRR", f"{irr_val:.1%}" if irr_val else "N/A",
                   f"vs. WACC {st.session_state.discount_rate:.0%}",
                   delta_color="normal" if irr_val and irr_val > st.session_state.discount_rate else "inverse")

        st.markdown("---")
        st.markdown('<div class="section-title">累積現金流量圖</div>', unsafe_allow_html=True)

        years = list(range(st.session_state.project_years + 1))
        cumulative = roi["cumulative_cash_flows"]

        # Find payback crossing point
        payback_line = [0] * len(years)
        payback = roi["payback_years"]

        fig_cf = go.Figure()
        colors_cf = ["#ef233c" if v < 0 else "#06d6a0" for v in cumulative]
        fig_cf.add_trace(go.Bar(
            x=years, y=roi["cash_flows"],
            name="年度現金流", marker_color="#4361ee", opacity=0.6,
        ))
        fig_cf.add_trace(go.Scatter(
            x=years, y=cumulative,
            name="累積現金流", line=dict(color="#f9c74f", width=3),
            mode="lines+markers",
        ))
        fig_cf.add_hline(y=0, line=dict(color="white", dash="dash", width=1))
        if payback != float("inf") and payback <= st.session_state.project_years:
            fig_cf.add_vline(x=payback, line=dict(color="orange", dash="dot", width=2),
                              annotation_text=f"回本 {payback:.1f} 年",
                              annotation_position="top right")
        fig_cf.update_layout(
            height=420, xaxis_title="年", yaxis_title="NT$",
            legend=dict(orientation="h", y=1.02),
            plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            margin=dict(t=30, b=20),
            hovermode="x unified",
        )
        st.plotly_chart(fig_cf, use_container_width=True)

        # Asset-level breakdown
        if assets:
            st.markdown('<div class="section-title">資產投資明細</div>', unsafe_allow_html=True)
            asset_table = []
            for a in assets:
                info = ASSET_REGISTRY.get(a["type"], {})
                asset_table.append({
                    "資產名稱": a["name"],
                    "類型": info.get("label", a["type"]),
                    "CAPEX (NT$)": f"{a['capex_ntd']:,.0f}",
                    "年O&M (NT$)": f"{a['annual_om_ntd']:,.0f}",
                })
            st.dataframe(pd.DataFrame(asset_table), use_container_width=True, hide_index=True)

# ─── Footer ───────────────────────────────────────────────────────────────────
st.markdown("---")
st.caption(
    "DDEAR MVP — Energy Digital Twin Sandbox ⚡ | "
    "台電費率資料僅供參考，實際費率請依台電公告為準 | "
    f"碳排放係數：{CARBON_FACTOR_KG_PER_KWH} kg CO₂e/kWh（MOEA 2023）"
)
