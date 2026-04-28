import { useState, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useSandboxStore } from '@/store/useSandboxStore'
import { runSimulation, fetchInsights } from '@/api/simulation'
import { runDemandResponse } from '@/api/demand_response'
import AssetForm from '@/components/sandbox/AssetForm'
import type { Asset, DRProgram, DRNotification } from '@/types'
import clsx from 'clsx'

const ASSET_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  solar_self:     { bg: 'rgba(255,149,0,0.09)',  text: '#FF9500', border: 'rgba(255,149,0,0.20)'  },
  solar_purchase: { bg: 'rgba(255,149,0,0.09)',  text: '#FF9500', border: 'rgba(255,149,0,0.20)'  },
  wind:           { bg: 'rgba(90,200,250,0.10)', text: '#5AC8FA', border: 'rgba(90,200,250,0.24)' },
  hydro:          { bg: 'rgba(0,122,255,0.09)',  text: '#007AFF', border: 'rgba(0,122,255,0.20)'  },
  hvac:           { bg: 'rgba(175,82,222,0.09)', text: '#AF52DE', border: 'rgba(175,82,222,0.20)' },
  storage:        { bg: 'rgba(52,199,89,0.09)',  text: '#34C759', border: 'rgba(52,199,89,0.20)'  },
  ev:             { bg: 'rgba(88,86,214,0.09)',  text: '#5856D6', border: 'rgba(88,86,214,0.20)'  },
  sofc:           { bg: 'rgba(231,111,81,0.09)', text: '#e76f51', border: 'rgba(231,111,81,0.20)' },
  natgas:         { bg: 'rgba(109,104,117,0.09)',text: '#6d6875', border: 'rgba(109,104,117,0.20)'},
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

/* ── SVG icons ── */
function IconHome() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 6.8L7.5 1.5L13.5 6.8V13.5H9.5V9.5H5.5V13.5H1.5V6.8Z"
        stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  )
}
function IconBolt() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M8.8 1.5L3 8.5H7.5L6.2 13.5L12 6.5H7.5L8.8 1.5Z"
        stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function IconGear() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 1.5V3M7.5 12V13.5M1.5 7.5H3M12 7.5H13.5
               M3.2 3.2L4.2 4.2M10.8 10.8L11.8 11.8
               M3.2 11.8L4.2 10.8M10.8 4.2L11.8 3.2"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Nav item ── */
function NavItem({ to, icon, label, onClick }: {
  to: string; icon: React.ReactNode; label: string; onClick?: () => void
}) {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  return (
    <Link to={to} onClick={onClick} className={clsx('nav-item', isActive && 'active')}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {isActive && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#007AFF', boxShadow: '0 0 6px rgba(0,122,255,0.55)' }} />
      )}
    </Link>
  )
}

/* ── Step badge ── */
function StepBadge({ n, color }: { n: string; color: string }) {
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
      style={{
        fontSize: 10,
        background: `${color}14`,
        color,
        border: `1px solid ${color}28`,
      }}
    >
      {n}
    </span>
  )
}

interface SidebarProps { onClose?: () => void }

export default function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation()
  const isDashboard = location.pathname === '/'

  const {
    baseline, setBaseline,
    assets, addAsset, removeAsset, clearAssets,
    setSimResult, setIsSimulating, setSimError, isSimulating,
    setInsights, setIsLoadingInsights,
    drConfig, setDrConfig,
    setDrResult, isDrSimulating, setIsDrSimulating, setDrError,
  } = useSandboxStore()

  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showDrPanel, setShowDrPanel]     = useState(false)

  const handleReset = () => {
    setBaseline(null)
    clearAssets()
    setSimResult(null)
    setInsights([])
    setSimError(null)
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

  const isBiddingProgram = drConfig.program.startsWith('bid_')

  return (
    <aside className="w-full shrink-0 flex flex-col overflow-y-auto glass-sidebar">

      {/* ── Navigation Rail ── */}
      <nav className="px-3 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.055)' }}>
        <div className="space-y-0.5">
          <NavItem to="/" icon={<IconHome />} label="總覽" onClick={onClose} />
          <NavItem to="/strategy" icon={<IconBolt />} label="策略規劃" onClick={onClose} />
          <NavItem to="/settings" icon={<IconGear />} label="設定" onClick={onClose} />
        </div>
      </nav>

      {/* ── Baseline status strip (dashboard, data loaded) ── */}
      {baseline && isDashboard && (
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.055)' }}>
          <div
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 animate-scale-in"
            style={{
              background: 'rgba(52,199,89,0.07)',
              border: '1px solid rgba(52,199,89,0.18)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
            }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold"
              style={{ fontSize: 10, background: 'rgba(52,199,89,0.18)', color: '#34C759' }}
            >
              ✓
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold" style={{ fontSize: 11.5, color: '#34C759' }}>
                基準資料已載入
              </div>
              <div className="font-data text-gray-400 dark:text-gray-500 truncate" style={{ fontSize: 10.5 }}>
                {baseline.peak_kw.toFixed(0)} kW &middot; {(baseline.total_kwh / 1e6).toFixed(2)} GWh
              </div>
            </div>
            <button
              onClick={handleReset}
              className="shrink-0 font-semibold transition-colors hover:text-ios-red text-gray-400 dark:text-gray-600"
              style={{ fontSize: 11 }}
              title="清除資料，重新載入"
            >
              更換
            </button>
          </div>
        </div>
      )}

      {/* ── No baseline prompt (dashboard only) ── */}
      {!baseline && isDashboard && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 text-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,122,255,0.07)', border: '1px solid rgba(0,122,255,0.14)' }}
          >
            <span style={{ fontSize: 22 }}>📊</span>
          </div>
          <p className="text-gray-400 dark:text-gray-600 leading-relaxed" style={{ fontSize: 12.5 }}>
            在右側主畫面載入用電資料，
            <br />即可在此配置能源資產
          </p>
        </div>
      )}

      {/* ── Assets — dashboard only, once baseline loaded ── */}
      {baseline && isDashboard && (
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <div className="sidebar-section-title">
              <StepBadge n="1" color="#007AFF" />
              <span className="sidebar-section-title-text" style={{ color: '#007AFF' }}>
                能源資產配置
              </span>
            </div>
            <button
              onClick={() => setShowAssetForm(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold transition-all active:scale-95"
              style={{
                fontSize: 11.5,
                background: 'rgba(0,122,255,0.09)',
                color: '#007AFF',
                border: '1px solid rgba(0,122,255,0.20)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
              }}
            >
              + 新增
            </button>
          </div>

          <div className="px-3 pb-4 flex flex-col gap-2">
            {showAssetForm && (
              <div className="animate-scale-in">
                <AssetForm onAdd={handleAddAsset} onCancel={() => setShowAssetForm(false)} />
              </div>
            )}

            {assets.length === 0 && !showAssetForm && (
              <div className="py-8 text-center">
                <p className="mb-2" style={{ fontSize: 32 }}>🏭</p>
                <p className="text-gray-400 dark:text-gray-600 leading-relaxed" style={{ fontSize: 12 }}>
                  點擊「+ 新增」加入能源資產<br />開始數位孿生模擬
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              {assets.map((a) => {
                const c = ASSET_COLORS[a.type] ?? { bg: 'rgba(0,122,255,0.07)', text: '#007AFF', border: 'rgba(0,122,255,0.18)' }
                return (
                  <div
                    key={a.id}
                    className="group flex items-center justify-between rounded-[10px] px-3 py-2.5 animate-slide-in transition-all duration-200"
                    style={{
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-[8px]"
                        style={{ fontSize: 14, background: 'rgba(255,255,255,0.38)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}
                      >
                        {ASSET_ICONS[a.type] ?? '🏭'}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ fontSize: 12.5, color: c.text }}>{a.label}</div>
                        <div className="text-gray-400 dark:text-gray-500 truncate" style={{ fontSize: 11 }}>{a.name}</div>
                      </div>
                    </div>
                    <button
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 dark:text-gray-600 hover:bg-red-100 dark:hover:bg-red-500/15 hover:text-ios-red transition-all ml-2 opacity-0 group-hover:opacity-100"
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

      {/* ── DR — dashboard only, collapsible ── */}
      {baseline && isDashboard && (
        <div className="sidebar-section">
          <button
            onClick={() => setShowDrPanel(!showDrPanel)}
            className="w-full text-left hover:opacity-80 transition-opacity"
          >
            <div className="sidebar-section-header">
              <div className="sidebar-section-title">
                <StepBadge n="2" color="#5856D6" />
                <span className="sidebar-section-title-text" style={{ color: '#5856D6' }}>
                  需量反應試算
                </span>
              </div>
              <span className="text-gray-400 dark:text-gray-600">
                <IconChevron open={showDrPanel} />
              </span>
            </div>
          </button>

          {showDrPanel && (
            <div className="px-3 pb-4 space-y-3 animate-scale-in">
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

              {isBiddingProgram ? (
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
              ) : (
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
                style={!isDrSimulating ? {
                  background: 'linear-gradient(145deg, #6e6cd8, #5856D6)',
                  boxShadow: '0 2px 12px rgba(88,86,214,0.38), inset 0 1px 0 rgba(255,255,255,0.22)',
                } : undefined}
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
