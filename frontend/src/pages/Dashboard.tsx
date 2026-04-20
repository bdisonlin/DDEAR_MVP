import { useState } from 'react'
import { useSandboxStore } from '@/store/useSandboxStore'
import KpiCards from '@/components/dashboard/KpiCards'
import LoadChart from '@/components/charts/LoadChart'
import CostChart from '@/components/charts/CostChart'
import RoiChart from '@/components/charts/RoiChart'
import HeatmapChart from '@/components/charts/HeatmapChart'
import DrChart from '@/components/charts/DrChart'
import { fmtNtd, fmtPct } from '@/utils/formatters'
import type { Insight, DRSettlement } from '@/types'
import Welcome from './Welcome'

const TABS = [
  { label: '總覽',    icon: '▦' },
  { label: '用電曲線', icon: '⚡' },
  { label: '電費分析', icon: '💰' },
  { label: '減碳分析', icon: '🌿' },
  { label: 'ROI 回本', icon: '📈' },
  { label: '需量反應', icon: '🔌' },
]

const INSIGHT_CONFIG = {
  success: { bg: 'rgba(52,199,89,0.08)',   border: 'rgba(52,199,89,0.20)',   icon: '✦', color: '#34C759' },
  warning: { bg: 'rgba(255,149,0,0.08)',   border: 'rgba(255,149,0,0.20)',   icon: '⚠', color: '#FF9500' },
  info:    { bg: 'rgba(0,122,255,0.07)',   border: 'rgba(0,122,255,0.18)',   icon: '◈', color: '#007AFF' },
  tip:     { bg: 'rgba(175,82,222,0.08)',  border: 'rgba(175,82,222,0.18)',  icon: '◆', color: '#AF52DE' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const cfg = INSIGHT_CONFIG[insight.type]
  return (
    <div className="rounded-ios-sm p-4 transition-all duration-200 hover:scale-[1.01] animate-fade-up"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: cfg.color }}>{insight.title}</span>
            {insight.metric && (
              <span className="font-data text-xs px-2 py-0.5 rounded-full border"
                style={{ color: cfg.color, borderColor: cfg.border, background: cfg.bg }}>
                {insight.metric}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{insight.body}</p>
        </div>
      </div>
    </div>
  )
}

function InsightSkeleton() {
  return (
    <div className="rounded-ios-sm border border-black/6 dark:border-white/6 p-4 animate-pulse bg-black/[0.03] dark:bg-white/[0.04]">
      <div className="flex gap-3">
        <div className="w-5 h-5 rounded bg-black/8 dark:bg-white/10 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-black/8 dark:bg-white/10 rounded w-1/3" />
          <div className="h-3 bg-black/5 dark:bg-white/6 rounded w-full" />
          <div className="h-3 bg-black/5 dark:bg-white/6 rounded w-4/5" />
        </div>
      </div>
    </div>
  )
}

function AiInsightsPanel() {
  const { insights, isLoadingInsights } = useSandboxStore()

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-ios-sm flex items-center justify-center shadow-ios"
          style={{ background: 'linear-gradient(145deg, #007AFF, #5856D6)' }}>
          <span className="text-white text-sm">✦</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-ios-blue">AI 智慧洞察</p>
          <p className="text-xs text-ios-gray2 font-data">
            {isLoadingInsights ? '分析中...' : `${insights.length} 項洞察`}
          </p>
        </div>
        {isLoadingInsights && (
          <div className="ml-auto flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-ios-blue animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {isLoadingInsights
          ? Array.from({ length: 3 }).map((_, i) => <InsightSkeleton key={i} />)
          : insights.map((insight, i) => <InsightCard key={i} insight={insight} />)
        }
      </div>
    </div>
  )
}

const DR_PROGRAM_BADGE: Record<string, { color: string; bg: string; border: string }> = {
  planned_monthly: { color: '#007AFF', bg: 'rgba(0,122,255,0.08)',   border: 'rgba(0,122,255,0.18)'   },
  planned_daily:   { color: '#5AC8FA', bg: 'rgba(90,200,250,0.10)',  border: 'rgba(90,200,250,0.22)'  },
  rt_guaranteed:   { color: '#FF3B30', bg: 'rgba(255,59,48,0.08)',   border: 'rgba(255,59,48,0.18)'   },
  rt_flexible:     { color: '#FF9500', bg: 'rgba(255,149,0,0.08)',   border: 'rgba(255,149,0,0.18)'   },
  bid_economic:    { color: '#34C759', bg: 'rgba(52,199,89,0.08)',   border: 'rgba(52,199,89,0.18)'   },
  bid_reliable:    { color: '#5856D6', bg: 'rgba(88,86,214,0.08)',   border: 'rgba(88,86,214,0.18)'   },
}

function DrTab({
  drResult, isDrSimulating, drError,
}: {
  drResult: DRSettlement | null
  isDrSimulating: boolean
  drError: string | null
}) {
  if (isDrSimulating) {
    return (
      <div className="card relative overflow-hidden"
        style={{ borderColor: 'rgba(88,86,214,0.20)', background: 'rgba(88,86,214,0.06)' }}>
        <div className="loading-bar absolute top-0 left-0 right-0" style={{ background: '#5856D6' }} />
        <div className="flex items-center gap-3 text-indigo-600 text-sm font-medium pt-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          需量反應收益試算中…
        </div>
      </div>
    )
  }

  if (drError) {
    return (
      <div className="card text-ios-red text-sm"
        style={{ borderColor: 'rgba(255,59,48,0.25)', background: 'rgba(255,59,48,0.06)' }}>
        ✕ {drError}
      </div>
    )
  }

  if (!drResult) {
    return (
      <div className="card text-center py-14">
        <p className="text-5xl mb-4 opacity-25">🔌</p>
        <p className="text-ios-gray1 text-sm">在左側設定需量反應方案，點擊「試算需量反應收益」</p>
      </div>
    )
  }

  const badge = DR_PROGRAM_BADGE[drResult.program] ?? DR_PROGRAM_BADGE.rt_flexible

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Program tag */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
          {drResult.program_label}
        </span>
        {drResult.has_penalty && (
          <span className="text-xs px-2 py-1 rounded-full"
            style={{ color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)' }}>
            ⚠ 有罰則
          </span>
        )}
        {drResult.notification_type !== 'day_ahead' && (
          <span className="text-xs px-2 py-1 rounded-full"
            style={{ color: '#34C759', background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.18)' }}>
            緊急通知 +20%
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '年度需量反應收益', value: fmtNtd(drResult.annual_net_revenue), color: '#5856D6', bg: 'rgba(88,86,214,0.08)', border: 'rgba(88,86,214,0.18)', icon: '🔌' },
          { label: '平均 CBL 基準', value: `${drResult.cbl_kw.toFixed(0)} kW`, color: '#007AFF', bg: 'rgba(0,122,255,0.07)', border: 'rgba(0,122,255,0.15)', icon: '📊' },
          { label: '平均執行率', value: fmtPct(drResult.avg_execution_rate), color: drResult.avg_execution_rate >= 0.8 ? '#34C759' : '#FF9500', bg: 'rgba(52,199,89,0.07)', border: 'rgba(52,199,89,0.15)', icon: '✓' },
          { label: '全年執行時數', value: `${drResult.total_event_hours} hr`, color: '#FF9500', bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.18)', icon: '⏱' },
        ].map((item) => (
          <div key={item.label} className="card py-4 text-center"
            style={{ background: item.bg, borderColor: item.border }}>
            <div className="text-xl mb-1">{item.icon}</div>
            <p className="text-xs text-ios-gray1 uppercase tracking-wide mb-1">{item.label}</p>
            <p className="text-lg font-bold font-data" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Settlement breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card md:col-span-2">
          <p className="section-title">月度收益分解</p>
          <DrChart result={drResult} />
          <div className="flex gap-4 mt-2 text-xs text-ios-gray1 font-data flex-wrap">
            <span><span style={{ color: 'rgba(0,122,255,0.8)' }}>■</span> 流動電費</span>
            <span><span style={{ color: 'rgba(52,199,89,0.8)' }}>■</span> 基本費扣減</span>
            <span><span style={{ color: 'rgba(255,59,48,0.8)' }}>■</span> 罰款</span>
            <span><span style={{ color: '#FF9500' }}>──</span> 執行率 (%)</span>
          </div>
        </div>

        <div className="card space-y-3">
          <p className="section-title">年度結算明細</p>
          {[
            { k: '約定抑低容量', v: `${drResult.contracted_kw.toFixed(0)} kW`, color: '#007AFF' },
            { k: '實際平均抑低', v: `${drResult.avg_actual_reduction_kw.toFixed(0)} kW`, color: '#34C759' },
            { k: '年執行次數',   v: `${drResult.total_events_per_year} 次`, color: '#FF9500' },
            { k: '流動電費',     v: fmtNtd(drResult.annual_flow_revenue), color: '#007AFF' },
            { k: '基本費扣減',   v: fmtNtd(drResult.annual_basic_fee_discount), color: '#34C759' },
            { k: '罰款合計',     v: fmtNtd(-drResult.annual_penalty), color: drResult.annual_penalty > 0 ? '#FF3B30' : '#8E8E93' },
          ].map(({ k, v, color }) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-ios-gray1">{k}</span>
              <span className="font-data font-semibold" style={{ color }}>{v}</span>
            </div>
          ))}
          <div className="border-t border-black/6 dark:border-white/8 pt-2 flex justify-between font-semibold text-sm">
            <span className="text-ios-gray1">年淨收益</span>
            <span className="font-data" style={{ color: drResult.annual_net_revenue >= 0 ? '#5856D6' : '#FF3B30' }}>
              {fmtNtd(drResult.annual_net_revenue)}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly detail table */}
      <div className="card overflow-x-auto">
        <p className="section-title">月別明細</p>
        <table className="data-table">
          <thead>
            <tr>
              {['月份', 'CBL (kW)', '實際抑低 (kW)', '執行率', '扣減比率', '次數', '流動電費', '基本費', '罰款', '月淨收益'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drResult.monthly.map((m) => (
              <tr key={m.month}>
                <td className="text-ios-gray1 font-data">{m.month}</td>
                <td className="font-data">{m.cbl_kw.toFixed(0)}</td>
                <td className="font-data text-ios-blue">{m.actual_reduction_kw.toFixed(0)}</td>
                <td className={`font-data font-semibold ${m.execution_rate >= 0.8 ? 'text-ios-green' : m.execution_rate >= 0.6 ? 'text-ios-orange' : 'text-ios-red'}`}>
                  {fmtPct(m.execution_rate)}
                </td>
                <td className="font-data text-ios-indigo">{fmtPct(m.discount_rate)}</td>
                <td className="font-data text-ios-gray1">{m.events}</td>
                <td className="font-data">{fmtNtd(m.flow_revenue)}</td>
                <td className="font-data text-ios-green">{fmtNtd(m.basic_fee_discount)}</td>
                <td className={`font-data ${m.penalty > 0 ? 'text-ios-red' : 'text-ios-gray2'}`}>{fmtNtd(-m.penalty)}</td>
                <td className={`font-data font-semibold ${m.net_revenue >= 0 ? 'text-ios-indigo' : 'text-ios-red'}`}>{fmtNtd(m.net_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { simResult, isSimulating, simError, baseline, drResult, isDrSimulating, drError } = useSandboxStore()
  const [activeTab, setActiveTab] = useState(0)

  if (!baseline) return <Welcome />

  return (
    <div className="space-y-4 animate-fade-up">

      {/* KPI strip */}
      {simResult && <KpiCards kpis={simResult.kpis} roi={simResult.roi} />}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 p-1 rounded-ios-sm bg-black/5 dark:bg-white/[0.06] w-full md:w-fit">
        {TABS.map((t, i) => (
          <button key={t.label} onClick={() => setActiveTab(i)}
            className={`tab-btn ${activeTab === i ? 'active' : ''}`}>
            <span className="mr-1 md:mr-1.5 opacity-70">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Status banners */}
      {isSimulating && (
        <div className="card relative overflow-hidden"
          style={{ borderColor: 'rgba(0,122,255,0.20)', background: 'rgba(0,122,255,0.06)' }}>
          <div className="loading-bar absolute top-0 left-0 right-0" />
          <div className="flex items-center gap-3 text-ios-blue text-sm font-medium pt-1">
            <div className="w-2 h-2 rounded-full bg-ios-blue animate-ping" />
            數位孿生模擬運算中…
          </div>
        </div>
      )}
      {simError && (
        <div className="card text-ios-red text-sm"
          style={{ borderColor: 'rgba(255,59,48,0.25)', background: 'rgba(255,59,48,0.06)' }}>
          ✕ {simError}
        </div>
      )}
      {!simResult && !isSimulating && activeTab !== 5 && (
        <div className="card text-center py-14">
          <p className="text-5xl mb-4 opacity-25">⚡</p>
          <p className="text-ios-gray1 text-sm">從左側加入能源資產，自動執行模擬</p>
        </div>
      )}

      {simResult && (
        <div className="space-y-4">

          {/* ── Tab 0: Overview ──────────────────────────────────────────── */}
          {activeTab === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Cost chart */}
                <div className="card md:col-span-3">
                  <p className="section-title">逐月電費比較</p>
                  <CostChart monthly={simResult.monthly} />
                </div>

                {/* Energy mix + cost breakdown */}
                <div className="card md:col-span-2 flex flex-col gap-5">
                  <div>
                    <p className="section-title">能源結構</p>
                    <div className="space-y-3">
                      {[
                        { label: '台電購電', value: simResult.kpis.net_load_kwh, color: '#007AFF' },
                        { label: '再生能源', value: simResult.kpis.re_kwh, color: '#34C759' },
                      ].map((item) => {
                        const pct = item.value / simResult.kpis.baseline_load_kwh
                        return (
                          <div key={item.label}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span style={{ color: item.color }} className="font-medium">{item.label}</span>
                              <span className="text-ios-gray2 font-data">
                                {fmtPct(pct)} · {(item.value / 1e6).toFixed(2)} GWh
                              </span>
                            </div>
                            <div className="progress-track">
                              <div className="progress-fill" style={{ width: `${pct * 100}%`, background: item.color }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="section-title">年度成本明細</p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        { k: '基準年費',   v: fmtNtd(simResult.kpis.baseline_annual_cost), color: 'text-gray-700' },
                        { k: '模擬後年費', v: fmtNtd(simResult.kpis.scenario_annual_cost), color: 'text-ios-green' },
                        { k: '餘電收入',   v: `+ ${fmtNtd(simResult.kpis.export_revenue)}`, color: 'text-ios-orange' },
                        { k: 'O&M 成本',   v: `- ${fmtNtd(simResult.kpis.total_annual_om)}`, color: 'text-ios-gray1' },
                      ].map(({ k, v, color }) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-ios-gray1">{k}</span>
                          <span className={`font-data font-medium ${color}`}>{v}</span>
                        </div>
                      ))}
                      <div className="border-t border-black/6 dark:border-white/8 pt-1.5 flex justify-between font-semibold">
                        <span className="text-ios-gray1">年節省</span>
                        <span className={`font-data ${simResult.kpis.annual_savings > 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                          {fmtNtd(simResult.kpis.annual_savings)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Insights */}
              <AiInsightsPanel />
            </div>
          )}

          {/* ── Tab 1: Load Curve ─────────────────────────────────────────── */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div className="card">
                <p className="section-title">典型週用電曲線（7月第二週）</p>
                <LoadChart data={simResult.load_chart} />
                <div className="flex gap-4 mt-3 text-xs text-ios-gray1 font-data">
                  <span><span style={{ color: '#007AFF' }}>──</span> 基準負載</span>
                  <span><span style={{ color: '#34C759' }}>- -</span> 模擬後淨負載</span>
                  <span><span style={{ color: '#FF9500' }}>──</span> RE 發電量</span>
                </div>
              </div>

              <div className="card">
                <p className="section-title">月均用電熱圖 — 每小時平均負載 (kW)</p>
                <p className="text-xs text-ios-gray2 font-data mb-4 -mt-2">
                  顏色深淺代表用電密度，可切換基準 / 模擬後對比資產效益
                </p>
                <HeatmapChart data={simResult.load_heatmap} />
              </div>
            </div>
          )}

          {/* ── Tab 2: Cost Analysis ──────────────────────────────────────── */}
          {activeTab === 2 && (
            <div className="space-y-4">
              <div className="card">
                <p className="section-title">逐月電費對比</p>
                <CostChart monthly={simResult.monthly} />
              </div>
              <div className="card overflow-x-auto">
                <p className="section-title">月別明細表</p>
                <table className="data-table">
                  <thead>
                    <tr>
                      {['月份', '基準電費', '模擬後電費', '節省', '節省%', 'RE%', '尖峰用電 kWh'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {simResult.monthly.map((m) => (
                      <tr key={m.month}>
                        <td className="text-ios-gray1 font-data">{m.month}</td>
                        <td className="font-data">{fmtNtd(m.baseline_cost)}</td>
                        <td className="font-data">{fmtNtd(m.scenario_cost)}</td>
                        <td className={`font-data font-semibold ${m.savings > 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                          {fmtNtd(m.savings)}
                        </td>
                        <td className="text-ios-gray1 font-data">{fmtPct(m.savings_pct)}</td>
                        <td className="text-ios-blue font-data">{fmtPct(m.re_ratio)}</td>
                        <td className="text-ios-gray1 font-data">{m.peak_kwh.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab 3: Carbon ─────────────────────────────────────────────── */}
          {activeTab === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card space-y-4">
                <p className="section-title">碳排放比較</p>
                {[
                  { label: '基準碳排',   value: simResult.kpis.baseline_carbon_tons, color: '#FF3B30' },
                  { label: '模擬後碳排', value: simResult.kpis.scenario_carbon_tons, color: '#34C759' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-ios-gray1">{item.label}</span>
                      <span className="font-bold font-data" style={{ color: item.color }}>
                        {item.value.toFixed(1)} tCO₂e
                      </span>
                    </div>
                    <div className="progress-track h-2.5">
                      <div className="progress-fill h-full" style={{
                        width: `${(item.value / simResult.kpis.baseline_carbon_tons) * 100}%`,
                        background: item.color,
                      }} />
                    </div>
                  </div>
                ))}
                <div className="rounded-ios-sm p-4 text-center"
                  style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.20)' }}>
                  <p className="text-3xl font-bold font-data text-ios-green">
                    {simResult.kpis.carbon_reduction_tons.toFixed(1)}
                  </p>
                  <p className="text-xs text-ios-gray1 mt-1">
                    tCO₂e 年減碳量 ({fmtPct(simResult.kpis.carbon_reduction_pct)})
                  </p>
                </div>
              </div>

              <div className="card space-y-2.5">
                <p className="section-title">減碳相當於</p>
                {[
                  { icon: '🚗', label: '少開汽車',     value: `${(simResult.kpis.carbon_reduction_tons * 4500).toFixed(0)} km`,   color: '#007AFF' },
                  { icon: '🌳', label: '種植樹木',     value: `${(simResult.kpis.carbon_reduction_tons * 55).toFixed(0)} 棵/年`,   color: '#34C759' },
                  { icon: '✈️', label: '台北→東京飛行', value: `${(simResult.kpis.carbon_reduction_tons * 0.9).toFixed(1)} 趟`,    color: '#FF9500' },
                  { icon: '🏠', label: '家庭用電',     value: `${(simResult.kpis.carbon_reduction_tons * 1000 / 0.494 / 3600).toFixed(0)} 戶/年`, color: '#AF52DE' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-ios-sm px-3 py-2.5 transition-colors"
                    style={{ background: `${item.color}08`, border: `1px solid ${item.color}18` }}>
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-xs text-ios-gray1">{item.label}</p>
                      <p className="text-sm font-semibold font-data" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab 4: ROI ────────────────────────────────────────────────── */}
          {activeTab === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'CAPEX',  value: fmtNtd(simResult.kpis.total_capex),          color: '#FF9500', bg: 'rgba(255,149,0,0.08)',   border: 'rgba(255,149,0,0.18)'  },
                  { label: '年淨效益', value: fmtNtd(simResult.roi.net_annual_benefit),    color: '#34C759', bg: 'rgba(52,199,89,0.08)',   border: 'rgba(52,199,89,0.18)'  },
                  { label: 'NPV',    value: fmtNtd(simResult.roi.npv),                    color: simResult.roi.npv > 0 ? '#007AFF' : '#FF3B30', bg: 'rgba(0,122,255,0.07)', border: 'rgba(0,122,255,0.15)' },
                  { label: 'IRR',    value: simResult.roi.irr != null ? fmtPct(simResult.roi.irr) : 'N/A', color: '#5856D6', bg: 'rgba(88,86,214,0.08)', border: 'rgba(88,86,214,0.18)' },
                ].map((item) => (
                  <div key={item.label} className="card text-center py-5"
                    style={{ background: item.bg, borderColor: item.border }}>
                    <p className="text-xs text-ios-gray1 uppercase tracking-widest mb-2">{item.label}</p>
                    <p className="text-xl font-bold font-data" style={{ color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="card">
                <p className="section-title">累積現金流量</p>
                <RoiChart roi={simResult.roi} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 5: Demand Response (always visible when baseline loaded) ── */}
      {activeTab === 5 && (
        <DrTab drResult={drResult} isDrSimulating={isDrSimulating} drError={drError} />
      )}
    </div>
  )
}
