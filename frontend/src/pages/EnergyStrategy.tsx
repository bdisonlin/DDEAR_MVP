import { useState, useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { useThemeContext } from '@/context/ThemeContext'

// ── Types ─────────────────────────────────────────────────────
interface EnergyParams {
  selfSolar: number; solarPPA: number; windPPA: number
  hydroPPA: number;  natgas: number;   sofc: number; bess: number
}

interface HourlyData {
  hour: number
  existingGen: number; existingSolar: number
  bess: number; selfSolar: number; solarPPA: number
  windPPA: number; hydroPPA: number; sofc: number; natgas: number; grid: number
}

interface DRPeriodConfig {
  id: string; label: string; labelSub: string
  start: number; end: number
  rateMultiplier: number; eventsPerYear: number
}

interface Scenario {
  id: string; label: string; icon: string; desc: string
  loadProfile: number[]   // 24-h total demand (h=0..23), before any existing asset offset
  peakKw: number
  existingGenKw: number   // existing generator kW (0 = none)
  genParalleled: boolean  // true = runs in parallel with grid, reduces grid draw
  existingSolarKw?: number // existing on-site solar self-use kW
}

// ── Scenario Datasets ─────────────────────────────────────────
// Digitised from actual customer load charts
const SCENARIOS: Scenario[] = [
  {
    id: 'ev_operator',
    label: '充電樁營運商',
    icon: '🔌',
    desc: '無發電機組及儲能 · 峰值 ~1,500 kW · 日間充電尖峰',
    peakKw: 1500,
    existingGenKw: 0,
    genParalleled: false,
    loadProfile: [500, 120, 50, 20, 15, 40, 220, 520, 820, 1100,
                  1350, 1280, 1150, 1080, 1050, 1020, 1010, 1000,
                  920, 870, 940, 830, 720, 580],
  },
  {
    id: 'bus_depot',
    label: '公車車廠充電樁',
    icon: '🚌',
    desc: '無發電機組及儲能 · 峰值 ~430 kW · 夜間充電為主',
    peakKw: 430,
    existingGenKw: 0,
    genParalleled: false,
    loadProfile: [400, 400, 355, 210, 55, 15, 20, 55, 130, 105,
                  135, 75, 62, 72, 260, 205, 165, 125, 210, 205,
                  205, 155, 125, 105],
  },
  {
    id: 'lab_office',
    label: '實驗室辦公室',
    icon: '🔬',
    desc: '台電 DR 調度時並聯機組 cover 約 28% 負載 · 峰值 ~850 kW',
    peakKw: 850,
    existingGenKw: 238,
    genParalleled: true,
    loadProfile: [380, 375, 370, 378, 382, 375, 368, 370, 610, 665,
                  685, 680, 655, 640, 665, 672, 785, 830, 685, 445,
                  422, 412, 402, 390],
  },
  {
    id: 'commercial',
    label: '對外營業場域',
    icon: '🏢',
    desc: '未並聯發電機組（cover 15%）· 峰值 ~1,500 kW',
    peakKw: 1500,
    existingGenKw: 225,
    genParalleled: false,
    loadProfile: [872, 862, 858, 848, 812, 778, 702, 725, 928, 1105,
                  1205, 1255, 1305, 1355, 1455, 1505, 1452, 1298, 798,
                  652, 622, 602, 605, 702],
  },
  {
    id: 'arts_venue',
    label: '藝文場館',
    icon: '🎭',
    desc: '無發電機組 · 峰值 ~870 kW · 夜間高負載',
    peakKw: 870,
    existingGenKw: 0,
    genParalleled: false,
    loadProfile: [822, 832, 838, 832, 825, 820, 295, 122, 152, 202,
                  262, 272, 262, 270, 232, 198, 178, 168, 158, 148,
                  152, 202, 232, 705],
  },
  {
    id: 'food_processing',
    label: '食品加工業',
    icon: '🏭',
    desc: '台電 DR 調度時發電機組 cover 約 52% 負載 · 峰值 ~1,050 kW · 全天連續製程',
    peakKw: 1050,
    existingGenKw: 546,
    genParalleled: true,
    loadProfile: [882, 872, 902, 892, 872, 882, 892, 882, 975, 1045,
                  1005, 952, 902, 962, 1045, 1022, 1002, 962, 932, 912,
                  922, 902, 892, 872],
  },
  {
    id: 'textile',
    label: '紡織業',
    icon: '🧵',
    desc: '無並聯機組・既有 650 kW 太陽能自發自用・峰值 ~1,530 kW・24h 連續製造',
    peakKw: 1530,
    existingGenKw: 0,
    genParalleled: false,
    existingSolarKw: 650,
    // Total production demand (before solar offset). Solar self-gen reduces
    // net grid draw during daylight — the chart will show this visually.
    // 00–06: flat night production ~1,490–1,500 kW
    // 07–17: daytime, total load fairly flat ~1,495–1,520 kW
    // 17–18: slight afternoon production peak ~1,525–1,530 kW
    // 19–23: evening normalises ~1,492–1,515 kW
    loadProfile: [1490, 1495, 1500, 1495, 1488, 1485, 1488, 1492,
                  1495, 1500, 1505, 1502, 1498, 1502, 1505, 1515,
                  1525, 1530, 1528, 1520, 1512, 1508, 1502, 1494],
  },
]

// ── DR Presets ────────────────────────────────────────────────
// 依據台電時間電價費率定義：
//   夏月（5/16–10/15 高壓）：尖峰 10–12 & 13–17；半尖峰 07:30–10 / 12–13 / 17–22:30
//   非夏月：無尖峰，半尖峰 07:30–22:30；離峰其餘時段
const DR_PRESETS: DRPeriodConfig[] = [
  { id: 'summer_peak', label: '夏季尖峰',   labelSub: '10–17時', start: 10, end: 17, rateMultiplier: 1.35, eventsPerYear: 60 },
  { id: 'summer_semi', label: '夏季半尖峰', labelSub: '17–22時', start: 17, end: 22, rateMultiplier: 1.00, eventsPerYear: 80 },
  { id: 'nonsummer',   label: '非夏月半峰', labelSub: '07–22時', start:  7, end: 22, rateMultiplier: 0.80, eventsPerYear: 50 },
  { id: 'custom',      label: '自訂時段',   labelSub: '自行設定', start: 14, end: 18, rateMultiplier: 1.00, eventsPerYear: 70 },
]

// ── Energy Constants ──────────────────────────────────────────
// Existing assets render at the bottom; grid (residual) at top
const STACK_KEYS: (keyof Omit<HourlyData, 'hour'>)[] = [
  'existingGen', 'existingSolar',
  'bess', 'selfSolar', 'solarPPA', 'windPPA', 'hydroPPA', 'sofc', 'natgas',
  'grid',
]

const ENERGY_COLORS: Record<string, string> = {
  existingGen:   '#a3a3a3',
  existingSolar: '#fde68a',
  bess:          '#22d3ee', selfSolar: '#fbbf24', solarPPA: '#fb923c',
  windPPA:       '#60a5fa', hydroPPA: '#34d399',  sofc:     '#f87171',
  natgas:        '#94a3b8', grid:      '#334155',
}

const ENERGY_LABELS: Record<string, string> = {
  existingGen:   '既有機組',
  existingSolar: '既有太陽能',
  bess:          '儲能 BESS', selfSolar: '自發太陽能', solarPPA: '太陽能 PPA',
  windPPA:       '風力 PPA',  hydroPPA:  '水力 PPA',  sofc:      'SOFC 燃料電池',
  natgas:        '天然氣發電', grid:      '電網灰電',
}

const CAPEX_UNIT: Record<keyof EnergyParams, number> = {
  selfSolar: 50_000, solarPPA: 3_000, windPPA: 5_000, hydroPPA: 4_000,
  natgas: 25_000, sofc: 80_000, bess: 60_000,
}

const SLIDER_CONFIG: { key: keyof EnergyParams; label: string; unit: string; max: number; color: string }[] = [
  { key: 'selfSolar', label: '自發太陽能',    unit: 'kW',  max: 2000, color: '#fbbf24' },
  { key: 'solarPPA',  label: '太陽能 PPA',    unit: 'kW',  max: 2000, color: '#fb923c' },
  { key: 'windPPA',   label: '風力 PPA',      unit: 'kW',  max: 1500, color: '#60a5fa' },
  { key: 'hydroPPA',  label: '水力 PPA',      unit: 'kW',  max: 1000, color: '#34d399' },
  { key: 'natgas',    label: '天然氣發電',    unit: 'kW',  max: 2000, color: '#94a3b8' },
  { key: 'sofc',      label: 'SOFC 燃料電池', unit: 'kW',  max: 1500, color: '#f87171' },
  { key: 'bess',      label: '儲能系統 BESS', unit: 'kWh', max: 2000, color: '#22d3ee' },
]

const DEFAULT_PARAMS: EnergyParams = {
  selfSolar: 0, solarPPA: 0, windPPA: 0, hydroPPA: 0, natgas: 0, sofc: 0, bess: 0,
}

// ── AI Model Scoring ──────────────────────────────────────────
type AIObjective = 'costMin' | 'esg' | 'lowCarbon'

interface DRScore {
  dr: DRPeriodConfig; score: number; valueLabel: string; params: EnergyParams
}

// Taiwan Power DR events are dispatched for ≤ 2 hours per call.
// All dispatchable assets (natgas, SOFC, BESS) must be sized to cover
// at most 2 hours of load — they cannot supply more than that per event.
const DR_DISPATCH_H = 2

// ── CSV Upload Parser ─────────────────────────────────────────
// Accepts a one-week (or longer) 15-min interval CSV and derives a
// 24-hour hourly average load profile for use in the AI engine.
// Supported formats: "timestamp,load_kw" (comma or tab separated)
type ParseOk  = { ok: true;  scenario: Scenario; days: number; peakKw: number }
type ParseErr = { ok: false; error: string }
function parseWeeklyCsv(text: string): ParseOk | ParseErr {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { ok: false, error: 'CSV 是空的' }

  const sep = lines[0].includes('\t') ? '\t' : ','
  const buckets: number[][] = Array.from({ length: 24 }, () => [])
  let rawPeak = 0
  let valid   = 0
  const dates = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(sep)
    if (cols.length < 2) continue
    const tsStr = cols[0].trim().replace(/["']/g, '')
    const kw    = parseFloat(cols[1].trim().replace(/["']/g, ''))
    if (!tsStr || isNaN(kw) || kw < 0) continue
    const ts = new Date(tsStr)
    if (isNaN(ts.getTime())) continue
    buckets[ts.getHours()].push(kw)
    rawPeak = Math.max(rawPeak, kw)
    valid++
    dates.add(tsStr.slice(0, 10))
  }

  if (valid < 96)
    return { ok: false, error: `有效資料僅 ${valid} 筆，至少需要 1 天（96 筆 × 15 分鐘）` }

  const loadProfile = buckets.map(b =>
    b.length > 0 ? Math.round(b.reduce((s, v) => s + v, 0) / b.length) : 0
  )
  const peakKw = Math.round(rawPeak)
  const days   = dates.size

  return {
    ok: true,
    peakKw,
    days,
    scenario: {
      id:            'custom_upload',
      label:         '我的用電資料',
      icon:          '📈',
      desc:          `上傳 ${days} 天樣本 · 峰值 ~${peakKw} kW · 純前端 AI 最佳化`,
      loadProfile,
      peakKw,
      existingGenKw: 0,
      genParalleled: false,
    },
  }
}

function getDynamicPresets(drStart: number, drEnd: number, scenario: Scenario) {
  const isDaytime  = drStart >= 10 && drStart <= 16
  const isMorning  = drStart < 10

  const drSlice = scenario.loadProfile.slice(drStart, Math.min(drEnd, 24))

  // Use the PEAK DR_DISPATCH_H-hour block within the window as the sizing basis.
  // DR events are called during the most demanding period — assets must handle that,
  // not the full-window average which understates the worst case.
  const avgDrLoad = (() => {
    if (drSlice.length === 0) return scenario.peakKw * 0.6
    if (drSlice.length < DR_DISPATCH_H) return drSlice.reduce((s, v) => s + v, 0) / drSlice.length
    let peak = 0
    for (let i = 0; i <= drSlice.length - DR_DISPATCH_H; i++) {
      const windowAvg = drSlice.slice(i, i + DR_DISPATCH_H).reduce((s, v) => s + v, 0) / DR_DISPATCH_H
      if (windowAvg > peak) peak = windowAvg
    }
    return peak
  })()

  // Existing paralleled gen + existing solar cover part of DR demand (at 2h dispatch peak)
  const genOffset = scenario.existingGenKw * (scenario.genParalleled ? 0.9 : 0)
  // Solar avg computed over the full DR window (not peak 2h, since solar varies continuously)
  const existingSolarDrAvg = drSlice.reduce((s, _, i) => {
    const h  = drStart + i
    const sf = h >= 6 && h <= 18 ? Math.sin(Math.PI * (h - 6) / 12) * 0.88 : 0
    return s + (scenario.existingSolarKw ?? 0) * sf
  }, 0) / Math.max(1, drSlice.length)
  // Net new capacity needed at peak DR load — bounded by actual scenario demand
  const netNeeded = Math.max(0, avgDrLoad - genOffset - existingSolarDrAvg)

  // Solar effectiveness of NEW assets during DR window
  const solarAvail = drSlice.reduce((s, _, i) => {
    const h = drStart + i
    return s + (h >= 6 && h <= 18 ? Math.sin(Math.PI * (h - 6) / 12) * 0.85 : 0)
  }, 0) / Math.max(1, drSlice.length)

  // BESS sizing rule: DR_DISPATCH_H × power_share = kWh needed for 2-hour dispatch.
  // natgas / SOFC: power (kW) sized to serve netNeeded during the 2-hour window.
  return {
    costMin: {
      selfSolar: 0,
      solarPPA:  solarAvail > 0.25 ? Math.round(netNeeded * 0.20) : 0,
      windPPA:   isMorning          ? Math.round(netNeeded * 0.20) : 0,
      hydroPPA:  0,
      natgas:    Math.round(netNeeded * (isDaytime ? 0.70 : 0.85)),
      sofc:      0,
      // 2h × 15% of netNeeded → BESS stores enough for 2h of that power share
      bess:      Math.round(Math.min(600, DR_DISPATCH_H * netNeeded * 0.15)),
    } as EnergyParams,
    esg: {
      selfSolar: 0,
      solarPPA:  solarAvail > 0.15
        ? Math.round(netNeeded * (isDaytime ? 0.60 : 0.30))
        : Math.round(netNeeded * 0.15),
      windPPA:   Math.round(netNeeded * (isDaytime ? 0.15 : 0.45)),
      hydroPPA:  Math.round(netNeeded * 0.20),
      natgas:    0,
      sofc:      0,
      // ESG: BESS is the sole dispatchable DR resource — sized for 2h of full netNeeded
      bess:      Math.min(2000, Math.round(DR_DISPATCH_H * netNeeded * 0.90)),
    } as EnergyParams,
    lowCarbon: {
      selfSolar: 0,
      solarPPA:  solarAvail > 0.15
        ? Math.round(netNeeded * (isDaytime ? 0.25 : 0.12))
        : 0,
      windPPA:   Math.round(netNeeded * (isDaytime ? 0.15 : 0.38)),
      hydroPPA:  Math.round(netNeeded * 0.13),
      natgas:    0,
      sofc:      Math.round(netNeeded * 0.60),
      // SOFC handles 60%, BESS covers remainder for 2h dispatch
      bess:      Math.min(2000, Math.round(DR_DISPATCH_H * netNeeded * 0.35)),
    } as EnergyParams,
  }
}

function getAIText(id: string, drStart: number, _drEnd: number, drLabel: string, scenario: Scenario): string {
  const isDaytime = drStart >= 10 && drStart <= 16
  const contextParts = [
    scenario.existingGenKw > 0
      ? `現有 ${scenario.existingGenKw} kW ${scenario.genParalleled ? '並聯機組' : '備用機組'}`
      : '',
    scenario.existingSolarKw
      ? `既有 ${scenario.existingSolarKw} kW 太陽能自發自用`
      : '',
  ].filter(Boolean)
  const genNote = contextParts.length > 0 ? `（${contextParts.join('・')}）` : ''
  const dispatchStr = `${drStart}:00–${drStart + DR_DISPATCH_H}:00`
  if (id === 'costMin')
    return `【財務最大化・${drLabel}】${genNote}天然氣機組於 DR 調度 ${dispatchStr} 滿載供電（${DR_DISPATCH_H}h 調度上限），其後維持低載待機；BESS 同步釋能 ${DR_DISPATCH_H} 小時補充峰值缺口。以最低邊際成本最大化需量反應收益，整體碳排偏高。`
  if (id === 'esg')
    return isDaytime
      ? `【ESG 絕對優先・日峰】${genNote}白天充裕太陽能 PPA 全程供電；BESS 蓄滿後於 ${dispatchStr} DR 調度期間完全釋能（${DR_DISPATCH_H}h 上限）。全程零天然氣，CFE 達成率近 100%，CAPEX 較高為必要代價。`
      : `【ESG 絕對優先・夜峰】${genNote}大容量 BESS 於日間利用太陽能充電，DR 調度 ${dispatchStr} 期間完全釋能（${DR_DISPATCH_H}h 上限）。風力 PPA 提供夜間潔淨基載，全程零化石燃料。`
  return `【碳排最小化・${drLabel}】${genNote}SOFC 高效燃料電池（效率 60%+，碳強度低於天然氣 40%）於 ${dispatchStr} 滿載運轉（${DR_DISPATCH_H}h 調度上限），其後降載維持基載；BESS 協同 ${DR_DISPATCH_H} 小時削峰。風力 PPA 補充夜間潔淨電力。`
}

function computeDRScores(objective: AIObjective, scenario: Scenario): DRScore[] {
  return DR_PRESETS.filter(d => d.id !== 'custom').map(dr => {
    const presets = getDynamicPresets(dr.start, dr.end, scenario)
    const p    = objective === 'costMin' ? presets.costMin : objective === 'esg' ? presets.esg : presets.lowCarbon
    const data = generateHourlyData(p, dr.start, dr.end, scenario.loadProfile, scenario)
    const k    = calculateKPIs(p, data, dr, scenario)

    let score: number, valueLabel: string
    if (objective === 'costMin') {
      score      = k.drRevenue - k.capex / 20
      valueLabel = k.drRevenue >= 1e6 ? `DR ${(k.drRevenue/1e6).toFixed(1)}M/年` : `DR ${(k.drRevenue/1e4).toFixed(0)} 萬/年`
    } else if (objective === 'esg') {
      score      = k.cfeRate * 100 - k.capex / 5e6
      valueLabel = `CFE ${(k.cfeRate * 100).toFixed(1)}%`
    } else {
      score      = -k.carbon + k.drRevenue / 300_000
      valueLabel = `${Math.round(k.carbon).toLocaleString()} tCO₂e`
    }
    return { dr, score, valueLabel, params: p }
  }).sort((a, b) => b.score - a.score)
}

// ── Data Generation ───────────────────────────────────────────
function generateHourlyData(
  p: EnergyParams, drStart: number, drEnd: number,
  loadProfile: number[], scenario: Scenario,
): HourlyData[] {
  return Array.from({ length: 25 }, (_, h) => {
    const hour     = h % 24
    const baseLoad = loadProfile[hour]

    const isDR   = hour >= drStart && hour < drEnd
    const nearDR = hour >= drStart - 1 && hour < drEnd + 1
    const preRamp = 2

    // 台電 DR 調度每次上限 DR_DISPATCH_H 小時 — dispatchable assets (natgas/SOFC/BESS/existingGen)
    // run at full rated capacity only during the first 2h of the DR window.
    const drDispatchEnd = Math.min(drStart + DR_DISPATCH_H, drEnd)
    const inDispatch    = hour >= drStart && hour < drDispatchEnd

    const solarFactor = hour >= 6 && hour <= 18 ? Math.sin(Math.PI * (hour - 6) / 12) : 0

    // ── Existing assets ───────────────────────────────────────────
    // Paralleled gen obeys the same 2h dispatch limit: full output only during inDispatch,
    // warm standby ramp near DR, idle baseline otherwise.
    let existingGen = 0
    if (scenario.genParalleled && scenario.existingGenKw > 0) {
      existingGen = inDispatch ? scenario.existingGenKw * 0.92
                 : nearDR      ? scenario.existingGenKw * 0.55
                 :               scenario.existingGenKw * 0.28
    }
    const existingSolar = (scenario.existingSolarKw ?? 0) * solarFactor * 0.88

    // ── New planned assets ────────────────────────────────────────
    const selfSolar = p.selfSolar * solarFactor * 0.90
    const solarPPA  = p.solarPPA  * solarFactor * 0.85

    const windFactor = Math.max(0.30, 0.65 + 0.20 * Math.cos(Math.PI * hour / 12) + 0.15 * Math.sin(Math.PI * hour / 6))
    const windPPA    = p.windPPA * windFactor

    const hydroPPA = p.hydroPPA * (0.88 + 0.05 * Math.sin(Math.PI * hour / 12))

    // natgas: full rated output during 2h dispatch, low sustain for remainder of DR
    const natgasF = inDispatch ? 1.00
                  : isDR       ? 0.35
                  : nearDR     ? 0.75
                  : (hour < 6 || hour >= 22 ? 0.55 : 0.45)
    const natgas = p.natgas * natgasF

    // SOFC: same dispatch profile (slower ramp, slightly higher sustain floor)
    const sofc = p.sofc * (inDispatch ? 0.95 : isDR ? 0.40 : 0.82)

    // BESS: sized for DR_DISPATCH_H of discharge → fully depleted after the dispatch window
    let bess = 0
    if (inDispatch)                                               bess = p.bess * 0.90
    else if (isDR)                                                bess = p.bess * 0.08  // nearly depleted
    else if (hour >= drStart - preRamp && hour < drStart)         bess = p.bess * 0.35 * ((hour - (drStart - preRamp)) / preRamp)
    else if (hour >= drEnd && hour < drEnd + 1)                   bess = p.bess * 0.05  // recovery start

    const totalSupply = existingGen + existingSolar + bess + selfSolar + solarPPA + windPPA + hydroPPA + sofc + natgas
    const grid = Math.max(0, baseLoad - totalSupply)

    return { hour: h, existingGen, existingSolar, bess, selfSolar, solarPPA, windPPA, hydroPPA, sofc, natgas, grid }
  })
}

function calculateKPIs(p: EnergyParams, data: HourlyData[], dr: DRPeriodConfig, scenario: Scenario) {
  const capex = (Object.entries(CAPEX_UNIT) as [keyof EnergyParams, number][])
    .reduce((s, [k, u]) => s + p[k] * u, 0)

  // Each DR event call lasts at most DR_DISPATCH_H hours — cap revenue accordingly
  const drDispatchHours = Math.min(DR_DISPATCH_H, dr.end - dr.start)
  const drCapacity = Math.min(
    p.natgas * 0.5 + (p.bess / DR_DISPATCH_H) * 0.90 + p.sofc * 0.6,
    scenario.peakKw * 0.35,
  )
  const drRevenue = drCapacity * drDispatchHours * dr.eventsPerYear * 5 * dr.rateMultiplier

  // CFE: clean energy (new + existing solar) vs total load
  const totalLoadKwh = scenario.loadProfile.reduce((s, v) => s + v, 0)
  const cleanHourly  = data.slice(0, 24).reduce((s, d) =>
    s + d.selfSolar + d.solarPPA + d.windPPA + d.hydroPPA + d.bess * 0.85
    + d.existingSolar, 0)
  const cfeRate = Math.min(1, cleanHourly / totalLoadKwh)

  const yr = 365
  const carbon = (
    data.slice(0, 24).reduce((s, d) => s + d.grid,        0) * yr * 0.494 +
    data.slice(0, 24).reduce((s, d) => s + d.natgas,      0) * yr * 0.202 +
    data.slice(0, 24).reduce((s, d) => s + d.sofc,        0) * yr * 0.126 +
    data.slice(0, 24).reduce((s, d) => s + d.existingGen, 0) * yr * 0.202
  ) / 1000

  return { capex, drRevenue, cfeRate, carbon }
}

// ── D3 Chart ──────────────────────────────────────────────────
interface ChartProps {
  data: HourlyData[]; isDark: boolean
  drStart: number; drEnd: number; drLabel: string
  loadProfile: number[]
}

function EnergyChart({ data, isDark, drStart, drEnd, drLabel, loadProfile }: ChartProps) {
  const svgRef     = useRef<SVGSVGElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const axisColor     = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
  const axisTextColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)'
  const gridColor     = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
  const loadLineColor = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.40)'
  const tooltipBg     = isDark ? 'rgba(10,14,26,0.95)'   : 'rgba(255,255,255,0.97)'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'
  const tooltipText   = isDark ? '#fff' : '#111827'
  const tooltipMuted  = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)'
  const tooltipDiv    = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'
  const crosshair     = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'

  useEffect(() => {
    if (!svgRef.current || !wrapRef.current) return

    const margin      = { top: 24, right: 20, bottom: 40, left: 68 }
    const totalWidth  = wrapRef.current.clientWidth
    const totalHeight = 256
    const W = totalWidth - margin.left - margin.right
    const H = totalHeight - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.attr('width', totalWidth).attr('height', totalHeight)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    STACK_KEYS.forEach(key => {
      const c = ENERGY_COLORS[key]
      const g = defs.append('linearGradient').attr('id', `sg-${key}`).attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1')
      g.append('stop').attr('offset','0%').attr('stop-color', c).attr('stop-opacity', 0.95)
      g.append('stop').attr('offset','100%').attr('stop-color', c).attr('stop-opacity', 0.68)
    })

    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const stack  = d3.stack<HourlyData>().keys(STACK_KEYS).order(d3.stackOrderNone).offset(d3.stackOffsetNone)
    const series = stack(data)

    const profileMax = Math.max(...loadProfile)
    const stackMax   = d3.max(series, l => d3.max(l, d => d[1])) ?? profileMax
    const xScale     = d3.scaleLinear().domain([0, 24]).range([0, W])
    const yScale     = d3.scaleLinear().domain([0, Math.max(stackMax, profileMax) * 1.12]).range([H, 0]).nice()

    // Grid lines
    yScale.ticks(5).forEach(t => {
      root.append('line').attr('x1', 0).attr('x2', W).attr('y1', yScale(t)).attr('y2', yScale(t))
        .attr('stroke', gridColor).attr('stroke-width', 1)
    })

    // DR overlay
    const drGrad = defs.append('linearGradient').attr('id', 'dr-grad').attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1')
    drGrad.append('stop').attr('offset','0%').attr('stop-color','#ef4444').attr('stop-opacity', 0.14)
    drGrad.append('stop').attr('offset','100%').attr('stop-color','#ef4444').attr('stop-opacity', 0.03)

    root.append('rect')
      .attr('x', xScale(drStart)).attr('y', 0)
      .attr('width', xScale(drEnd) - xScale(drStart)).attr('height', H)
      .attr('fill', 'url(#dr-grad)')
      .attr('stroke', 'rgba(239,68,68,0.32)').attr('stroke-width', 0.8)

    root.append('text')
      .attr('transform', `translate(${xScale(drStart) + (xScale(drEnd) - xScale(drStart)) / 2}, ${H / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('fill', 'rgba(252,165,165,0.85)')
      .attr('font-size', '9px').attr('font-weight', '600').attr('letter-spacing', '0.06em')
      .text(`${drLabel} DR`)

    // Stacked areas
    const area = d3.area<d3.SeriesPoint<HourlyData>>()
      .x(d => xScale(d.data.hour)).y0(d => yScale(d[0])).y1(d => yScale(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5))

    series.forEach((layer, i) => {
      const key = STACK_KEYS[i]
      root.append('path').datum(layer)
        .attr('fill', `url(#sg-${key})`)
        .attr('stroke', ENERGY_COLORS[key]).attr('stroke-width', 0.5).attr('stroke-opacity', 0.40)
        .attr('d', area)
    })

    // Actual load profile curve (dashed)
    const profilePoints = [...loadProfile, loadProfile[0]]  // wrap hour 24 → hour 0
    const loadLine = d3.line<number>()
      .x((_, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveCatmullRom.alpha(0.5))

    root.append('path')
      .datum(profilePoints)
      .attr('fill', 'none')
      .attr('stroke', loadLineColor).attr('stroke-width', 1.8)
      .attr('stroke-dasharray', '5,4')
      .attr('d', loadLine)

    // Load curve label
    root.append('text')
      .attr('x', 6).attr('y', yScale(profilePoints[0]) - 6)
      .attr('fill', loadLineColor).attr('font-size', '9px').attr('font-weight', '500')
      .text('實際負載曲線')

    // Axes
    root.append('g').attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(12).tickFormat(d => `${d}:00`))
      .call(ax => {
        ax.select('.domain').attr('stroke', axisColor)
        ax.selectAll('line').attr('stroke', axisColor)
        ax.selectAll('text').attr('fill', axisTextColor).attr('font-size', '9px')
      })
    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d} kW`))
      .call(ax => {
        ax.select('.domain').attr('stroke', axisColor)
        ax.selectAll('line').attr('stroke', axisColor)
        ax.selectAll('text').attr('fill', axisTextColor).attr('font-size', '9px')
      })

    // Tooltip
    const vertLine = root.append('line').attr('y1', 0).attr('y2', H)
      .attr('stroke', crosshair).attr('stroke-width', 1).attr('stroke-dasharray', '3,3')
      .attr('opacity', 0).attr('pointer-events', 'none')
    const tooltip = d3.select(tooltipRef.current)

    svg.append('rect').attr('x', margin.left).attr('y', margin.top).attr('width', W).attr('height', H)
      .attr('fill', 'transparent')
      .on('mousemove', function(event: MouseEvent) {
        const [mx, my] = d3.pointer(event, wrapRef.current)
        const hour = Math.min(24, Math.max(0, Math.round(xScale.invert(mx - margin.left))))
        const d    = data[hour]; if (!d) return
        vertLine.attr('x1', xScale(d.hour)).attr('x2', xScale(d.hour)).attr('opacity', 1)
        const total  = STACK_KEYS.reduce((s, k) => s + (d[k as keyof HourlyData] as number), 0)
        const actual = loadProfile[hour % 24]
        const inDR   = d.hour >= drStart && d.hour < drEnd
        tooltip.style('opacity','1')
          .style('left', `${Math.min(mx + 14, totalWidth - 178)}px`)
          .style('top',  `${Math.max(my - 30, 0)}px`)
          .html(`
            <div style="font-size:11px;font-weight:700;color:${tooltipText};margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid ${tooltipDiv};display:flex;justify-content:space-between;gap:8px">
              <span>${d.hour}:00–${(d.hour+1)%25}:00</span>
              ${inDR ? `<span style="font-size:9px;font-weight:600;color:#fca5a5;background:rgba(239,68,68,0.15);padding:1px 5px;border-radius:4px">DR</span>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:2.5px">
              <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px;padding-bottom:3px;border-bottom:1px solid ${tooltipDiv}">
                <span style="color:${tooltipMuted}">實際負載</span>
                <span style="font-family:monospace;font-weight:700;color:${tooltipText}">${actual.toFixed(0)} kW</span>
              </div>
              ${STACK_KEYS.map(k => {
                const v = d[k as keyof HourlyData] as number; if (v < 1) return ''
                return `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
                  <span style="display:flex;align-items:center;gap:4px;color:${tooltipMuted}">
                    <span style="width:7px;height:7px;border-radius:2px;background:${ENERGY_COLORS[k]};display:inline-block;flex-shrink:0"></span>
                    ${ENERGY_LABELS[k]}
                  </span>
                  <span style="font-family:monospace;font-weight:600;color:${tooltipText};white-space:nowrap">${v.toFixed(0)} kW</span>
                </div>`
              }).join('')}
              <div style="display:flex;justify-content:space-between;gap:12px;border-top:1px solid ${tooltipDiv};margin-top:2px;padding-top:3px">
                <span style="color:${tooltipMuted}">新增供電</span>
                <span style="font-family:monospace;font-weight:700;color:${tooltipText}">${(total - d.grid).toFixed(0)} kW</span>
              </div>
            </div>
          `)
      })
      .on('mouseleave', () => { vertLine.attr('opacity', 0); tooltip.style('opacity','0') })

  }, [data, isDark, drStart, drEnd, drLabel, loadProfile,
      axisColor, axisTextColor, gridColor, loadLineColor, crosshair,
      tooltipText, tooltipMuted, tooltipDiv, tooltipBg, tooltipBorder])

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg ref={svgRef} className="w-full block" />
      <div ref={tooltipRef} className="pointer-events-none absolute rounded-xl"
        style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, backdropFilter: 'blur(12px)',
                 padding: '9px 11px', fontSize: '11px', opacity: 0, transition: 'opacity 0.12s ease',
                 zIndex: 50, minWidth: 172, pointerEvents: 'none' }} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function EnergyStrategy() {
  const { theme } = useThemeContext()
  const isDark    = theme === 'dark'

  const [scenarioId,    setScenarioId]    = useState('ev_operator')
  const [params,        setParams]        = useState<EnergyParams>(DEFAULT_PARAMS)
  const [drPresetId,    setDrPresetId]    = useState('summer_peak')
  const [customStart,   setCustomStart]   = useState(14)
  const [customEnd,     setCustomEnd]     = useState(18)
  const [activePreset,      setActivePreset]      = useState<string | null>(null)
  const [presetText,        setPresetText]        = useState('')
  const [selectedDrPerModel, setSelectedDrPerModel] = useState<Record<string, string>>({})
  const [customScenario,    setCustomScenario]    = useState<Scenario | null>(null)
  const [csvState,          setCsvState]          = useState<'idle' | 'parsing' | 'done' | 'error'>('idle')
  const [csvMsg,            setCsvMsg]            = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animRef      = useRef<number | null>(null)
  const paramsRef    = useRef(params)
  useEffect(() => { paramsRef.current = params }, [params])

  const allScenarios = customScenario ? [...SCENARIOS, customScenario] : SCENARIOS
  const scenario     = allScenarios.find(s => s.id === scenarioId) ?? allScenarios[0]
  const drBase   = DR_PRESETS.find(d => d.id === drPresetId)!
  const drStart  = drPresetId === 'custom' ? customStart : drBase.start
  const drEnd    = drPresetId === 'custom' ? customEnd   : drBase.end
  const drPeriod = drPresetId === 'custom' ? { ...drBase, start: customStart, end: customEnd } : drBase

  const data = generateHourlyData(params, drStart, drEnd, scenario.loadProfile, scenario)
  const kpis = calculateKPIs(params, data, drPeriod, scenario)

  // Reset params when scenario changes
  const handleScenarioChange = (id: string) => {
    setScenarioId(id); setParams(DEFAULT_PARAMS); setActivePreset(null); setPresetText('')
    setSelectedDrPerModel({})
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvState('parsing'); setCsvMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      const result = parseWeeklyCsv(ev.target?.result as string)
      if (!result.ok) {
        setCsvState('error'); setCsvMsg(result.error)
      } else {
        setCustomScenario(result.scenario)
        setCsvState('done')
        setCsvMsg(`已載入 ${result.days} 天 · 峰值 ${result.peakKw} kW`)
        setScenarioId('custom_upload')
        setParams(DEFAULT_PARAMS); setActivePreset(null); setPresetText(''); setSelectedDrPerModel({})
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.onerror = () => { setCsvState('error'); setCsvMsg('檔案讀取失敗') }
    reader.readAsText(file, 'UTF-8')
  }

  const animateToPreset = useCallback((target: EnergyParams, id: string, text: string, bestDrId?: string) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (bestDrId) setDrPresetId(bestDrId)
    const start     = { ...paramsRef.current }
    const startTime = performance.now()
    const step = (now: number) => {
      const t     = Math.min(1, (now - startTime) / 1200)
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      setParams({
        selfSolar: Math.round(start.selfSolar + (target.selfSolar - start.selfSolar) * eased),
        solarPPA:  Math.round(start.solarPPA  + (target.solarPPA  - start.solarPPA)  * eased),
        windPPA:   Math.round(start.windPPA   + (target.windPPA   - start.windPPA)   * eased),
        hydroPPA:  Math.round(start.hydroPPA  + (target.hydroPPA  - start.hydroPPA)  * eased),
        natgas:    Math.round(start.natgas    + (target.natgas    - start.natgas)    * eased),
        sofc:      Math.round(start.sofc      + (target.sofc      - start.sofc)      * eased),
        bess:      Math.round(start.bess      + (target.bess      - start.bess)      * eased),
      })
      if (t < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
    setActivePreset(id); setPresetText(text)
  }, [])

  // Theme tokens
  const surface       = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.72)'
  const surfaceBorder = isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.08)'
  const divider       = isDark ? 'rgba(255,255,255,0.07)'  : 'rgba(0,0,0,0.07)'
  const textPrimary   = isDark ? '#f1f5f9' : '#111827'
  const textSecondary = isDark ? '#94a3b8' : '#6b7280'
  const textMuted     = isDark ? '#475569' : '#9ca3af'
  const trackBg       = isDark ? 'rgba(255,255,255,0.08)'  : 'rgba(0,0,0,0.08)'
  const listBg        = isDark ? 'rgba(255,255,255,0.06)'  : 'rgba(0,0,0,0.04)'
  const listBorder    = isDark ? 'rgba(255,255,255,0.08)'  : 'rgba(0,0,0,0.07)'
  const segActive     = isDark ? 'rgba(255,255,255,0.14)'  : '#fff'
  const sceneActive   = isDark ? 'rgba(255,255,255,0.10)'  : 'rgba(255,255,255,0.90)'

  const cfeColor = kpis.cfeRate >= 0.90 ? '#34C759' : kpis.cfeRate >= 0.55 ? '#FF9500' : '#FF3B30'
  const co2Color = kpis.carbon < 1000   ? '#34C759' : kpis.carbon < 6000   ? '#FF9500' : '#FF3B30'

  const kpiCards = [
    { label: '預估新增 CAPEX',
      value: kpis.capex >= 1e8 ? `NT$ ${(kpis.capex/1e8).toFixed(2)} 億` : `NT$ ${(kpis.capex/1e6).toFixed(1)}M`,
      sub: kpis.capex < 1e6 ? '尚無新增資產' : kpis.capex < 5e7 ? '中等規模建置' : '大型系統投資',
      color: '#007AFF', glow: 'rgba(0,122,255,0.18)', icon: '🏗' },
    { label: `DR 年度收益 (${drPeriod.label})`,
      value: kpis.drRevenue >= 1e6 ? `NT$ ${(kpis.drRevenue/1e6).toFixed(2)}M` : `NT$ ${(kpis.drRevenue/1e4).toFixed(0)} 萬`,
      sub: kpis.drRevenue < 1e4 ? '無可調度資源' : `費率加成 ×${drPeriod.rateMultiplier.toFixed(2)}`,
      color: '#34C759', glow: 'rgba(52,199,89,0.18)', icon: '⚡' },
    { label: '24/7 CFE 達成率',
      value: `${(kpis.cfeRate * 100).toFixed(1)}%`,
      sub: kpis.cfeRate >= 0.95 ? '✦ 近零碳供電' : kpis.cfeRate >= 0.55 ? '綠電比例良好' : '仍高度依賴電網',
      color: cfeColor, glow: `${cfeColor}30`, icon: '🌿' },
    { label: '年度碳排放量',
      value: `${kpis.carbon.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')} tCO₂e`,
      sub: kpis.carbon < 1000 ? '接近淨零排放' : kpis.carbon < 5000 ? '持續低碳轉型' : '高碳基準情境',
      color: co2Color, glow: `${co2Color}30`, icon: '🏭' },
  ]

  return (
    <div className="min-h-full rounded-xl overflow-hidden" style={{ color: textPrimary }}>

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: `1px solid ${divider}` }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 18 }}>能源資產策略規劃儀表板</h1>
            <p className="mt-1" style={{ fontSize: 13, color: textSecondary }}>
              {scenario.icon} {scenario.label} · {scenario.desc}
              {scenario.existingGenKw > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-md font-semibold"
                  style={{ fontSize: 11.5, background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>
                  現有機組 {scenario.existingGenKw} kW{scenario.genParalleled ? '（並聯）' : '（未並聯）'}
                </span>
              )}
              {scenario.existingSolarKw && (
                <span className="ml-2 px-2 py-0.5 rounded-md font-semibold"
                  style={{ fontSize: 11.5, background: 'rgba(253,230,138,0.20)', color: '#d97706' }}>
                  既有太陽能 {scenario.existingSolarKw} kW
                </span>
              )}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold"
            style={{ fontSize: 12, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.28)', color: '#a5b4fc' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            即時模擬
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Scenario Selector ─────────────────────────────── */}
        <div className="rounded-xl p-4"
          style={{ background: surface, border: `1px solid ${surfaceBorder}`, backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-between mb-3 gap-3">
            <p className="font-bold uppercase" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: textMuted }}>
              客戶 Case Study
            </p>
            {/* CSV upload status badge */}
            {csvState === 'done' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full font-semibold"
                style={{ fontSize: 11, background: 'rgba(0,122,255,0.10)', border: '1px solid rgba(0,122,255,0.22)', color: '#007AFF' }}>
                <span>📈</span>{csvMsg}
              </div>
            )}
            {csvState === 'error' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full font-semibold"
                style={{ fontSize: 11, background: 'rgba(255,59,48,0.09)', border: '1px solid rgba(255,59,48,0.22)', color: '#FF3B30' }}>
                ⚠ {csvMsg}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
            {/* ── Built-in scenarios ── */}
            {allScenarios.map(s => {
              const active = scenarioId === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => handleScenarioChange(s.id)}
                  className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-[12px] transition-all duration-150 active:scale-[0.96]"
                  style={{
                    background: active ? sceneActive : 'transparent',
                    border: `1px solid ${active ? (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.13)') : listBorder}`,
                    boxShadow: active ? (isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.10)') : 'none',
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{s.icon}</span>
                  <span className="font-semibold text-center leading-tight"
                    style={{ fontSize: 11.5, color: active ? textPrimary : textSecondary }}>
                    {s.label}
                  </span>
                  <span className="font-mono font-bold" style={{ fontSize: 11, color: active ? '#007AFF' : textMuted }}>
                    {s.peakKw} kW
                  </span>
                </button>
              )
            })}

            {/* ── Upload card (always shown unless custom already loaded) ── */}
            {!customScenario && (
              <label
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-[12px] cursor-pointer transition-all duration-150 active:scale-[0.96] relative"
                title="上傳一週用電 CSV（timestamp, load_kw）"
                style={{
                  background: 'transparent',
                  border: `1.5px dashed ${csvState === 'parsing'
                    ? '#007AFF'
                    : isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)'}`,
                  opacity: csvState === 'parsing' ? 0.7 : 1,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={handleCsvUpload}
                  disabled={csvState === 'parsing'}
                />
                {csvState === 'parsing' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: '#007AFF', borderTopColor: 'transparent' }} />
                    <span style={{ fontSize: 11.5, color: '#007AFF' }}>解析中</span>
                    <span style={{ fontSize: 11, color: textMuted }}>…</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 22, lineHeight: 1, opacity: 0.7 }}>＋</span>
                    <span className="font-semibold text-center leading-tight"
                      style={{ fontSize: 11.5, color: textSecondary }}>上傳用電</span>
                    <span style={{ fontSize: 10.5, color: textMuted }}>CSV</span>
                  </>
                )}
              </label>
            )}
          </div>

          {/* CSV format hint */}
          {csvState === 'idle' && (
            <p className="mt-2.5" style={{ fontSize: 11, color: textMuted }}>
              上傳格式：<span className="font-mono" style={{ color: textSecondary }}>timestamp,load_kw</span>（15 分鐘間距，至少 1 天）
            </p>
          )}
        </div>

        {/* ── KPI cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {kpiCards.map(card => (
            <div key={card.label} className="rounded-xl p-4 relative overflow-hidden flex flex-col gap-1"
              style={{ background: surface, border: `1px solid ${surfaceBorder}`, backdropFilter: 'blur(12px)' }}>
              <div className="absolute -top-3 -right-3 opacity-[0.08] select-none" style={{ fontSize: 48 }}>{card.icon}</div>
              <div className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${card.glow},transparent)` }} />
              <p className="leading-tight font-medium" style={{ fontSize: 12, color: textSecondary }}>{card.label}</p>
              <p className="font-bold leading-tight" style={{ fontSize: 20, color: card.color }}>{card.value}</p>
              <p className="leading-tight" style={{ fontSize: 12, color: textMuted }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Chart card ────────────────────────────────────── */}
        <div className="rounded-xl p-3"
          style={{ background: surface, border: `1px solid ${surfaceBorder}`, backdropFilter: 'blur(12px)' }}>

          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="font-bold shrink-0" style={{ fontSize: 15, color: textPrimary }}>24 小時能源調度圖</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold shrink-0" style={{ fontSize: 12, color: textSecondary }}>台電 DR 時段</span>
              <div className="flex p-0.5 rounded-[10px] gap-0.5"
                style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                {DR_PRESETS.map(p => (
                  <button key={p.id}
                    onClick={() => { setDrPresetId(p.id); setActivePreset(null); setPresetText('') }}
                    className="font-semibold px-2.5 py-1 rounded-[8px] transition-all duration-150"
                    style={{
                      fontSize: 12,
                      background: drPresetId === p.id ? segActive : 'transparent',
                      color: drPresetId === p.id ? (isDark ? '#f1f5f9' : '#111827') : textSecondary,
                      boxShadow: drPresetId === p.id ? (isDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.12)') : 'none',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold shrink-0"
                style={{ fontSize: 11.5, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5' }}>
                <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.5)' }} />
                {drStart}:00–{drEnd}:00
              </div>
            </div>
          </div>

          {drPresetId === 'custom' && (
            <div className="flex gap-6 mb-2 px-2.5 py-2 rounded-lg"
              style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${listBorder}` }}>
              <div className="flex-1">
                <div className="flex justify-between text-[10px] mb-1" style={{ color: textSecondary }}>
                  <span>開始時間</span>
                  <span className="font-mono font-semibold" style={{ color: '#ef4444' }}>{customStart}:00</span>
                </div>
                <input type="range" min={0} max={22} step={1} value={customStart}
                  onChange={e => { const v=+e.target.value; setCustomStart(v); if(customEnd<=v) setCustomEnd(v+1); setActivePreset(null) }}
                  className="w-full h-1 rounded-full cursor-pointer" style={{ accentColor: '#ef4444' }} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-[10px] mb-1" style={{ color: textSecondary }}>
                  <span>結束時間</span>
                  <span className="font-mono font-semibold" style={{ color: '#ef4444' }}>{customEnd}:00</span>
                </div>
                <input type="range" min={customStart+1} max={24} step={1} value={customEnd}
                  onChange={e => { setCustomEnd(+e.target.value); setActivePreset(null) }}
                  className="w-full h-1 rounded-full cursor-pointer" style={{ accentColor: '#ef4444' }} />
              </div>
            </div>
          )}

          <EnergyChart data={data} isDark={isDark} drStart={drStart} drEnd={drEnd}
            drLabel={drPeriod.label} loadProfile={scenario.loadProfile} />

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-2.5" style={{ borderTop: `1px solid ${divider}` }}>
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: textSecondary }}>
              <div className="w-5 h-px border-t-2 border-dashed" style={{ borderColor: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.40)' }} />
              實際負載
            </div>
            {STACK_KEYS
              .filter(key => data.some(d => (d[key as keyof HourlyData] as number) > 1))
              .map(key => (
                <div key={key} className="flex items-center gap-1.5" style={{ fontSize: 12, color: textSecondary }}>
                  <div className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: ENERGY_COLORS[key] }} />
                  {ENERGY_LABELS[key]}
                </div>
              ))
            }
          </div>
        </div>

        {/* ── Controls ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Sliders */}
          <div className="rounded-xl p-4"
            style={{ background: surface, border: `1px solid ${surfaceBorder}`, backdropFilter: 'blur(12px)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold" style={{ fontSize: 15, color: textPrimary }}>新增資產容量配置</h2>
              <div className="flex items-center gap-1.5">
                {scenario.existingGenKw > 0 && (
                  <div className="px-2 py-0.5 rounded-md font-semibold"
                    style={{ fontSize: 12, background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>
                    既有機組 {scenario.existingGenKw} kW
                  </div>
                )}
                {scenario.existingSolarKw && (
                  <div className="px-2 py-0.5 rounded-md font-semibold"
                    style={{ fontSize: 12, background: 'rgba(253,230,138,0.18)', color: '#d97706' }}>
                    既有太陽能 {scenario.existingSolarKw} kW
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {SLIDER_CONFIG.map(({ key, label, unit, max, color }) => {
                const pct = (params[key] / max) * 100
                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="flex items-center gap-1.5 font-medium" style={{ fontSize: 13, color: textSecondary }}>
                        <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: color }} />
                        {label}
                      </label>
                      <span className="font-mono font-bold tabular-nums" style={{ fontSize: 13, color }}>
                        {params[key].toLocaleString()} {unit}
                      </span>
                    </div>
                    <div className="relative h-1 rounded-full overflow-hidden" style={{ background: trackBg }}>
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
                        style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
                    </div>
                    <input type="range" min={0} max={max} step={50} value={params[key]}
                      onChange={e => { setActivePreset(null); setParams(prev => ({ ...prev, [key]: +e.target.value })) }}
                      className="w-full opacity-0 h-1 -mt-1 cursor-pointer relative" style={{ accentColor: color }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI Decision Buttons */}
          <div className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: surface, border: `1px solid ${surfaceBorder}`, backdropFilter: 'blur(12px)' }}>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold" style={{ fontSize: 15, color: textPrimary }}>AI 最佳化決策引擎</h2>
                <p className="mt-1" style={{ fontSize: 12.5, color: textSecondary }}>
                  三種模型各自掃描所有 DR 時段 · 依 {scenario.label} 情境動態計算
                </p>
              </div>
              <button onClick={() => { setParams(DEFAULT_PARAMS); setActivePreset(null); setPresetText(''); setSelectedDrPerModel({}) }}
                className="font-semibold px-3 py-1 rounded-md shrink-0"
                style={{ fontSize: 12.5, color: '#007AFF', background: isDark ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.08)' }}>
                重置
              </button>
            </div>

            <div className="space-y-2">
              {([
                { id: 'costMin',   icon: '⚡', color: '#007AFF', label: '財務最大化模型',  subLabel: '成本最小化・DR 收益最大化' },
                { id: 'esg',       icon: '🌱', color: '#34C759', label: 'ESG 永續模型',    subLabel: 'CFE 達成率・零天然氣優先' },
                { id: 'lowCarbon', icon: '♻️', color: '#FF9500', label: '碳排最小化模型',  subLabel: 'SOFC 基載・碳強度最低化' },
              ] as const).map(model => {
                const scores  = computeDRScores(model.id, scenario)
                const best    = scores[0]
                const applied = activePreset === model.id

                return (
                  <div key={model.id} className="rounded-[14px] overflow-hidden"
                    style={{ background: listBg,
                             border: `1px solid ${applied ? model.color+'55' : listBorder}`,
                             boxShadow: applied ? `0 0 16px ${model.color}28` : 'none',
                             transition: 'border-color 0.2s, box-shadow 0.2s' }}>

                    <button
                      onClick={() => {
                        animateToPreset(best.params, model.id,
                          getAIText(model.id, best.dr.start, best.dr.end, best.dr.label, scenario), best.dr.id)
                        setSelectedDrPerModel(prev => ({ ...prev, [model.id]: best.dr.id }))
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-all duration-150 active:opacity-70"
                      style={{ background: applied ? model.color : 'transparent' }}>
                      <div className="shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center"
                        style={{ fontSize: 18, background: applied ? 'rgba(255,255,255,0.22)' : `${model.color}20` }}>
                        {model.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold leading-tight"
                          style={{ fontSize: 14, color: applied ? '#fff' : textPrimary }}>
                          {model.label}
                        </div>
                        <div className="leading-tight mt-0.5"
                          style={{ fontSize: 11.5, color: applied ? 'rgba(255,255,255,0.72)' : textSecondary }}>
                          {model.subLabel}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="font-bold px-2.5 py-1 rounded-lg"
                          style={{ fontSize: 12,
                                   background: applied ? 'rgba(255,255,255,0.22)' : `${model.color}18`,
                                   color: applied ? '#fff' : model.color }}>
                          {best.valueLabel}
                        </div>
                        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="shrink-0"
                          style={{ color: applied ? 'rgba(255,255,255,0.7)' : model.color, opacity: applied ? 0.9 : 0.5 }}>
                          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </button>

                    {/* ── Ranking row ── */}
                    <div className="flex px-3 pb-3 pt-2 gap-2"
                      style={{ borderTop: `1px solid ${applied ? model.color+'40' : listBorder}` }}>
                      {scores.map((s, rank) => {
                        const selDr = selectedDrPerModel[model.id]
                        const isSelected = selDr ? selDr === s.dr.id : rank === 0
                        return (
                          <button key={s.dr.id}
                            onClick={() => {
                              animateToPreset(s.params, model.id,
                                getAIText(model.id, s.dr.start, s.dr.end, s.dr.label, scenario), s.dr.id)
                              setSelectedDrPerModel(prev => ({ ...prev, [model.id]: s.dr.id }))
                            }}
                            className="flex-1 rounded-[10px] px-2 py-2 text-center active:opacity-70"
                            style={{
                              background: isSelected ? `${model.color}20` : 'transparent',
                              border: `1px solid ${isSelected ? `${model.color}55` : listBorder}`,
                              boxShadow: isSelected ? `0 2px 10px ${model.color}30` : 'none',
                              transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                              transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                            }}>
                            <div className="font-bold leading-none mb-1"
                              style={{ fontSize: 14, filter: isSelected ? 'none' : 'grayscale(0.5) opacity(0.6)' }}>
                              {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
                            </div>
                            <div className="font-semibold leading-tight truncate"
                              style={{ fontSize: 12, color: isSelected ? model.color : textSecondary,
                                       transition: 'color 0.15s' }}>
                              {s.dr.label}
                            </div>
                            <div className="leading-snug mt-0.5 font-mono font-bold truncate"
                              style={{ fontSize: 11, color: isSelected ? model.color : textMuted,
                                       opacity: isSelected ? 1 : 0.65, transition: 'color 0.15s, opacity 0.15s' }}>
                              {s.valueLabel}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {presetText && (
              <div className="rounded-[12px] px-4 py-3 leading-relaxed"
                style={{ fontSize: 13, background: listBg, border: `1px solid ${listBorder}`, color: textSecondary }}>
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center font-bold text-white"
                    style={{ fontSize: 10, background: '#007AFF', minWidth: 20 }}>i</div>
                  {presetText}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
