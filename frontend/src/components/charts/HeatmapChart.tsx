import { useState, useMemo } from 'react'
import type { HeatmapCell } from '@/types'

interface Props { data: HeatmapCell[] }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOURS  = Array.from({ length: 24 }, (_, i) => i)

// Thermal heatmap: blue (low) → green → yellow → orange → red (high)
function kwToColor(value: number, min: number, max: number): string {
  if (max <= min) return 'rgb(59,130,246)'
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))

  const stops = [
    { t: 0.00, r: 59,  g: 130, b: 246 },  // blue
    { t: 0.25, r: 34,  g: 197, b: 94  },  // green
    { t: 0.50, r: 250, g: 204, b: 21  },  // yellow
    { t: 0.75, r: 249, g: 115, b: 22  },  // orange
    { t: 1.00, r: 239, g: 68,  b: 68  },  // red
  ]

  let lo = stops[0], hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i]; hi = stops[i + 1]; break
    }
  }
  const range = hi.t - lo.t || 1
  const f = (t - lo.t) / range
  const r = Math.round(lo.r + (hi.r - lo.r) * f)
  const g = Math.round(lo.g + (hi.g - lo.g) * f)
  const b = Math.round(lo.b + (hi.b - lo.b) * f)
  return `rgb(${r},${g},${b})`
}

// ── TOU pricing classification (台電高壓時間電價) ──────────────────────────
type TouZone = 'peak' | 'semi' | 'offpeak'

const TOU_META: Record<TouZone, { label: string; labelEn: string; color: string; rgb: string }> = {
  peak:    { label: '尖峰',   labelEn: 'Peak',     color: '#FF3B30', rgb: '255,59,48'  },
  semi:    { label: '半尖峰', labelEn: 'Semi-peak', color: '#FF9500', rgb: '255,149,0'  },
  offpeak: { label: '離峰',   labelEn: 'Off-peak',  color: '#007AFF', rgb: '0,122,255'  },
}

function getTouZone(month: number, hour: number): TouZone {
  // Off-peak: 22:30–07:30 → approximate as hour < 8 or hour >= 23
  if (hour < 8 || hour >= 23) return 'offpeak'
  const isSummer = month >= 6 && month <= 9
  if (isSummer) {
    // Peak: 10:00–12:00, 13:00–17:00 (weekdays only, but averaged across all days)
    if ((hour >= 10 && hour < 12) || (hour >= 13 && hour < 17)) return 'peak'
  }
  // Semi-peak: remaining daytime (7:30–22:30) — includes non-summer full daytime
  return 'semi'
}

function touColor(zone: TouZone, value: number, min: number, max: number): string {
  // Opacity 0.18 (min load) → 0.90 (max load) so zone color stays visible at all levels
  const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5
  const alpha = (0.18 + 0.72 * t).toFixed(2)
  return `rgba(${TOU_META[zone].rgb},${alpha})`
}

interface TooltipState {
  month: number; hour: number; value: number; x: number; y: number
}

type ViewMode = 'baseline' | 'scenario' | 'tou'

export default function HeatmapChart({ data }: Props) {
  const [mode, setMode] = useState<ViewMode>('baseline')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const grid = useMemo(() => {
    const map: Record<string, HeatmapCell> = {}
    data.forEach(c => { map[`${c.month}-${c.hour}`] = c })
    return map
  }, [data])

  const kw = (c: HeatmapCell) => mode === 'scenario' ? c.scenario_kw : c.baseline_kw
  const values = data.map(c => kw(c))
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)

  const cellW = 100 / 24
  const rowH  = 22

  const legendStops = [0, 0.25, 0.5, 0.75, 1.0].map(t => ({
    color: kwToColor(minVal + t * (maxVal - minVal), minVal, maxVal),
    label: `${(minVal + t * (maxVal - minVal)).toFixed(0)} kW`,
  }))

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'baseline', label: '基準負載' },
    { key: 'scenario', label: '模擬後負載' },
    { key: 'tou',      label: '時段電費分布' },
  ]

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 rounded-ios-sm" style={{ background: 'rgba(0,0,0,0.05)' }}>
          {VIEW_TABS.map(t => (
            <button key={t.key} onClick={() => setMode(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200 ${
                mode === t.key
                  ? 'bg-white text-ios-blue shadow-ios'
                  : 'text-ios-gray1 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        {mode !== 'tou' && (
          <span className="text-xs text-ios-gray2 font-data ml-auto">
            {minVal.toFixed(0)} – {maxVal.toFixed(0)} kW
          </span>
        )}
        {mode === 'tou' && (
          <span className="text-xs text-ios-gray2 ml-auto">
            顏色＝時段別　深淺＝負載強度（均含平假日平均）
          </span>
        )}
      </div>

      {/* Heatmap grid */}
      <div className="relative select-none overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Hour header */}
          <div className="flex mb-1 pl-10">
            {HOURS.map(h => (
              <div key={h} className="text-center text-ios-gray2 font-data"
                style={{ width: `${cellW}%`, fontSize: 9 }}>
                {h % 3 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>

          {/* Rows */}
          {MONTHS.map((mLabel, mIdx) => {
            const month = mIdx + 1
            return (
              <div key={month} className="flex items-center mb-px">
                <div className="w-10 shrink-0 text-right pr-2 text-ios-gray2 font-data"
                  style={{ fontSize: 10 }}>
                  {mLabel}
                </div>
                <div className="flex flex-1 rounded-sm overflow-hidden">
                  {HOURS.map(hour => {
                    const cell = grid[`${month}-${hour}`]
                    const val = cell ? kw(cell) : 0
                    const zone = getTouZone(month, hour)
                    const color = mode === 'tou'
                      ? touColor(zone, val, minVal, maxVal)
                      : kwToColor(val, minVal, maxVal)
                    return (
                      <div
                        key={hour}
                        style={{ width: `${cellW}%`, height: rowH, background: color, transition: 'opacity 0.15s' }}
                        className="cursor-crosshair hover:opacity-75"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTooltip({ month, hour, value: val, x: rect.left, y: rect.top })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Hour footer */}
          <div className="flex mt-1 pl-10">
            {HOURS.map(h => (
              <div key={h} className="text-center text-ios-gray2 font-data"
                style={{ width: `${cellW}%`, fontSize: 9 }}>
                {h === 0 ? '深夜' : h === 6 ? '清晨' : h === 12 ? '中午' : h === 18 ? '傍晚' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Color legend */}
      {mode !== 'tou' ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-ios-gray2 font-data">低</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{
            background: `linear-gradient(to right, ${legendStops.map(s => s.color).join(', ')})`,
          }} />
          <span className="text-xs text-ios-gray2 font-data">高</span>
          <div className="flex gap-3 ml-3">
            {legendStops.filter((_, i) => i % 2 === 0).map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm border border-black/10" style={{ background: s.color }} />
                <span className="text-xs text-ios-gray2 font-data">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          {(Object.keys(TOU_META) as TouZone[]).map(zone => (
            <div key={zone} className="flex items-center gap-2 rounded-ios-sm px-3 py-1.5"
              style={{ background: `rgba(${TOU_META[zone].rgb},0.10)`, border: `1px solid rgba(${TOU_META[zone].rgb},0.20)` }}>
              <div className="w-3 h-3 rounded-sm" style={{ background: `rgba(${TOU_META[zone].rgb},0.65)` }} />
              <div>
                <span className="text-xs font-semibold" style={{ color: TOU_META[zone].color }}>
                  {TOU_META[zone].label}
                </span>
                <span className="text-xs text-ios-gray2 ml-1.5 font-data">
                  {zone === 'peak'
                    ? '夏月（6–9月）平日 10–12h、13–17h'
                    : zone === 'semi'
                    ? '平日 08–22h（非尖峰以外）＋週六 08–22h'
                    : '23h–07h、週日及國定假日全日'}
                </span>
              </div>
            </div>
          ))}
          <p className="text-xs text-ios-gray2 w-full mt-0.5">
            ※ 深淺代表平均負載強度。熱圖數值為月份×小時全天平均（含平日／週六／週日混合），
            週六半尖峰已列於說明但無法在格子層級單獨顯示；實際電費計算以台電帳單為準。
          </p>
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-ios-sm border border-black/8 px-3 py-2 text-xs"
          style={{
            top: tooltip.y - 80,
            left: tooltip.x - 20,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
          <div className="font-semibold text-ios-blue">
            {MONTHS[tooltip.month - 1]} · {String(tooltip.hour).padStart(2,'0')}:00
          </div>
          <div className="text-gray-600 font-data">{tooltip.value.toFixed(1)} kW 平均</div>
          {mode === 'tou' && (() => {
            const zone = getTouZone(tooltip.month, tooltip.hour)
            return (
              <div className="mt-1 font-semibold" style={{ color: TOU_META[zone].color }}>
                {TOU_META[zone].label}（{TOU_META[zone].labelEn}）
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
