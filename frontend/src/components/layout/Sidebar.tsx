import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSandboxStore } from '@/store/useSandboxStore'
import { generateSample, uploadBaseline, runSimulation, fetchInsights, DEMO_ASSETS } from '@/api/simulation'
import { runDemandResponse } from '@/api/demand_response'
import AssetForm from '@/components/sandbox/AssetForm'
import MonthlyBillForm from '@/components/sidebar/MonthlyBillForm'
import type { Asset, DRProgram, DRNotification, MonthlyBillSummary } from '@/types'
import clsx from 'clsx'

type InputMode = 'sample' | 'csv' | 'bill'

const ASSET_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  solar_self:     { bg: 'rgba(255,149,0,0.09)',  text: '#FF9500', border: 'rgba(255,149,0,0.18)'  },
  solar_purchase: { bg: 'rgba(255,149,0,0.09)',  text: '#FF9500', border: 'rgba(255,149,0,0.18)'  },
  wind:           { bg: 'rgba(90,200,250,0.10)', text: '#5AC8FA', border: 'rgba(90,200,250,0.22)' },
  hydro:          { bg: 'rgba(0,122,255,0.09)',  text: '#007AFF', border: 'rgba(0,122,255,0.18)'  },
  hvac:           { bg: 'rgba(175,82,222,0.09)', text: '#AF52DE', border: 'rgba(175,82,222,0.18)' },
  storage:        { bg: 'rgba(52,199,89,0.09)',  text: '#34C759', border: 'rgba(52,199,89,0.18)'  },
  ev:             { bg: 'rgba(88,86,214,0.09)',  text: '#5856D6', border: 'rgba(88,86,214,0.18)'  },
  sofc:           { bg: 'rgba(231,111,81,0.09)', text: '#e76f51', border: 'rgba(231,111,81,0.18)' },
  natgas:         { bg: 'rgba(109,104,117,0.09)',text: '#6d6875', border: 'rgba(109,104,117,0.18)'},
}
const ASSET_ICONS: Record<string, string> = {
  solar_self: '☀️', solar_purchase: '☀️', wind: '💨',
  hydro: '💧', hvac: '❄️', storage: '🔋', ev: '⚡',
  sofc: '🔥', natgas: '⚙️',
}

const DR_PROGRAMS: { value: DRProgram; label: string }[] = [
  { value: 'planned_monthly', label: '計畫性－月選8日型' },
  { value: 'planned_daily',   label: '計畫性－日選時段型' },
  { value: 'rt_guaranteed',   label: '即時性－保證反應型' },
  { value: 'rt_flexible',     label: '即時性－彈性反應型' },
  { value: 'bid_economic',    label: '競價－經濟型' },
  { value: 'bid_reliable',    label: '競價－可靠型' },
]

const DR_NOTIF: { value: DRNotification; label: string }[] = [
  { value: 'day_ahead',    label: '日前通知' },
  { value: 'same_day_2h', label: '當日 2 小時前 (+20%)' },
  { value: 'same_day_1h', label: '當日 1 小時前 (+20%)' },
]

interface SidebarProps {
  onClose?: () => void
}

/* ── Section header ── */
function SectionHeader({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span className="font-bold text-gray-600 dark:text-gray-400" style={{ fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {action}
    </div>
  )
}

export default function Sidebar({ onClose }: SidebarProps) {
  const navigate  = useNavigate()
  const {
    baseline, setBaseline,
    assets, addAsset, removeAsset, clearAssets,
    setSimResult, setIsSimulating, setSimError, isSimulating,
    setInsights, setIsLoadingInsights,
    tariff, financial,
    drConfig, setDrConfig,
    setDrResult, isDrSimulating, setIsDrSimulating, setDrError,
  } = useSandboxStore()

  const [peakKw, setPeakKw]               = useState(1000)
  const [year, setYear]                   = useState(2024)
  const [loadingBaseline, setLoadingBaseline] = useState(false)
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showDrPanel, setShowDrPanel]     = useState(false)
  const [inputMode, setInputMode]         = useState<InputMode>('sample')
  const [reHint, setReHint]               = useState<{ kwh: number; cap: number } | null>(null)

  // Load demo baseline + preset assets + run simulation in one step
  const handleSample = async () => {
    setLoadingBaseline(true)
    setSimError(null)
    try {
      const b = await generateSample(peakKw, year)
      setBaseline(b)               // clears assets & simResult
      clearAssets()
      DEMO_ASSETS.forEach(addAsset)
      navigate('/')
      onClose?.()
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
      setLoadingBaseline(false)
      setIsSimulating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingBaseline(true)
    try {
      const b = await uploadBaseline(file)
      setBaseline(b)
      navigate('/')
      onClose?.()
    } catch (err: unknown) { alert((err as Error).message) }
    finally { setLoadingBaseline(false) }
  }

  const handleSimulate = useCallback(async () => {
    const { baseline: bl, assets: as_, tariff: tr, financial: fi } = useSandboxStore.getState()
    if (!bl) return
    setIsSimulating(true)
    setSimError(null)
    setInsights([])
    try {
      const result = await runSimulation(bl.data_id, as_, tr, fi)
      setSimResult(result)
      setIsLoadingInsights(true)
      fetchInsights(result, as_.map(a => a.type))
        .then(setInsights).catch(() => setInsights([]))
        .finally(() => setIsLoadingInsights(false))
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes('404') || msg.includes('not found')) {
        setBaseline(null)
        setSimError('基本資料已過期，請重新載入用電資料。')
      } else {
        setSimError(msg)
      }
    } finally { setIsSimulating(false) }
  }, [setSimResult, setIsSimulating, setSimError, setInsights, setIsLoadingInsights, setBaseline])

  const handleAddAsset = (asset: Asset) => {
    addAsset(asset)
    setShowAssetForm(false)
    setTimeout(handleSimulate, 100)
  }

  const handleDrSimulate = async () => {
    if (!baseline) return
    setIsDrSimulating(true)
    setDrError(null)
    try {
      const result = await runDemandResponse(baseline.data_id, drConfig)
      setDrResult(result)
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes('404') || msg.includes('not found')) {
        setBaseline(null)
        setDrError('基本資料已過期，請重新載入用電資料。')
      } else {
        setDrError(msg)
      }
    } finally { setIsDrSimulating(false) }
  }

  const handleBillSuccess = (result: MonthlyBillSummary) => {
    setBaseline(result)
    if (result.re_kwh > 0 && result.suggested_re_capacity_kw > 0) {
      setReHint({ kwh: result.re_kwh, cap: result.suggested_re_capacity_kw })
    }
    navigate('/')
    onClose?.()
  }

  const isBiddingProgram = drConfig.program.startsWith('bid_')

  return (
    <aside className="w-full shrink-0 flex flex-col overflow-y-auto border-r border-black/[0.07] dark:border-white/[0.07] glass-sidebar">

      {/* ── Baseline ── */}
      <div className="border-b border-black/[0.06] dark:border-white/[0.06]">
        <SectionHeader icon="📊" title="用電基本資料" />

        <div className="px-4 pb-4">
          {!baseline ? (
            <div className="space-y-3">
              {/* Mode tabs */}
              <div className="flex gap-0.5 p-0.5 rounded-[9px] bg-black/[0.05] dark:bg-white/[0.06]">
                {([
                  { id: 'sample', label: '示範資料' },
                  { id: 'csv',    label: 'CSV' },
                  { id: 'bill',   label: '電費單' },
                ] as { id: InputMode; label: string }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setInputMode(tab.id)}
                    className={clsx(
                      'flex-1 py-1.5 rounded-[7px] font-medium transition-all duration-200',
                      inputMode === tab.id
                        ? 'bg-white dark:bg-white/[0.15] text-ios-blue shadow-ios'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    )}
                    style={{ fontSize: 12 }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Sample mode */}
              {inputMode === 'sample' && (
                <div className="space-y-3 animate-scale-in">
                  <div>
                    <label className="label">尖峰需量 (kW)</label>
                    <input className="input" type="number" value={peakKw}
                      onChange={(e) => setPeakKw(+e.target.value)} min={100} max={50000} step={100} />
                  </div>
                  <div>
                    <label className="label">年份</label>
                    <select className="input" value={year} onChange={(e) => setYear(+e.target.value)}>
                      {[2022, 2023, 2024, 2025].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <button className="btn-primary w-full" onClick={handleSample} disabled={loadingBaseline || isSimulating}>
                    {loadingBaseline || isSimulating
                      ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />模擬運算中…</>
                      : '🚀 一鍵載入示範'}
                  </button>
                  <p className="text-center text-gray-400 dark:text-gray-500" style={{ fontSize: 11 }}>
                    合成負載 · 加入太陽能 + 儲能 + 風力 · 自動出圖
                  </p>
                </div>
              )}

              {/* CSV upload mode */}
              {inputMode === 'csv' && (
                <div className="space-y-3 animate-scale-in">
                  <label className={clsx('btn-secondary w-full cursor-pointer', loadingBaseline && 'opacity-40 pointer-events-none')}>
                    {loadingBaseline
                      ? <><div className="w-3.5 h-3.5 border-2 border-ios-blue/40 border-t-ios-blue rounded-full animate-spin-slow" />上傳中</>
                      : '選擇 CSV 檔案'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleUpload} />
                  </label>
                  <div
                    className="rounded-[9px] p-3 space-y-1"
                    style={{
                      background: 'rgba(0,0,0,0.03)',
                      border: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <p className="font-bold text-gray-500 dark:text-gray-400" style={{ fontSize: 11 }}>格式說明</p>
                    <p className="font-data text-gray-400" style={{ fontSize: 11 }}>timestamp, load_kw</p>
                    <p className="font-data text-gray-400" style={{ fontSize: 11 }}>2024-01-01 00:00, 850.2</p>
                    <p className="font-data text-gray-400" style={{ fontSize: 11 }}>2024-01-01 00:15, 842.7</p>
                    <p className="text-gray-400 mt-1" style={{ fontSize: 11 }}>15 分鐘間隔，至少 1 天</p>
                  </div>
                </div>
              )}

              {/* Monthly bill mode */}
              {inputMode === 'bill' && (
                <div className="animate-scale-in">
                  <MonthlyBillForm onSuccess={handleBillSuccess} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {[
                ['尖峰需量', `${baseline.peak_kw.toFixed(0)} kW`],
                ['年用電量', `${(baseline.total_kwh / 1e6).toFixed(2)} GWh`],
                ['期間',     `${baseline.date_start} ~ ${baseline.date_end.slice(5)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1">
                  <span className="text-gray-400 dark:text-gray-500" style={{ fontSize: 12.5 }}>{k}</span>
                  <span className="font-data font-semibold text-gray-700 dark:text-gray-300" style={{ fontSize: 12 }}>{v}</span>
                </div>
              ))}
              <button className="btn-danger w-full mt-1 text-xs" onClick={() => { setBaseline(null); setReHint(null) }}>
                重置資料
              </button>
              {reHint && (
                <div
                  className="mt-2 rounded-[9px] p-3 space-y-1.5 animate-scale-in"
                  style={{ background: 'rgba(52,199,89,0.07)', border: '1px solid rgba(52,199,89,0.18)' }}
                >
                  <p className="font-bold text-ios-green" style={{ fontSize: 12 }}>✦ 偵測到綠電轉供</p>
                  <p className="text-gray-500 dark:text-gray-400 leading-relaxed" style={{ fontSize: 11.5 }}>
                    {(reHint.kwh / 1000).toFixed(0)} MWh／年，
                    建議加入「外購太陽能」資產（約 {reHint.cap.toFixed(0)} kW）
                  </p>
                  <button
                    className="text-ios-green font-bold hover:opacity-70 transition-opacity"
                    style={{ fontSize: 12 }}
                    onClick={() => setReHint(null)}>
                    知道了 ×
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Assets ── */}
      {baseline && (
        <div className="border-b border-black/[0.06] dark:border-white/[0.06]">
          <SectionHeader
            icon="🏭"
            title="沙盒資產"
            action={
              <button
                onClick={() => setShowAssetForm(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold transition-all hover:opacity-80"
                style={{
                  fontSize: 11.5,
                  background: 'rgba(0,122,255,0.09)',
                  color: '#007AFF',
                  border: '1px solid rgba(0,122,255,0.18)',
                }}
              >
                + 新增
              </button>
            }
          />

          <div className="px-4 pb-4 flex flex-col gap-2">
            {showAssetForm && (
              <div className="animate-scale-in">
                <AssetForm onAdd={handleAddAsset} onCancel={() => setShowAssetForm(false)} />
              </div>
            )}

            {assets.length === 0 && !showAssetForm && (
              <div className="py-6 text-center">
                <p className="text-gray-300 dark:text-gray-600 mb-1" style={{ fontSize: 28 }}>🏭</p>
                <p className="text-gray-400 dark:text-gray-500 leading-relaxed" style={{ fontSize: 12 }}>
                  點擊「+ 新增」加入能源資產<br/>開始數位孿生模擬
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              {assets.map((a) => {
                const c = ASSET_COLORS[a.type] ?? { bg: 'rgba(0,122,255,0.07)', text: '#007AFF', border: 'rgba(0,122,255,0.14)' }
                return (
                  <div
                    key={a.id}
                    className="group flex items-center justify-between rounded-[9px] px-3 py-2 animate-slide-in"
                    style={{ background: c.bg, border: `1px solid ${c.border}` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span style={{ fontSize: 15 }} className="shrink-0">{ASSET_ICONS[a.type] ?? '🏭'}</span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ fontSize: 12.5, color: c.text }}>{a.label}</div>
                        <div className="text-gray-400 dark:text-gray-500 truncate" style={{ fontSize: 11 }}>{a.name}</div>
                      </div>
                    </div>
                    <button
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 dark:text-gray-600 hover:bg-red-100 dark:hover:bg-red-500/15 hover:text-ios-red transition-all ml-2"
                      style={{ fontSize: 14 }}
                      onClick={() => { removeAsset(a.id); setTimeout(handleSimulate, 100) }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>

            {assets.length > 0 && (
              <div className="space-y-2 mt-1">
                <button className="btn-primary w-full" onClick={handleSimulate} disabled={isSimulating}>
                  {isSimulating
                    ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />模擬中</>
                    : '▶ 執行模擬'}
                </button>
                <button
                  className="btn-ghost w-full text-gray-400 dark:text-gray-500"
                  style={{ fontSize: 12 }}
                  onClick={() => { clearAssets(); setInsights([]) }}
                >
                  清空所有資產
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Demand Response ── */}
      {baseline && (
        <div>
          <button
            onClick={() => setShowDrPanel(!showDrPanel)}
            className="w-full flex items-center justify-between group"
          >
            <SectionHeader
              icon="🔌"
              title="需量反應試算"
            />
            <span
              className="mr-4 text-gray-400 transition-transform duration-200"
              style={{ transform: showDrPanel ? 'rotate(90deg)' : 'none', fontSize: 16 }}
            >
              ›
            </span>
          </button>

          {showDrPanel && (
            <div className="px-4 pb-4 space-y-3 animate-scale-in">
              <div>
                <label className="label">方案類型</label>
                <select className="input" value={drConfig.program}
                  onChange={(e) => setDrConfig({ ...drConfig, program: e.target.value as DRProgram })}>
                  {DR_PROGRAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className="label">約定抑低容量 (kW)</label>
                <input className="input" type="number" value={drConfig.contracted_kw}
                  onChange={(e) => setDrConfig({ ...drConfig, contracted_kw: +e.target.value })}
                  min={20} step={50} />
              </div>

              {isBiddingProgram && (
                <div>
                  <label className="label">
                    報價 (元/度)
                    <span className="text-ios-indigo font-data ml-1 normal-case" style={{ letterSpacing: 0 }}>
                      NT${drConfig.bid_price_ntd_per_kwh.toFixed(1)}
                    </span>
                  </label>
                  <input type="range" min={0} max={10} step={0.5}
                    value={drConfig.bid_price_ntd_per_kwh}
                    onChange={(e) => setDrConfig({ ...drConfig, bid_price_ntd_per_kwh: +e.target.value })}
                    className="w-full accent-ios-indigo" />
                  <div className="flex justify-between font-data text-gray-400 mt-0.5" style={{ fontSize: 11 }}>
                    <span>0</span><span>5</span><span>10 元/度</span>
                  </div>
                </div>
              )}

              {!isBiddingProgram && (
                <div>
                  <label className="label">台電固定費率 (元/度)</label>
                  <input className="input" type="number" value={drConfig.bid_price_ntd_per_kwh}
                    onChange={(e) => setDrConfig({ ...drConfig, bid_price_ntd_per_kwh: +e.target.value })}
                    min={0.5} max={10} step={0.5} />
                </div>
              )}

              <div>
                <label className="label">每次執行時數 (hr)</label>
                <select className="input" value={drConfig.event_duration_hours}
                  onChange={(e) => setDrConfig({ ...drConfig, event_duration_hours: +e.target.value })}>
                  {[0.5, 1, 1.5, 2, 3, 4].map(h => <option key={h} value={h}>{h} 小時</option>)}
                </select>
              </div>

              <div>
                <label className="label">通知類型</label>
                <select className="input" value={drConfig.notification_type}
                  onChange={(e) => setDrConfig({ ...drConfig, notification_type: e.target.value as DRNotification })}>
                  {DR_NOTIF.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>

              <button
                className="btn-primary w-full"
                onClick={handleDrSimulate}
                disabled={isDrSimulating}
                style={{ background: 'linear-gradient(145deg, #6e6cd8, #5856D6)', boxShadow: '0 2px 10px rgba(88,86,214,0.32)' }}
              >
                {isDrSimulating
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />分析中</>
                  : '▶ 試算需量反應收益'}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
