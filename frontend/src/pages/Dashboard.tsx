import { useState, useEffect } from 'react'
import { useSandboxStore } from '@/store/useSandboxStore'
import KpiCards from '@/components/dashboard/KpiCards'
import LoadChart from '@/components/charts/LoadChart'
import CostChart from '@/components/charts/CostChart'
import RoiChart from '@/components/charts/RoiChart'
import HeatmapChart from '@/components/charts/HeatmapChart'
import DrChart from '@/components/charts/DrChart'
import MonthlyBillForm from '@/components/sidebar/MonthlyBillForm'
import { fmtNtd, fmtPct, fmtNum } from '@/utils/formatters'
import type { Insight, DRSettlement, MonthlyBillSummary, ReSourceConfig } from '@/types'
import { generateSample, uploadBaseline, runSimulation, fetchInsights, DEMO_ASSETS } from '@/api/simulation'
import clsx from 'clsx'

const RE_SOURCE_META: Record<string, { icon: string; label: string; cf: number }> = {
  solar_pv:      { icon: '☀️', label: '太陽光電', cf: 0.15 },
  onshore_wind:  { icon: '🌀', label: '陸域風電',  cf: 0.27 },
  offshore_wind: { icon: '🌊', label: '離岸風電',  cf: 0.38 },
  biomass:       { icon: '🌿', label: '生質能',    cf: 0.75 },
}

function computeReProportions(configs: ReSourceConfig[]): { source_type: string; pct: number }[] {
  const expected = configs.map(c => ({
    source_type: c.source_type,
    exp: c.capacity_kw * (RE_SOURCE_META[c.source_type]?.cf ?? 0.15),
  }))
  const total = expected.reduce((s, e) => s + e.exp, 0)
  if (total === 0) return configs.map(c => ({ source_type: c.source_type, pct: 100 / configs.length }))
  return expected.map(e => ({ source_type: e.source_type, pct: (e.exp / total) * 100 }))
}

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
          { label: '平均 CBL 基準', value: `${fmtNum(drResult.cbl_kw)} kW`, color: '#007AFF', bg: 'rgba(0,122,255,0.06)', border: 'rgba(0,122,255,0.14)', icon: '📊' },
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
            { k: '約定抑低容量', v: `${fmtNum(drResult.contracted_kw)} kW`, color: '#007AFF' },
            { k: '實際平均抑低', v: `${fmtNum(drResult.avg_actual_reduction_kw)} kW`, color: '#34C759' },
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
                <td className="font-data">{fmtNum(m.cbl_kw)}</td>
                <td className="font-data text-ios-blue">{fmtNum(m.actual_reduction_kw)}</td>
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

/* ── Empty-state: data loading panel (shown when no baseline) ── */
type InputMode = 'sample' | 'csv' | 'bill'

function EmptyState() {
  const {
    setBaseline, clearAssets, addAsset,
    setSimResult, setIsSimulating, setSimError, isSimulating,
    setInsights, setIsLoadingInsights, tariff, financial,
    setReSourceConfigs,
  } = useSandboxStore()
  const [inputMode, setInputMode] = useState<InputMode>('sample')
  const [peakKw, setPeakKw]       = useState(1000)
  const [year, setYear]           = useState(2024)
  const [loading, setLoading]     = useState(false)

  const handleSample = async () => {
    setLoading(true)
    setSimError(null)
    try {
      const b = await generateSample(peakKw, year)
      setBaseline(b)
      clearAssets()
      DEMO_ASSETS.forEach(addAsset)
      setIsSimulating(true)
      const result = await runSimulation(b.data_id, DEMO_ASSETS, tariff, financial)
      setSimResult(result)
      setIsLoadingInsights(true)
      fetchInsights(result, DEMO_ASSETS.map(a => a.type))
        .then(setInsights).catch(() => setInsights([]))
        .finally(() => setIsLoadingInsights(false))
    } catch (e: unknown) {
      setSimError((e as Error).message)
    } finally {
      setLoading(false)
      setIsSimulating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setSimError(null)
    try {
      const b = await uploadBaseline(file)
      setIsSimulating(true)
      setBaseline(b)
      const result = await runSimulation(b.data_id, [], tariff, financial)
      setSimResult(result)
      setIsLoadingInsights(true)
      fetchInsights(result, [])
        .then(setInsights).catch(() => setInsights([]))
        .finally(() => setIsLoadingInsights(false))
    } catch (err: unknown) { alert((err as Error).message) }
    finally { setLoading(false); setIsSimulating(false) }
  }

  const handleBillSuccess = async (result: MonthlyBillSummary, configs?: ReSourceConfig[]) => {
    setSimError(null)
    setIsSimulating(true)
    setBaseline(result)
    setReSourceConfigs(configs ?? null)
    try {
      const simResult = await runSimulation(result.data_id, [], tariff, financial)
      setSimResult(simResult)
      setIsLoadingInsights(true)
      fetchInsights(simResult, [])
        .then(setInsights).catch(() => setInsights([]))
        .finally(() => setIsLoadingInsights(false))
    } catch (e: unknown) {
      setSimError((e as Error).message)
    } finally {
      setIsSimulating(false)
    }
  }

  const busy = loading || isSimulating

  const FEATURES = [
    { icon: '💰', label: '電費節省試算',   desc: '準確計算 TOU 時間電價差額與需量費扣減',   color: '#34C759' },
    { icon: '🌿', label: '碳排分析',       desc: '台電排放係數即時換算，RE% 達成率追蹤',     color: '#AF52DE' },
    { icon: '📈', label: 'ROI 財務回收',   desc: 'CAPEX / NPV / IRR，20 年現金流量試算',    color: '#5856D6' },
    { icon: '🤖', label: 'AI 智慧洞察',   desc: 'Claude AI 分析能源優化策略與風險提示',     color: '#007AFF' },
  ]

  return (
    <div className="min-h-full flex items-center py-10 px-6 md:px-10 animate-fade-up">
      {/* Two-column layout: left=branding, right=form */}
      <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_1.05fr] gap-8 md:gap-14 items-center">

        {/* ── Left: identity + features ── */}
        <div className="space-y-8 md:py-4">

          {/* Logo + title */}
          <div className="space-y-4">
            <div
              className="w-14 h-14 rounded-[18px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #1a8aff, #5856D6)',
                boxShadow: '0 10px 28px rgba(0,122,255,0.30), inset 0 1.5px 0 rgba(255,255,255,0.28)',
              }}
            >
              <span style={{ fontSize: 26 }}>⚡</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white tracking-tight" style={{ fontSize: 30 }}>
                DDEAR
              </h1>
              <p className="font-data text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5" style={{ fontSize: 10.5 }}>
                Dynamic Digital Energy Asset ROI
              </p>
            </div>
            <p className="text-gray-500 dark:text-gray-400 leading-relaxed" style={{ fontSize: 14.5, maxWidth: 360 }}>
              載入工廠用電資料，數位孿生模擬太陽能、儲能、需量反應等能源資產的成本效益與投資回收
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4">
            {FEATURES.map(({ icon, label, desc, color }) => (
              <div key={label} className="flex items-start gap-3.5">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: `${color}10`,
                    border: `1px solid ${color}22`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5)`,
                  }}
                >
                  <span style={{ fontSize: 17 }}>{icon}</span>
                </div>
                <div>
                  <div className="font-semibold" style={{ fontSize: 13.5, color }}>{label}</div>
                  <div className="text-gray-400 dark:text-gray-500 leading-relaxed" style={{ fontSize: 12.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: input form card ── */}
        <div className="card space-y-5">

          {/* Segment control */}
          <div className="segment-ctrl">
            {([
              { id: 'sample', label: '示範資料' },
              { id: 'csv',    label: 'CSV 上傳' },
              { id: 'bill',   label: '電費單' },
            ] as { id: InputMode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setInputMode(tab.id)}
                className={clsx('segment-btn', inputMode === tab.id && 'active')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Sample mode ── */}
          {inputMode === 'sample' && (
            <div className="space-y-4 animate-scale-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">尖峰需量</label>
                  <div className="relative">
                    <input
                      className="input pr-8"
                      type="number" value={peakKw}
                      onChange={(e) => setPeakKw(+e.target.value)}
                      min={100} max={50000} step={100}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                      style={{ fontSize: 11 }}>kW</span>
                  </div>
                </div>
                <div>
                  <label className="label">年份</label>
                  <select className="input" value={year} onChange={(e) => setYear(+e.target.value)}>
                    {[2022, 2023, 2024, 2025].map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <button
                className="btn-primary w-full"
                onClick={handleSample}
                disabled={busy}
                style={{ paddingTop: 12, paddingBottom: 12, fontSize: 14.5 }}
              >
                {busy
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />模擬運算中…</>
                  : '🚀 一鍵載入示範'}
              </button>

              {/* Preset summary */}
              <div
                className="rounded-[10px] px-3.5 py-3 space-y-1.5"
                style={{ background: 'rgba(0,122,255,0.04)', border: '1px solid rgba(0,122,255,0.10)' }}
              >
                <p className="font-semibold text-ios-blue" style={{ fontSize: 11.5 }}>預設示範資產組合</p>
                {[
                  { icon: '☀️', text: '屋頂太陽能 300 kW' },
                  { icon: '🔋', text: '儲能 BESS 1,000 kWh / 500 kW' },
                  { icon: '💨', text: '風力 PPA 150 kW' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-gray-400 dark:text-gray-500"
                    style={{ fontSize: 12 }}>
                    <span style={{ fontSize: 13 }}>{icon}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CSV mode ── */}
          {inputMode === 'csv' && (
            <div className="space-y-3 animate-scale-in">
              <label className={clsx('btn-glass w-full cursor-pointer', busy && 'opacity-40 pointer-events-none')}>
                {busy
                  ? <><div className="w-4 h-4 border-2 border-ios-blue/40 border-t-ios-blue rounded-full animate-spin-slow" />上傳中…</>
                  : '📂 選擇 CSV 檔案'}
                <input type="file" accept=".csv" className="hidden" onChange={handleUpload} />
              </label>
              <div
                className="rounded-[10px] p-3.5 space-y-1.5"
                style={{ background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <p className="font-semibold text-gray-500 dark:text-gray-400" style={{ fontSize: 11.5 }}>格式要求</p>
                <p className="font-data text-gray-400 dark:text-gray-500" style={{ fontSize: 11 }}>欄位：timestamp, load_kw</p>
                <p className="font-data text-gray-400 dark:text-gray-500" style={{ fontSize: 11 }}>2024-01-01 00:00, 850.2</p>
                <p className="text-gray-400 dark:text-gray-500 mt-1" style={{ fontSize: 11 }}>15 分鐘間隔 · 至少涵蓋 1 天</p>
              </div>
            </div>
          )}

          {/* ── Bill mode ── */}
          {inputMode === 'bill' && (
            <div className="animate-scale-in">
              <MonthlyBillForm onSuccess={handleBillSuccess} />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default function Dashboard() {
  const {
    simResult, isSimulating, simError, baseline, drResult, isDrSimulating, drError,
    setSimResult, setIsSimulating, setSimError, setInsights, setIsLoadingInsights,
    tariff, financial, reSourceConfigs,
  } = useSandboxStore()
  const [activeTab, setActiveTab] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(7)
  const [selectedWeek, setSelectedWeek] = useState(2)

  // Auto-simulate baseline-only load curve whenever baseline is present but no result exists
  useEffect(() => {
    if (!baseline || simResult || isSimulating) return
    setIsSimulating(true)
    setSimError(null)
    runSimulation(baseline.data_id, [], tariff, financial)
      .then(result => {
        setSimResult(result)
        setIsLoadingInsights(true)
        fetchInsights(result, [])
          .then(setInsights).catch(() => setInsights([]))
          .finally(() => setIsLoadingInsights(false))
      })
      .catch(e => setSimError((e as Error).message))
      .finally(() => setIsSimulating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline])

  if (!baseline) return <EmptyState />

  // re_kwh and annual_ppa_cost_ntd are present on MonthlyBillSummary (from monthly bill upload)
  const baselineReKwh = (baseline as MonthlyBillSummary).re_kwh ?? 0
  const annualPpaCostNtd = (baseline as MonthlyBillSummary).annual_ppa_cost_ntd ?? 0

  return (
    <div className="space-y-4 animate-fade-up">

      {/* KPI strip */}
      {simResult && <KpiCards kpis={simResult.kpis} roi={simResult.roi} baselineReKwh={baselineReKwh} annualPpaCostNtd={annualPpaCostNtd} />}

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
        <div className="card text-center py-12 space-y-3">
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.14)' }}
          >
            <span style={{ fontSize: 28 }}>⚡</span>
          </div>
          <p className="font-semibold text-gray-700 dark:text-gray-300" style={{ fontSize: 15 }}>尚無模擬結果</p>
          <p className="text-gray-400 dark:text-gray-500" style={{ fontSize: 13 }}>
            點擊左側「▶ 執行模擬」，或新增能源資產後自動觸發模擬
          </p>
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
                      {(() => {
                        // Use simulation RE if assets are configured, otherwise fall back to bill's existing RE
                        const simReKwh = simResult.kpis.re_kwh
                        const displayReKwh = simReKwh > 0 ? simReKwh : baselineReKwh
                        const totalKwh = simResult.kpis.net_load_kwh + displayReKwh
                        const items = [
                          { label: '台電購電', value: simResult.kpis.net_load_kwh, color: '#007AFF' },
                          { label: displayReKwh > 0 && simReKwh === 0 ? '再生能源（現有）' : '再生能源', value: displayReKwh, color: '#34C759' },
                        ]
                        return items.map((item) => {
                          const pct = totalKwh > 0 ? item.value / totalKwh : 0
                          const isRe = item.color === '#34C759'
                          const showSrcBreakdown = isRe && displayReKwh > 0 && reSourceConfigs && reSourceConfigs.length > 0
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
                              {showSrcBreakdown && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 pl-0.5" style={{ fontSize: 10.5 }}>
                                  {computeReProportions(reSourceConfigs).map(({ source_type, pct: srcPct }) => {
                                    const meta = RE_SOURCE_META[source_type]
                                    return (
                                      <span key={source_type} className="text-ios-gray2">
                                        {meta?.icon} {meta?.label}
                                        {reSourceConfigs.length > 1 && <span className="font-data text-ios-green/70 ml-1">≈ {srcPct.toFixed(0)}%</span>}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="section-title">年度成本明細</p>
                    <div className="space-y-2" style={{ fontSize: 12.5 }}>
                      {(() => {
                        const hasPpa = annualPpaCostNtd > 0
                        const baseLabel = hasPpa ? '台電購電費' : '基準年費'
                        const baseValue = fmtNtd(simResult.kpis.baseline_annual_cost)
                        const rows = [
                          { k: baseLabel, v: baseValue, color: 'text-gray-700 dark:text-gray-300' },
                          ...(hasPpa ? [{ k: '綠電 PPA 費', v: fmtNtd(annualPpaCostNtd), color: 'text-ios-green' }] : []),
                          { k: '模擬後電費', v: fmtNtd(simResult.kpis.scenario_annual_cost), color: 'text-ios-blue' },
                          { k: 'O&M 成本',   v: `- ${fmtNtd(simResult.kpis.total_annual_om)}`, color: 'text-gray-400' },
                          ...(simResult.kpis.annual_fuel_cost_ntd > 0 ? [{ k: '燃料成本', v: `- ${fmtNtd(simResult.kpis.annual_fuel_cost_ntd)}`, color: 'text-ios-red' }] : []),
                        ]
                        return rows.map(({ k, v, color }) => (
                          <div key={k} className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">{k}</span>
                            <span className={`font-data font-semibold ${color}`}>{v}</span>
                          </div>
                        ))
                      })()}
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
                        <td className="font-data text-ios-gray1">{fmtNum(m.peak_kwh)}</td>
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
                        {fmtNum(item.value, 1)} tCO₂e
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
                    {fmtNum(simResult.kpis.carbon_reduction_tons, 1)}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 mt-1" style={{ fontSize: 12.5 }}>
                    tCO₂e 年減碳量 ({fmtPct(simResult.kpis.carbon_reduction_pct)})
                  </p>
                </div>
              </div>

              <div className="card space-y-2.5">
                <p className="section-title">減碳相當於</p>
                {[
                  { icon: '🚗', label: '少開汽車',     value: `${fmtNum(simResult.kpis.carbon_reduction_tons * 4500)} km`,   color: '#007AFF' },
                  { icon: '🌳', label: '種植樹木',     value: `${fmtNum(simResult.kpis.carbon_reduction_tons * 55)} 棵/年`,   color: '#34C759' },
                  { icon: '✈️', label: '台北→東京飛行', value: `${fmtNum(simResult.kpis.carbon_reduction_tons * 0.9, 1)} 趟`,    color: '#FF9500' },
                  { icon: '🏠', label: '家庭用電',     value: `${fmtNum(simResult.kpis.carbon_reduction_tons * 1000 / 0.494 / 3600)} 戶/年`, color: '#AF52DE' },
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
