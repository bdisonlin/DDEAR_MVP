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
  { label: '總覽',    icon: '▦', color: '#007AFF' },
  { label: '用電曲線', icon: '⚡', color: '#FF9500' },
  { label: '電費分析', icon: '💰', color: '#34C759' },
  { label: '減碳分析', icon: '🌿', color: '#AF52DE' },
  { label: 'ROI 回本', icon: '📈', color: '#5856D6' },
  { label: '需量反應', icon: '🔌', color: '#5AC8FA' },
]

const INSIGHT_CONFIG = {
  success: { bg: 'rgba(52,199,89,0.07)',   border: 'rgba(52,199,89,0.18)',   icon: '✦', color: '#34C759', label: '優化建議' },
  warning: { bg: 'rgba(255,149,0,0.07)',   border: 'rgba(255,149,0,0.18)',   icon: '⚠', color: '#FF9500', label: '注意事項' },
  info:    { bg: 'rgba(0,122,255,0.06)',   border: 'rgba(0,122,255,0.16)',   icon: '◈', color: '#007AFF', label: '分析洞察' },
  tip:     { bg: 'rgba(175,82,222,0.07)',  border: 'rgba(175,82,222,0.16)',  icon: '◆', color: '#AF52DE', label: '進階提示' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const cfg = INSIGHT_CONFIG[insight.type]
  return (
    <div
      className="rounded-ios-sm p-4 transition-all duration-200 hover:scale-[1.01] animate-fade-up"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}28` }}
        >
          <span style={{ color: cfg.color, fontSize: 13 }}>{cfg.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold" style={{ color: cfg.color, fontSize: 13 }}>{insight.title}</span>
            {insight.metric && (
              <span
                className="font-data font-semibold px-2 py-0.5 rounded-full border"
                style={{ fontSize: 11, color: cfg.color, borderColor: cfg.border, background: cfg.bg }}
              >
                {insight.metric}
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed" style={{ fontSize: 13 }}>
            {insight.body}
          </p>
        </div>
      </div>
    </div>
  )
}

function InsightSkeleton() {
  return (
    <div className="rounded-ios-sm border border-black/6 dark:border-white/6 p-4 animate-pulse bg-black/[0.025] dark:bg-white/[0.04]">
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-[7px] bg-black/8 dark:bg-white/10 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-black/8 dark:bg-white/10 rounded w-2/5" />
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
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center shadow-ios shrink-0"
          style={{ background: 'linear-gradient(145deg, #007AFF, #5856D6)' }}
        >
          <span className="text-white" style={{ fontSize: 15 }}>✦</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ios-blue" style={{ fontSize: 14 }}>AI 智慧洞察</p>
          <p className="text-gray-400 dark:text-gray-500 font-data" style={{ fontSize: 11.5 }}>
            {isLoadingInsights ? '模型分析中…' : `${insights.length} 項洞察報告`}
          </p>
        </div>
        {isLoadingInsights && (
          <div className="flex gap-1 shrink-0">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-ios-blue animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
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

function DrTab({ drResult, isDrSimulating, drError }: {
  drResult: DRSettlement | null; isDrSimulating: boolean; drError: string | null
}) {
  if (isDrSimulating) {
    return (
      <div className="card relative overflow-hidden"
        style={{ borderColor: 'rgba(88,86,214,0.20)', background: 'rgba(88,86,214,0.05)' }}>
        <div className="loading-bar absolute top-0 left-0 right-0" style={{ background: '#5856D6' }} />
        <div className="flex items-center gap-3 text-indigo-500 font-medium pt-1" style={{ fontSize: 14 }}>
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          需量反應收益試算中…
        </div>
      </div>
    )
  }

  if (drError) {
    return (
      <div className="card" style={{ borderColor: 'rgba(255,59,48,0.22)', background: 'rgba(255,59,48,0.05)' }}>
        <p className="text-ios-red font-medium" style={{ fontSize: 14 }}>✕ {drError}</p>
      </div>
    )
  }

  if (!drResult) {
    return (
      <div className="card text-center py-16">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(90,200,250,0.10)', border: '1px solid rgba(90,200,250,0.18)' }}
        >
          <span style={{ fontSize: 28 }}>🔌</span>
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1" style={{ fontSize: 15 }}>尚無需量反應資料</p>
        <p className="text-gray-400 dark:text-gray-500" style={{ fontSize: 13 }}>在左側設定需量反應方案後點擊「試算需量反應收益」</p>
      </div>
    )
  }

  const badge = DR_PROGRAM_BADGE[drResult.program] ?? DR_PROGRAM_BADGE.rt_flexible

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Program tag */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold px-3 py-1 rounded-full"
          style={{ fontSize: 12, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
          {drResult.program_label}
        </span>
        {drResult.has_penalty && (
          <span className="px-2.5 py-1 rounded-full font-medium"
            style={{ fontSize: 12, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)' }}>
            ⚠ 有罰則
          </span>
        )}
        {drResult.notification_type !== 'day_ahead' && (
          <span className="px-2.5 py-1 rounded-full font-medium"
            style={{ fontSize: 12, color: '#34C759', background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.18)' }}>
            緊急通知 +20%
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '年度需量反應收益', value: fmtNtd(drResult.annual_net_revenue), color: '#5856D6', bg: 'rgba(88,86,214,0.07)', border: 'rgba(88,86,214,0.16)', icon: '🔌' },
          { label: '平均 CBL 基準', value: `${drResult.cbl_kw.toFixed(0)} kW`, color: '#007AFF', bg: 'rgba(0,122,255,0.06)', border: 'rgba(0,122,255,0.14)', icon: '📊' },
          { label: '平均執行率', value: fmtPct(drResult.avg_execution_rate), color: drResult.avg_execution_rate >= 0.8 ? '#34C759' : '#FF9500', bg: 'rgba(52,199,89,0.06)', border: 'rgba(52,199,89,0.14)', icon: '✓' },
          { label: '全年執行時數', value: `${drResult.total_event_hours} hr`, color: '#FF9500', bg: 'rgba(255,149,0,0.07)', border: 'rgba(255,149,0,0.16)', icon: '⏱' },
        ].map((item) => (
          <div key={item.label} className="card py-4 text-center"
            style={{ background: item.bg, borderColor: item.border }}>
            <div style={{ fontSize: 22 }} className="mb-1.5">{item.icon}</div>
            <p className="text-gray-500 dark:text-gray-400 uppercase mb-1.5"
              style={{ fontSize: 10, letterSpacing: '0.07em', fontWeight: 700 }}>{item.label}</p>
            <p className="font-bold font-data" style={{ fontSize: 20, color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Settlement breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card md:col-span-2">
          <p className="section-title">月度收益分解</p>
          <DrChart result={drResult} />
          <div className="flex gap-4 mt-2 flex-wrap" style={{ fontSize: 11.5 }}>
            {[
              { color: 'rgba(0,122,255,0.8)', label: '流動電費' },
              { color: 'rgba(52,199,89,0.8)', label: '基本費扣減' },
              { color: 'rgba(255,59,48,0.8)', label: '罰款' },
              { color: '#FF9500', label: '執行率 (%)', dashed: true },
            ].map(({ color, label, dashed }) => (
              <span key={label} className="flex items-center gap-1.5 text-ios-gray1">
                {dashed
                  ? <span style={{ color, fontWeight: 700 }}>──</span>
                  : <span style={{ color }}>■</span>
                }
                {label}
              </span>
            ))}
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
            <div key={k} className="flex justify-between items-center" style={{ fontSize: 12.5 }}>
              <span className="text-gray-500 dark:text-gray-400">{k}</span>
              <span className="font-data font-bold" style={{ color }}>{v}</span>
            </div>
          ))}
          <div className="border-t border-black/6 dark:border-white/8 pt-3 flex justify-between font-semibold items-center">
            <span className="text-gray-600 dark:text-gray-300" style={{ fontSize: 13 }}>年淨收益</span>
            <span className="font-data font-bold" style={{
              fontSize: 16,
              color: drResult.annual_net_revenue >= 0 ? '#5856D6' : '#FF3B30'
            }}>
              {fmtNtd(drResult.annual_net_revenue)}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly detail table */}
      <div className="card overflow-x-auto">
        <div className="flex items-start justify-between mb-3 gap-4">
          <p className="section-title mb-0">月別明細</p>
          <p className="text-gray-400 dark:text-gray-500 text-right shrink-0" style={{ fontSize: 11 }}>
            ※ CBL 採整月峰值工作日 75th percentile 估算；台電實際以事件前 5 個工作日平均為準
          </p>
        </div>
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
                <td className={`font-data font-bold ${m.execution_rate >= 0.8 ? 'text-ios-green' : m.execution_rate >= 0.6 ? 'text-ios-orange' : 'text-ios-red'}`}>
                  {fmtPct(m.execution_rate)}
                </td>
                <td className="font-data text-ios-indigo">{fmtPct(m.discount_rate)}</td>
                <td className="font-data text-ios-gray1">{m.events}</td>
                <td className="font-data">{fmtNtd(m.flow_revenue)}</td>
                <td className="font-data text-ios-green">{fmtNtd(m.basic_fee_discount)}</td>
                <td className={`font-data ${m.penalty > 0 ? 'text-ios-red' : 'text-ios-gray1'}`}>{fmtNtd(-m.penalty)}</td>
                <td className={`font-data font-bold ${m.net_revenue >= 0 ? 'text-ios-indigo' : 'text-ios-red'}`}>{fmtNtd(m.net_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

export default function Dashboard() {
  const { simResult, isSimulating, simError, baseline, drResult, isDrSimulating, drError } = useSandboxStore()
  const [activeTab, setActiveTab] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(7)
  const [selectedWeek, setSelectedWeek] = useState(2)

  if (!baseline) return <Welcome />

  return (
    <div className="space-y-4 animate-fade-up">

      {/* KPI strip */}
      {simResult && <KpiCards kpis={simResult.kpis} roi={simResult.roi} />}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 p-1 rounded-[12px] bg-black/[0.055] dark:bg-white/[0.06] w-full md:w-fit">
        {TABS.map((t, i) => (
          <button key={t.label} onClick={() => setActiveTab(i)}
            className={`tab-btn ${activeTab === i ? 'active' : ''}`}>
            <span className={activeTab === i ? '' : 'opacity-60'}>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Status banners */}
      {isSimulating && (
        <div className="card relative overflow-hidden"
          style={{ borderColor: 'rgba(0,122,255,0.18)', background: 'rgba(0,122,255,0.05)' }}>
          <div className="loading-bar absolute top-0 left-0 right-0" />
          <div className="flex items-center gap-3 text-ios-blue font-medium pt-1" style={{ fontSize: 14 }}>
            <div className="w-2 h-2 rounded-full bg-ios-blue animate-ping" />
            數位孿生模擬運算中…
          </div>
        </div>
      )}
      {simError && (
        <div className="card" style={{ borderColor: 'rgba(255,59,48,0.22)', background: 'rgba(255,59,48,0.05)' }}>
          <p className="text-ios-red font-medium" style={{ fontSize: 14 }}>✕ {simError}</p>
        </div>
      )}
      {!simResult && !isSimulating && activeTab !== 5 && (
        <div className="card text-center py-16">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.14)' }}
          >
            <span style={{ fontSize: 28 }}>⚡</span>
          </div>
          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1" style={{ fontSize: 15 }}>尚無模擬結果</p>
          <p className="text-gray-400 dark:text-gray-500" style={{ fontSize: 13 }}>從左側加入能源資產，系統將自動執行模擬</p>
        </div>
      )}

      {simResult && (
        <div className="space-y-4">

          {/* ── Tab 0: Overview ── */}
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
                    <div className="space-y-3.5">
                      {[
                        { label: '台電購電', value: simResult.kpis.net_load_kwh, color: '#007AFF' },
                        { label: '再生能源', value: simResult.kpis.re_kwh, color: '#34C759' },
                      ].map((item) => {
                        const pct = item.value / simResult.kpis.baseline_load_kwh
                        return (
                          <div key={item.label}>
                            <div className="flex justify-between mb-1.5" style={{ fontSize: 12.5 }}>
                              <span className="font-semibold" style={{ color: item.color }}>{item.label}</span>
                              <span className="text-gray-400 dark:text-gray-500 font-data">
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
                    <div className="space-y-2" style={{ fontSize: 12.5 }}>
                      {[
                        { k: '基準年費',   v: fmtNtd(simResult.kpis.baseline_annual_cost), color: 'text-gray-700 dark:text-gray-300' },
                        { k: '模擬後電費', v: fmtNtd(simResult.kpis.scenario_annual_cost), color: 'text-ios-green' },
                        { k: 'O&M 成本',   v: `- ${fmtNtd(simResult.kpis.total_annual_om)}`, color: 'text-gray-400' },
                        ...(simResult.kpis.annual_fuel_cost_ntd > 0 ? [{ k: '燃料成本', v: `- ${fmtNtd(simResult.kpis.annual_fuel_cost_ntd)}`, color: 'text-ios-red' }] : []),
                      ].map(({ k, v, color }) => (
                        <div key={k} className="flex justify-between items-center">
                          <span className="text-gray-500 dark:text-gray-400">{k}</span>
                          <span className={`font-data font-semibold ${color}`}>{v}</span>
                        </div>
                      ))}
                      <div className="border-t border-black/6 dark:border-white/8 pt-2 flex justify-between items-center">
                        <span className="font-semibold text-gray-600 dark:text-gray-300" style={{ fontSize: 13 }}>年節省</span>
                        <span className={`font-data font-bold ${simResult.kpis.annual_savings > 0 ? 'text-ios-green' : 'text-ios-red'}`}
                          style={{ fontSize: 15 }}>
                          {fmtNtd(simResult.kpis.annual_savings)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <AiInsightsPanel />
            </div>
          )}

          {/* ── Tab 1: Load Curve ── */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <p className="section-title mb-0">
                    典型週用電曲線（{MONTH_LABELS[selectedMonth - 1]}第{selectedWeek}週）
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={selectedWeek}
                      onChange={e => setSelectedWeek(Number(e.target.value))}
                      className="font-data rounded-ios-sm border border-black/[0.10] dark:border-white/[0.10] bg-white/80 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 px-2.5 py-1.5 outline-none cursor-pointer"
                      style={{ fontSize: 12 }}
                    >
                      {[1, 2, 3, 4].map(w => (
                        <option key={w} value={w} disabled={!simResult.load_chart_by_month?.[`${selectedMonth}_${w}`]}>
                          第{w}週（{w === 1 ? '1–7日' : w === 2 ? '8–14日' : w === 3 ? '15–21日' : '22–28日'}）
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-1">
                      {MONTH_LABELS.map((label, i) => {
                        const m = i + 1
                        const hasData = !!simResult.load_chart_by_month?.[`${m}_${selectedWeek}`]
                        return (
                          <button
                            key={m}
                            onClick={() => setSelectedMonth(m)}
                            disabled={!hasData}
                            className="px-2 py-0.5 rounded-full font-data transition-all"
                            style={{
                              fontSize: 11.5,
                              fontWeight: selectedMonth === m ? 700 : 400,
                              background: selectedMonth === m ? '#007AFF' : hasData ? 'rgba(0,0,0,0.05)' : 'transparent',
                              color: selectedMonth === m ? '#fff' : hasData ? '#6b7280' : '#c7c7cc',
                              opacity: hasData ? 1 : 0.35,
                              cursor: hasData ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <LoadChart data={simResult.load_chart_by_month?.[`${selectedMonth}_${selectedWeek}`] ?? simResult.load_chart} />
                <div className="flex gap-5 mt-3" style={{ fontSize: 11.5 }}>
                  <span className="flex items-center gap-1.5 text-gray-500"><span style={{ color: '#007AFF' }}>──</span> 基準負載</span>
                  <span className="flex items-center gap-1.5 text-gray-500"><span style={{ color: '#FF9500' }}>- -</span> 模擬後淨負載</span>
                  <span className="flex items-center gap-1.5 text-gray-500"><span style={{ color: '#34C759' }}>──</span> 綠能發電量</span>
                </div>
              </div>

              <div className="card">
                <p className="section-title">月均用電熱圖 — 每小時平均負載 (kW)</p>
                <p className="text-gray-400 dark:text-gray-500 mb-4 -mt-1" style={{ fontSize: 12 }}>
                  顏色深淺代表用電密度，可切換基準 / 模擬後對比資產效益
                </p>
                <HeatmapChart data={simResult.load_heatmap} />
              </div>
            </div>
          )}

          {/* ── Tab 2: Cost Analysis ── */}
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
                        <td className={`font-data font-bold ${m.savings > 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                          {fmtNtd(m.savings)}
                        </td>
                        <td className="font-data text-ios-gray1">{fmtPct(m.savings_pct)}</td>
                        <td className="font-data text-ios-blue">{fmtPct(m.re_ratio)}</td>
                        <td className="font-data text-ios-gray1">{m.peak_kwh.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab 3: Carbon ── */}
          {activeTab === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card space-y-4">
                <p className="section-title">碳排放比較</p>
                {[
                  { label: '基準碳排',   value: simResult.kpis.baseline_carbon_tons, color: '#FF3B30' },
                  { label: '模擬後碳排', value: simResult.kpis.scenario_carbon_tons, color: '#34C759' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between mb-1.5" style={{ fontSize: 12.5 }}>
                      <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                      <span className="font-bold font-data" style={{ color: item.color }}>
                        {item.value.toFixed(1)} tCO₂e
                      </span>
                    </div>
                    <div className="progress-track h-2">
                      <div className="progress-fill h-full" style={{
                        width: `${(item.value / simResult.kpis.baseline_carbon_tons) * 100}%`,
                        background: item.color,
                      }} />
                    </div>
                  </div>
                ))}
                <div className="rounded-ios-sm p-4 text-center"
                  style={{ background: 'rgba(52,199,89,0.07)', border: '1px solid rgba(52,199,89,0.18)' }}>
                  <p className="font-bold font-data text-ios-green" style={{ fontSize: 32 }}>
                    {simResult.kpis.carbon_reduction_tons.toFixed(1)}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 mt-1" style={{ fontSize: 12.5 }}>
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
                  <div key={item.label}
                    className="flex items-center gap-3 rounded-ios-sm px-3.5 py-3 transition-colors"
                    style={{ background: `${item.color}07`, border: `1px solid ${item.color}16` }}>
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-gray-400 dark:text-gray-500" style={{ fontSize: 11.5 }}>{item.label}</p>
                      <p className="font-semibold font-data" style={{ fontSize: 14, color: item.color }}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab 4: ROI ── */}
          {activeTab === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'CAPEX',  value: fmtNtd(simResult.kpis.total_capex),       color: '#FF9500', bg: 'rgba(255,149,0,0.07)',  border: 'rgba(255,149,0,0.16)'  },
                  { label: '年淨效益', value: fmtNtd(simResult.roi.net_annual_benefit), color: '#34C759', bg: 'rgba(52,199,89,0.07)',  border: 'rgba(52,199,89,0.16)'  },
                  { label: 'NPV',    value: fmtNtd(simResult.roi.npv),                 color: simResult.roi.npv > 0 ? '#007AFF' : '#FF3B30', bg: 'rgba(0,122,255,0.06)', border: 'rgba(0,122,255,0.14)' },
                  { label: 'IRR',    value: simResult.roi.irr != null ? fmtPct(simResult.roi.irr) : 'N/A', color: '#5856D6', bg: 'rgba(88,86,214,0.07)', border: 'rgba(88,86,214,0.16)' },
                ].map((item) => (
                  <div key={item.label} className="card text-center py-5"
                    style={{ background: item.bg, borderColor: item.border }}>
                    <p className="uppercase mb-2" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: item.color }}>{item.label}</p>
                    <p className="font-bold font-data" style={{ fontSize: 22, color: item.color }}>{item.value}</p>
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

      {/* ── Tab 5: Demand Response ── */}
      {activeTab === 5 && (
        <DrTab drResult={drResult} isDrSimulating={isDrSimulating} drError={drError} />
      )}
    </div>
  )
}
