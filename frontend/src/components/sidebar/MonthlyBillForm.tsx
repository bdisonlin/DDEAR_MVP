import { useState, useRef, useCallback } from 'react'
import type {
  BillRow, BillType, VoltageLevel, MonthlyBillSummary,
  MonthlyBillRequestRow, ReSourceType, IndustryType,
  ReSourceConfigDraft, ReSourceConfig,
} from '@/types'
import { uploadMonthlyBill } from '@/api/simulation'
import { fmtNum } from '@/utils/formatters'

interface Props { onSuccess: (result: MonthlyBillSummary, configs?: ReSourceConfig[]) => void }

// ── Constants ──────────────────────────────────────────────────────────────

const MONTH_SHORT = ['1','2','3','4','5','6','7','8','9','10','11','12']
const SUMMER_MONTHS_LOW = new Set([6, 7, 8, 9])
const isSummerMonth = (m: number, v: VoltageLevel) =>
  v === 'high' ? m >= 5 && m <= 10 : SUMMER_MONTHS_LOW.has(m)

const INDUSTRY_TYPES: { value: IndustryType; icon: string; label: string; hint: string }[] = [
  { value: 'office_commercial', icon: '🏢', label: '商辦/輕工業', hint: '午休下沉，15:00 冷氣+設備尖峰，週末六成' },
  { value: 'heavy_industry',    icon: '🏭', label: '重工業/三班制', hint: '全天平坦，週末接近工作日（輪班）' },
  { value: 'semiconductor',     icon: '💡', label: '半導體/晶圓廠', hint: '潔淨室 24h 維持，負載極度平坦' },
  { value: 'cold_chain',        icon: '❄️', label: '冷鏈/冷凍倉儲', hint: '夜間壓縮機高，白天進出貨略低' },
  { value: 'retail',            icon: '🛍', label: '零售/百貨', hint: '10:00 開店、21:00 關店，週末人流更高' },
]

const BILL_TYPES: { value: BillType; label: string; short: string }[] = [
  { value: 'tiered',    label: '累進計價',          short: '累進' },
  { value: 'res_2tier', label: '住商二段式時間電價',  short: '住商2段' },
  { value: 'res_3tier', label: '住商三段式時間電價',  short: '住商3段' },
  { value: 'com_2tier', label: '商用二段式時間電價',  short: '商用2段' },
  { value: 'com_3tier', label: '商用三段式時間電價',  short: '商用3段' },
]

interface ReSourceMeta {
  value: ReSourceType; icon: string; label: string; cf: number; cfLabel: string; profile: string
}
const RE_SOURCES: ReSourceMeta[] = [
  { value: 'solar_pv',      icon: '☀️', label: '太陽光電', cf: 0.15, cfLabel: '約 14–17%',
    profile: '日間（08–17 時）發電，夜間為零，具間歇性' },
  { value: 'onshore_wind',  icon: '🌀', label: '陸域風電',  cf: 0.27, cfLabel: '約 25–30%',
    profile: '全天發電，清晨與深夜略高，受地形與風速影響' },
  { value: 'offshore_wind', icon: '🌊', label: '離岸風電',  cf: 0.38, cfLabel: '約 35–40%',
    profile: '台灣海峽東北季風，全天穩定，冬季發電量高' },
  { value: 'biomass',       icon: '🌿', label: '生質能',    cf: 0.75, cfLabel: '約 70–80%',
    profile: '可調度，全天近似穩定基載，波動性最低' },
]

type PeriodKey   = 'kwh' | 'peak_kwh' | 'semi_kwh' | 'sat_kwh' | 'offpeak_kwh'
type RePeriodKey = 're_kwh' | 're_peak_kwh' | 're_semi_kwh' | 're_sat_kwh' | 're_offpeak_kwh'
interface ColDef { key: PeriodKey; label: string; reKey: RePeriodKey; reLabel: string }

const PERIOD_COLS: Record<BillType, ColDef[]> = {
  tiered:    [{ key: 'kwh',         label: '用電',  reKey: 're_kwh',         reLabel: '綠電' }],
  res_2tier: [{ key: 'peak_kwh',    label: '尖峰',  reKey: 're_peak_kwh',    reLabel: '尖峰 RE' },
              { key: 'offpeak_kwh', label: '離峰',  reKey: 're_offpeak_kwh', reLabel: '離峰 RE' }],
  res_3tier: [{ key: 'peak_kwh',    label: '尖峰',  reKey: 're_peak_kwh',    reLabel: '尖峰 RE' },
              { key: 'semi_kwh',    label: '半峰',  reKey: 're_semi_kwh',    reLabel: '半峰 RE' },
              { key: 'offpeak_kwh', label: '離峰',  reKey: 're_offpeak_kwh', reLabel: '離峰 RE' }],
  com_2tier: [{ key: 'peak_kwh',    label: '尖峰',  reKey: 're_peak_kwh',    reLabel: '尖峰 RE' },
              { key: 'sat_kwh',     label: '週六',  reKey: 're_sat_kwh',     reLabel: '週六 RE' },
              { key: 'offpeak_kwh', label: '離峰',  reKey: 're_offpeak_kwh', reLabel: '離峰 RE' }],
  com_3tier: [{ key: 'peak_kwh',    label: '尖峰',  reKey: 're_peak_kwh',    reLabel: '尖峰 RE' },
              { key: 'semi_kwh',    label: '半峰',  reKey: 're_semi_kwh',    reLabel: '半峰 RE' },
              { key: 'sat_kwh',     label: '週六',  reKey: 're_sat_kwh',     reLabel: '週六 RE' },
              { key: 'offpeak_kwh', label: '離峰',  reKey: 're_offpeak_kwh', reLabel: '離峰 RE' }],
}

// ── Row helpers ────────────────────────────────────────────────────────────

function emptyRow(month: number): BillRow {
  return {
    month,
    kwh: '', peak_kwh: '', semi_kwh: '', sat_kwh: '', offpeak_kwh: '',
    peak_kw: '',
    re_kwh: '', re_peak_kwh: '', re_semi_kwh: '', re_sat_kwh: '', re_offpeak_kwh: '',
  }
}
const emptyRows = () => Array.from({ length: 12 }, (_, i) => emptyRow(i + 1))

function totalFromRow(row: BillRow, bt: BillType): number {
  return PERIOD_COLS[bt].reduce((s, c) => s + (parseFloat(row[c.key]) || 0), 0)
}

// ── CSV helpers ────────────────────────────────────────────────────────────

type ReInputMode = 'total' | 'period'

function parseCSVLine(line: string): string[] {
  const normalized = line.replace(/[""'']/g, '"')
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function buildCsvColumns(bt: BillType, reInputMode: ReInputMode): string[] {
  const cols = PERIOD_COLS[bt]
  return [
    'month',
    ...cols.map(c => c.key),
    ...(reInputMode === 'total' ? ['re_kwh'] : cols.map(c => c.reKey)),
  ]
}

function downloadTemplate(bt: BillType, reInputMode: ReInputMode) {
  const cols = buildCsvColumns(bt, reInputMode)
  const header = cols.join(',')
  const body = Array.from({ length: 12 }, (_, i) =>
    [i + 1, ...Array(cols.length - 1).fill('')].join(',')
  ).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `monthly_bill_${bt}_${reInputMode}_template.csv`
  a.click()
}

function detectBillType(headers: string[]): BillType | null {
  if (headers.includes('kwh')) return 'tiered'
  const hasPeak = headers.includes('peak_kwh')
  const hasSemi = headers.includes('semi_kwh')
  const hasSat  = headers.includes('sat_kwh')
  const hasOff  = headers.includes('offpeak_kwh')
  if (hasPeak && hasSemi && hasSat  && hasOff) return 'com_3tier'
  if (hasPeak && hasSat  && hasOff  && !hasSemi) return 'com_2tier'
  if (hasPeak && hasSemi && hasOff  && !hasSat)  return 'res_3tier'
  if (hasPeak && hasOff  && !hasSemi && !hasSat)  return 'res_2tier'
  return null
}

function parseCsvText(text: string, bt: BillType) {
  const periodCols = PERIOD_COLS[bt]
  const cleaned = text.replace(/^﻿/, '')
  const lines = cleaned.trim().split('\n').map(l => l.replace(/\r$/, '')).filter(l => l && !l.startsWith('#'))
  const warnings: string[] = []
  if (!lines.length) return { rows: emptyRows(), hasRe: false, reMode: 'total' as ReInputMode, detectedBillType: null as BillType | null, warnings: ['CSV 為空'] }

  const firstParts = parseCSVLine(lines[0])
  const hasHeader  = isNaN(Number(firstParts[0]))
  const headers    = hasHeader
    ? firstParts.map(s => s.toLowerCase().replace(/﻿/g, '').trim())
    : ['month', ...periodCols.map(c => c.key), ...periodCols.map(c => c.reKey)]
  const dataLines  = hasHeader ? lines.slice(1) : lines
  const detectedBillType = hasHeader ? detectBillType(headers) : null

  const next = emptyRows()
  let filled = 0
  dataLines.forEach((line, li) => {
    const parts = parseCSVLine(line)
    const mIdx  = headers.indexOf('month')
    const raw   = parseInt(parts[mIdx >= 0 ? mIdx : 0])
    if (isNaN(raw) || raw < 1 || raw > 12) {
      warnings.push(`第 ${li + (hasHeader ? 2 : 1)} 行：月份無效，已略過`); return
    }
    const idx = raw - 1
    headers.forEach((h, j) => {
      if (h !== 'month' && h in next[idx]) {
        const val = (parts[j] ?? '').replace(/,/g, '')
        ;(next[idx] as unknown as Record<string, string>)[h] = val
      }
    })
    filled++
  })
  if (!filled) warnings.push('未找到任何有效資料列')

  const hasPeriodRe = headers.some(h => ['re_peak_kwh','re_semi_kwh','re_sat_kwh','re_offpeak_kwh'].includes(h))
  const hasTotalRe  = headers.includes('re_kwh')
  const hasRe = next.some(r =>
    [r.re_kwh, r.re_peak_kwh, r.re_semi_kwh, r.re_sat_kwh, r.re_offpeak_kwh].some(v => v !== '')
  )
  const reMode: ReInputMode = hasPeriodRe ? 'period' : hasTotalRe ? 'total' : 'total'
  return { rows: next, hasRe, reMode, detectedBillType, warnings }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const inputCls   = `w-full rounded px-1 py-1 text-xs border border-black/8 dark:border-white/10
  bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
  focus:border-ios-blue/50 focus:ring-1 focus:ring-ios-blue/20 text-center`
const reInputCls = `w-full rounded px-1 py-1 text-xs border border-ios-green/30 dark:border-ios-green/20
  bg-ios-green/4 dark:bg-ios-green/5 text-gray-900 dark:text-gray-100 outline-none
  focus:border-ios-green/60 focus:ring-1 focus:ring-ios-green/20 text-center`

// ── Sub-components ─────────────────────────────────────────────────────────

function BillTypeSelector({ value, onChange }: { value: BillType; onChange: (t: BillType) => void }) {
  return (
    <div>
      <label className="label">電費類型</label>
      <div className="flex flex-wrap gap-1 mt-1">
        {BILL_TYPES.map(t => (
          <button key={t.value} onClick={() => onChange(t.value)} title={t.label}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
              value === t.value
                ? 'bg-ios-blue/10 border-ios-blue/30 text-ios-blue'
                : 'bg-black/4 dark:bg-white/6 border-black/8 dark:border-white/10 text-ios-gray1 hover:opacity-80'
            }`}>
            {t.short}
          </button>
        ))}
      </div>
      {value !== 'tiered' && (
        <p className="text-xs text-ios-gray2 mt-1 leading-relaxed">
          {value === 'res_2tier' && '住商簡易二段式：週末＋假日全天離峰'}
          {value === 'res_3tier' && '住商簡易三段式：週末＋假日全天離峰，非夏季無尖峰'}
          {value === 'com_2tier' && '商用二段式：週六半尖峰獨立計價'}
          {value === 'com_3tier' && '商用三段式：含尖峰、半尖峰、週六半尖峰、離峰'}
        </p>
      )}
    </div>
  )
}

function VoltageSelector({ value, onChange }: { value: VoltageLevel; onChange: (v: VoltageLevel) => void }) {
  return (
    <div>
      <label className="label">電壓級別</label>
      <div className="flex gap-1 mt-1">
        {([
          { value: 'high' as VoltageLevel, label: '高壓／特高壓', hint: '夏月 5/16–10/15' },
          { value: 'low'  as VoltageLevel, label: '低壓',         hint: '夏月 6/1–9/30' },
        ]).map(v => (
          <button key={v.value} onClick={() => onChange(v.value)} title={v.hint}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
              value === v.value
                ? 'bg-ios-blue/10 border-ios-blue/30 text-ios-blue'
                : 'bg-black/4 dark:bg-white/6 border-black/8 dark:border-white/10 text-ios-gray1 hover:opacity-80'
            }`}>
            {v.label}
            <span className="block text-[9px] opacity-60 font-normal">{v.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ReModeHint({ mode }: { mode: ReInputMode }) {
  if (mode === 'total') return (
    <div className="rounded px-2.5 py-2 text-[10.5px] leading-relaxed text-ios-gray1"
      style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.14)' }}>
      <span className="font-semibold text-ios-green">月總量模式：</span>
      填入當月綠電轉供<strong>總量（kWh）</strong>，後端依各能源種的容量與發電剖面自動分配時段比例。
    </div>
  )
  return (
    <div className="rounded px-2.5 py-2 text-[10.5px] leading-relaxed text-ios-gray1"
      style={{ background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.14)' }}>
      <span className="font-semibold text-ios-blue">按時段模式：</span>
      依電費單填入<strong>各時段轉供 kWh</strong>，後端直接採用填入值計費。
    </div>
  )
}

/**
 * Compute the physics-based proportion each source contributes, mirroring
 * the backend's _compute_proportions logic (capacity_kw × CF).
 * Used only for the UI hint — the actual computation is authoritative on backend.
 */
function computeProportionHints(drafts: ReSourceConfigDraft[]): { source_type: ReSourceType; pct: number }[] {
  const expected = drafts.map(d => ({
    source_type: d.source_type,
    exp: (parseFloat(d.capacity_kw) || 0) * (RE_SOURCES.find(s => s.value === d.source_type)?.cf ?? 0.15),
  }))
  const total = expected.reduce((s, e) => s + e.exp, 0)
  if (total === 0) return drafts.map(d => ({ source_type: d.source_type, pct: 100 / drafts.length }))
  return expected.map(e => ({ source_type: e.source_type, pct: (e.exp / total) * 100 }))
}

/**
 * Multi-source RE configuration manager.
 * Users input: contracted capacity (kW) + PPA rate per source.
 * The proportion each source contributes to the metered re_kwh is automatically
 * derived by the backend from capacity × CF — users never input proportions.
 */
function ReConfigManager({
  configs,
  onChange,
}: {
  configs: ReSourceConfigDraft[]
  onChange: (next: ReSourceConfigDraft[]) => void
}) {
  const used      = new Set(configs.map(c => c.source_type))
  const available = RE_SOURCES.filter(s => !used.has(s.value))
  const hints     = configs.length > 0 ? computeProportionHints(configs) : []

  return (
    <div className="space-y-2">
      {/* Configured sources */}
      {configs.map((cfg, i) => {
        const src  = RE_SOURCES.find(s => s.value === cfg.source_type)!
        const hint = hints.find(h => h.source_type === cfg.source_type)
        return (
          <div key={cfg.source_type}
            className="rounded-ios-sm px-2.5 py-2.5 space-y-2"
            style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.18)' }}>
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm shrink-0">{src.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-ios-green block">{src.label}</span>
                <span className="text-[9px] text-ios-gray2">CF {src.cfLabel} · {src.profile}</span>
              </div>
              {hint && configs.length > 1 && (
                <span className="text-[10px] font-semibold text-ios-green/70 shrink-0">
                  ≈ {hint.pct.toFixed(0)}%
                </span>
              )}
              <button
                onClick={() => onChange(configs.filter((_, j) => j !== i))}
                className="text-[11px] text-ios-red hover:opacity-70 shrink-0 px-1 font-medium">
                ✕
              </button>
            </div>
            {/* Capacity + PPA inputs */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-ios-gray2 shrink-0">合約容量</span>
                <input
                  type="number" min={0} step={50}
                  placeholder="kW"
                  value={cfg.capacity_kw}
                  onChange={e => onChange(configs.map((c, j) =>
                    j === i ? { ...c, capacity_kw: e.target.value } : c
                  ))}
                  className="flex-1 rounded px-1.5 py-1 text-xs border border-ios-green/25
                    bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
                    focus:border-ios-green/50 text-right"
                />
                <span className="text-[10px] text-ios-gray2 shrink-0">kW</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-ios-gray2 shrink-0">PPA</span>
                <input
                  type="number" min={0} step={0.1}
                  placeholder="元/kWh"
                  value={cfg.ppa_rate}
                  onChange={e => onChange(configs.map((c, j) =>
                    j === i ? { ...c, ppa_rate: e.target.value } : c
                  ))}
                  className="flex-1 rounded px-1.5 py-1 text-xs border border-ios-green/25
                    bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
                    focus:border-ios-green/50 text-right"
                />
                <span className="text-[10px] text-ios-gray2 shrink-0">元/kWh</span>
              </div>
            </div>
          </div>
        )
      })}

      {/* Physics-based proportion hint for multi-source */}
      {configs.length > 1 && hints.every(h => h.pct > 0) && (
        <div className="rounded px-2.5 py-1.5 text-[10px] leading-relaxed"
          style={{ background: 'rgba(52,199,89,0.04)', border: '1px solid rgba(52,199,89,0.12)' }}>
          <span className="font-semibold text-ios-green">後端模擬佔比（依容量 × 容量因子推算）：</span>
          <span className="text-ios-gray1 ml-1">
            {hints.map(h => {
              const src = RE_SOURCES.find(s => s.value === h.source_type)!
              return `${src.icon} ${src.label} ${h.pct.toFixed(0)}%`
            }).join('  ·  ')}
          </span>
        </div>
      )}

      {/* Add more sources */}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map(src => (
            <button key={src.value}
              onClick={() => onChange([...configs, { source_type: src.value, capacity_kw: '', ppa_rate: '' }])}
              className="flex items-center gap-1 px-2 py-1 rounded-ios-sm text-xs border
                border-ios-green/20 bg-ios-green/5 text-ios-green hover:bg-ios-green/10
                transition-colors font-medium">
              <span>{src.icon}</span>+ {src.label}
            </button>
          ))}
        </div>
      )}

      {configs.length === 0 && (
        <p className="text-[10.5px] text-ios-gray2 px-1">
          新增綠電來源，輸入合約容量（kW）與 PPA 費率；後端依容量因子自動計算各能源種的時段分配與 PPA 費用
        </p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

type InputMode = 'manual' | 'csv'

export default function MonthlyBillForm({ onSuccess }: Props) {
  const [inputMode,     setInputMode]     = useState<InputMode>('manual')
  const [year,          setYear]          = useState(2024)
  const [billType,      setBillType]      = useState<BillType>('tiered')
  const [voltage,       setVoltage]       = useState<VoltageLevel>('high')
  const [rows,          setRows]          = useState<BillRow[]>(emptyRows())
  const [showRe,        setShowRe]        = useState(false)
  const [reInputMode,   setReInputMode]   = useState<ReInputMode>('total')
  const [reConfigs,     setReConfigs]     = useState<ReSourceConfigDraft[]>([])
  const [industryType,      setIndustryType]      = useState<IndustryType>('office_commercial')
  const [useIndustryShape,  setUseIndustryShape]  = useState(false)
  const [loading,           setLoading]           = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const [csvFile,     setCsvFile]     = useState<File | null>(null)
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])
  const [isDragging,  setIsDragging]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cols         = PERIOD_COLS[billType]
  const totalKwh     = rows.reduce((s, r) => s + totalFromRow(r, billType), 0)
  const filledMonths = rows.filter(r => totalFromRow(r, billType) > 0).length
  const totalReKwh   = rows.reduce((s, r) =>
    s + (parseFloat(r.re_kwh) || 0)
      + (parseFloat(r.re_peak_kwh) || 0)
      + (parseFloat(r.re_semi_kwh) || 0)
      + (parseFloat(r.re_sat_kwh) || 0)
      + (parseFloat(r.re_offpeak_kwh) || 0)
  , 0)

  const setCell = (i: number, field: keyof BillRow, val: string) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const handleBillTypeChange = (t: BillType) => {
    setBillType(t); setRows(emptyRows()); setCsvFile(null); setCsvWarnings([]); setError(null)
  }

  const applyFile = useCallback((file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) { setError('請上傳 .csv 或 .txt 格式'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows: parsed, hasRe, reMode, detectedBillType, warnings } = parseCsvText(
        (ev.target?.result as string) ?? '', billType
      )
      if (detectedBillType && detectedBillType !== billType) setBillType(detectedBillType)
      setRows(parsed)
      if (hasRe) { setShowRe(true); setReInputMode(reMode) }
      setCsvFile(file); setCsvWarnings(warnings)
      setError(warnings.some(w => w.includes('為空') || w.includes('未找到')) ? warnings[0] : null)
    }
    reader.readAsText(file, 'UTF-8')
  }, [billType])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) applyFile(f); e.target.value = ''
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) applyFile(f)
  }
  const clearCsv = () => {
    setCsvFile(null); setCsvWarnings([]); setRows(emptyRows()); setShowRe(false)
    setReConfigs([]); setError(null)
  }

  // Build re_source_configs payload from UI drafts
  function buildReSourceConfigs(): ReSourceConfig[] | undefined {
    if (!showRe || reInputMode !== 'total' || reConfigs.length === 0) return undefined
    const valid = reConfigs.filter(c => parseFloat(c.capacity_kw) > 0)
    if (valid.length === 0) return undefined
    return valid.map(c => {
      const ppaRate = parseFloat(c.ppa_rate)
      return {
        source_type: c.source_type,
        capacity_kw: parseFloat(c.capacity_kw),
        ppa_rate_ntd_per_kwh: !isNaN(ppaRate) && ppaRate > 0 ? ppaRate : null,
      }
    })
  }

  const handleSubmit = async () => {
    const validRows: MonthlyBillRequestRow[] = rows
      .filter(r => totalFromRow(r, billType) > 0)
      .map(r => {
        const base: MonthlyBillRequestRow = { month: r.month }

        if (billType === 'tiered') {
          const v = parseFloat(r.kwh); if (v > 0) base.kwh = v
        } else {
          for (const col of cols) {
            if (col.key === 'peak_kwh' && !isSummerMonth(r.month, voltage)) continue
            const v = parseFloat(r[col.key])
            if (v >= 0 && r[col.key] !== '') base[col.key] = v
          }
        }

        if (r.peak_kw !== '') { const v = parseFloat(r.peak_kw); if (v > 0) base.peak_kw = v }

        if (showRe) {
          if (reInputMode === 'total') {
            const v = parseFloat(r.re_kwh); if (v >= 0 && r.re_kwh !== '') base.re_kwh = v
          } else {
            if (billType === 'tiered') {
              const v = parseFloat(r.re_kwh); if (v >= 0 && r.re_kwh !== '') base.re_kwh = v
            } else {
              for (const col of cols) {
                const v = parseFloat(r[col.reKey])
                if (v >= 0 && r[col.reKey] !== '') base[col.reKey] = v
              }
            }
          }
        }
        return base
      })

    if (!validRows.length) { setError('請至少填入一個月的用電量'); return }

    setLoading(true); setError(null)
    try {
      const contractedKw = rows[0].peak_kw !== '' ? parseFloat(rows[0].peak_kw) || null : null
      const result = await uploadMonthlyBill({
        year, bill_type: billType, voltage, contracted_kw: contractedKw,
        re_source_configs: buildReSourceConfigs(),
        industry_type: industryType,
        use_industry_shape: useIndustryShape,
        rows: validRows,
      })
      onSuccess(result, buildReSourceConfigs())
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const reColsInTable = showRe ? (reInputMode === 'total' ? 1 : cols.length) : 0
  const gridCols      = `28px repeat(${cols.length + reColsInTable}, minmax(58px, 1fr))`
  const csvCols       = buildCsvColumns(billType, reInputMode)

  return (
    <div className="space-y-3">

      <div>
        <label className="label">帳單年份</label>
        <select className="input" value={year} onChange={e => setYear(+e.target.value)}>
          {[2021,2022,2023,2024,2025].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      <BillTypeSelector value={billType} onChange={handleBillTypeChange} />
      <VoltageSelector  value={voltage}  onChange={setVoltage} />

      {/* Industry type */}
      <div>
        <label className="label">產業別（負載形狀）</label>
        <div className="grid grid-cols-1 gap-1 mt-1">
          {INDUSTRY_TYPES.map(ind => (
            <button key={ind.value} type="button" onClick={() => setIndustryType(ind.value)}
              className={`flex items-start gap-2 px-2.5 py-2 rounded-ios-sm text-left text-xs
                transition-colors border ${
                industryType === ind.value
                  ? 'bg-ios-blue/8 border-ios-blue/30 text-ios-blue'
                  : 'bg-black/3 dark:bg-white/4 border-black/8 dark:border-white/10 text-ios-gray1 hover:opacity-80'
              }`}>
              <span className="text-sm shrink-0 mt-px">{ind.icon}</span>
              <span>
                <span className="font-semibold block">{ind.label}</span>
                <span className="text-[10px] text-ios-gray2 font-normal">{ind.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 rounded-ios-sm px-2.5 py-2 space-y-1"
          style={{ background: 'rgba(0,122,255,0.04)', border: '1px solid rgba(0,122,255,0.12)' }}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={useIndustryShape}
              onChange={e => setUseIndustryShape(e.target.checked)}
              className="accent-ios-blue w-3.5 h-3.5" />
            <span className="text-xs font-semibold text-ios-blue">產業別比較模式</span>
          </label>
          <p className="text-[10px] text-ios-gray2 leading-relaxed">
            {useIndustryShape
              ? '✦ 以產業標準時段分配取代電費單各時段 kWh，月總量仍保持一致。'
              : '✦ 預設：以電費單各時段 kWh 為準，產業別僅影響時段內細部波動。'}
          </p>
        </div>
      </div>

      {/* Input mode toggle */}
      <div className="flex gap-0.5 p-0.5 rounded-ios-sm bg-black/5 dark:bg-white/6">
        {([
          { id: 'manual' as InputMode, icon: '⌨', label: '手動輸入' },
          { id: 'csv'    as InputMode, icon: '📄', label: '上傳 CSV' },
        ]).map(m => (
          <button key={m.id} type="button"
            onClick={() => { setInputMode(m.id); setError(null) }}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg font-medium transition-all duration-200',
              inputMode === m.id
                ? 'bg-white dark:bg-white/15 text-ios-blue shadow-ios'
                : 'text-ios-gray1 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}>
            <span>{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {/* ════ RE 設定區 ════ */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-ios-gray1 cursor-pointer select-none">
            <input type="checkbox" checked={showRe}
              onChange={e => { setShowRe(e.target.checked); if (!e.target.checked) setReConfigs([]) }}
              className="accent-ios-green w-3.5 h-3.5" />
            含綠電轉供欄位
          </label>
          {showRe && (
            <div className="ml-auto flex gap-0.5 p-0.5 rounded bg-black/5 dark:bg-white/6">
              {(['total', 'period'] as ReInputMode[]).map(m => (
                <button key={m} type="button" onClick={() => setReInputMode(m)}
                  className={`text-[10px] px-2.5 py-0.5 rounded font-semibold transition-all ${
                    reInputMode === m
                      ? m === 'total'
                        ? 'bg-ios-green/15 text-ios-green shadow-ios'
                        : 'bg-ios-blue/15  text-ios-blue  shadow-ios'
                      : 'text-ios-gray2 hover:text-ios-gray1'
                  }`}>
                  {m === 'total' ? '月總量' : '按時段'}
                </button>
              ))}
            </div>
          )}
        </div>

        {showRe && (
          <>
            <ReModeHint mode={reInputMode} />
            {reInputMode === 'total' && (
              <div className="rounded-ios-sm px-3 py-2.5 space-y-2"
                style={{ background: 'rgba(52,199,89,0.04)', border: '1px solid rgba(52,199,89,0.16)' }}>
                <p className="text-[11px] font-semibold text-ios-green">綠電能源組合</p>
                <ReConfigManager configs={reConfigs} onChange={setReConfigs} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ════ CSV MODE ════ */}
      {inputMode === 'csv' && (
        <div className="space-y-3">
          <div className="rounded-ios-sm px-3 py-2.5 space-y-1.5"
            style={{ background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.14)' }}>
            <p className="text-xs font-semibold text-ios-blue">CSV 欄位格式</p>
            <div className="flex flex-wrap gap-x-0.5 gap-y-0.5 text-[10px] font-data">
              {csvCols.map((h, i) => (
                <span key={h} className="flex items-center">
                  {i > 0 && <span className="text-ios-gray2 mr-0.5">,</span>}
                  <code className={`px-1 py-0.5 rounded ${
                    h === 'month'    ? 'bg-ios-indigo/10 text-ios-indigo' :
                    h.startsWith('re_') ? 'bg-ios-green/10 text-ios-green' :
                    'bg-black/5 dark:bg-white/6 text-ios-gray1'
                  }`}>{h}</code>
                </span>
              ))}
            </div>
            {showRe && reInputMode === 'total' && (
              <p className="text-[10px] text-ios-gray2">
                ✦ re_kwh = 當月綠電轉供總量；能源組合配置在上方「綠電能源組合」設定
              </p>
            )}
          </div>

          <button onClick={() => downloadTemplate(billType, showRe ? reInputMode : 'total')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-ios-sm text-xs font-medium
              text-ios-gray1 border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/4
              hover:bg-black/6 dark:hover:bg-white/8 transition-colors">
            <span className="text-base">⬇</span> 下載範本 CSV
          </button>

          {!csvFile ? (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-ios-sm cursor-pointer select-none transition-all duration-200"
              style={{
                minHeight: 120,
                border: `2px dashed ${isDragging ? '#007AFF' : 'rgba(0,0,0,0.15)'}`,
                background: isDragging ? 'rgba(0,122,255,0.06)' : 'rgba(0,0,0,0.02)',
              }}>
              <span style={{ fontSize: 30, lineHeight: 1 }}>📂</span>
              <div className="text-center">
                <p className="text-xs font-medium text-ios-gray1">
                  {isDragging ? '放開以上傳' : '拖曳 CSV 至此，或點擊選擇檔案'}
                </p>
                <p className="text-[10px] text-ios-gray2 mt-0.5">支援 .csv / .txt，UTF-8 編碼</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-ios-sm"
                style={{ background: 'rgba(52,199,89,0.07)', border: '1px solid rgba(52,199,89,0.18)' }}>
                <span className="text-base">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ios-green truncate">{csvFile.name}</p>
                  <p className="text-[10px] text-ios-gray2">已解析 {filledMonths} 個月 · {(csvFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={clearCsv} className="text-xs text-ios-red hover:opacity-70 shrink-0 font-medium">清除</button>
              </div>

              {csvWarnings.length > 0 && (
                <div className="rounded px-2.5 py-2 space-y-0.5"
                  style={{ background: 'rgba(255,149,0,0.07)', border: '1px solid rgba(255,149,0,0.20)' }}>
                  {csvWarnings.map((w, i) => <p key={i} className="text-[11px] text-ios-orange">⚠ {w}</p>)}
                </div>
              )}

              <div className="rounded-ios-sm border border-black/8 dark:border-white/8 overflow-hidden">
                <div className="px-2 py-1.5 border-b border-black/6 dark:border-white/6"
                  style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <p className="text-[11px] font-semibold text-ios-gray1">資料預覽</p>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: 230 }}>
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-ios-gray6 dark:bg-[#1c1c22]">
                      <tr>
                        <th className="px-2 py-1.5 text-center text-ios-gray1 border-b border-black/6 dark:border-white/6 font-semibold">月</th>
                        {cols.map(c => (
                          <th key={c.key} className="px-2 py-1.5 text-center text-ios-gray1 border-b border-black/6 dark:border-white/6 font-semibold">
                            {c.label}<br/><span className="text-[9px] font-normal text-ios-gray2">kWh</span>
                          </th>
                        ))}
                        {showRe && reInputMode === 'total' && (
                          <th className="px-2 py-1.5 text-center text-ios-green border-b border-black/6 dark:border-white/6 font-semibold">
                            綠電總量<br/><span className="text-[9px] font-normal text-ios-green/60">kWh</span>
                          </th>
                        )}
                        {showRe && reInputMode === 'period' && cols.map(c => (
                          <th key={c.reKey} className="px-2 py-1.5 text-center text-ios-green border-b border-black/6 dark:border-white/6 font-semibold">
                            {c.reLabel}<br/><span className="text-[9px] font-normal text-ios-green/60">kWh</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const empty = totalFromRow(row, billType) === 0
                        return (
                          <tr key={row.month}
                            className={`border-b border-black/4 dark:border-white/4 last:border-0 ${empty ? 'opacity-30' : ''}`}>
                            <td className="px-2 py-1 text-center font-medium text-ios-gray1">{MONTH_SHORT[i]}月</td>
                            {cols.map(c => {
                              const noSummer = c.key === 'peak_kwh' && billType !== 'tiered' && !isSummerMonth(row.month, voltage)
                              return (
                                <td key={c.key} className="px-2 py-1 text-center font-data text-gray-700 dark:text-gray-300">
                                  {noSummer ? <span className="text-[9px] text-ios-gray2">非夏月</span>
                                    : row[c.key] !== '' ? fmtNum(parseFloat(row[c.key]) || 0)
                                    : <span className="text-ios-gray2">—</span>}
                                </td>
                              )
                            })}
                            {showRe && reInputMode === 'total' && (
                              <td className="px-2 py-1 text-center font-data text-ios-green">
                                {row.re_kwh !== '' ? fmtNum(parseFloat(row.re_kwh) || 0) : <span className="text-ios-gray2">—</span>}
                              </td>
                            )}
                            {showRe && reInputMode === 'period' && cols.map(c => (
                              <td key={c.reKey} className="px-2 py-1 text-center font-data text-ios-green">
                                {row[c.reKey] !== '' ? fmtNum(parseFloat(row[c.reKey]) || 0) : <span className="text-ios-gray2">—</span>}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <button onClick={() => fileRef.current?.click()}
                className="text-[11px] text-ios-blue hover:opacity-70 transition-opacity w-full text-center">
                重新選擇檔案
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* ════ MANUAL MODE ════ */}
      {inputMode === 'manual' && (
        <div className="overflow-x-auto rounded-ios-sm border border-black/8 dark:border-white/8" style={{ maxHeight: 340 }}>
          <div className="sticky top-0 z-10 bg-ios-gray6 dark:bg-[#1c1c22] border-b border-black/6 dark:border-white/6 px-2 py-1.5"
            style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 3 }}>
            <span />
            {cols.map(c => (
              <div key={c.key} className="flex flex-col items-center leading-tight">
                <span className="text-[10px] font-semibold text-ios-gray1">{c.label}</span>
                <span className="text-[9px] text-ios-gray2">kWh</span>
              </div>
            ))}
            {showRe && reInputMode === 'total' && (
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[10px] font-semibold text-ios-green">綠電總量</span>
                <span className="text-[9px] text-ios-green/60">kWh</span>
              </div>
            )}
            {showRe && reInputMode === 'period' && cols.map(c => (
              <div key={c.reKey} className="flex flex-col items-center leading-tight">
                <span className="text-[10px] font-semibold text-ios-green">{c.reLabel}</span>
                <span className="text-[9px] text-ios-green/60">kWh</span>
              </div>
            ))}
          </div>

          {rows.map((row, i) => (
            <div key={row.month}
              className="border-b border-black/4 dark:border-white/4 last:border-0 px-2 py-1 items-center"
              style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 3 }}>
              <span className="text-[10.5px] font-medium text-ios-gray1 text-center">{MONTH_SHORT[i]}月</span>
              {cols.map(c => {
                const noSummer = c.key === 'peak_kwh' && billType !== 'tiered' && !isSummerMonth(row.month, voltage)
                return noSummer
                  ? <div key={c.key} className="w-full rounded px-1 py-1 text-[10px] text-center text-ios-gray2
                      bg-black/4 dark:bg-white/4 border border-dashed border-black/10 dark:border-white/10">非夏月</div>
                  : <input key={c.key} type="number" min={0} step={1000}
                      value={row[c.key]} onChange={e => setCell(i, c.key, e.target.value)}
                      className={inputCls} />
              })}
              {showRe && reInputMode === 'total' && (
                <input type="number" min={0} step={100}
                  value={row.re_kwh} onChange={e => setCell(i, 're_kwh', e.target.value)}
                  className={reInputCls} />
              )}
              {showRe && reInputMode === 'period' && cols.map(c => {
                const noSummer = c.reKey === 're_peak_kwh' && billType !== 'tiered' && !isSummerMonth(row.month, voltage)
                return noSummer
                  ? <div key={c.reKey} className="w-full rounded px-1 py-1 text-[10px] text-center text-ios-gray2
                      bg-black/4 dark:bg-white/4 border border-dashed border-black/10 dark:border-white/10">非夏月</div>
                  : <input key={c.reKey} type="number" min={0} step={100}
                      value={row[c.reKey]} onChange={e => setCell(i, c.reKey, e.target.value)}
                      className={reInputCls} />
              })}
            </div>
          ))}
        </div>
      )}

      {/* Contracted kW */}
      <div className="flex items-center gap-2">
        <label className="label whitespace-nowrap">契約容量 kW（選填）</label>
        <input type="number" min={0} step={10} placeholder="例：500"
          value={rows[0].peak_kw}
          onChange={e => { const v = e.target.value; setRows(r => r.map(row => ({ ...row, peak_kw: v }))) }}
          className="w-28 rounded px-2 py-1 text-xs border border-black/8 dark:border-white/10
            bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
            focus:border-ios-blue/50 focus:ring-1 focus:ring-ios-blue/20" />
      </div>

      {totalKwh > 0 && (
        <div className="flex justify-between text-xs text-ios-gray1 font-data px-1">
          <span>
            已填 {filledMonths} / 12 月
            {showRe && totalReKwh > 0 && (
              <span className="text-ios-green ml-2">· 綠電 {fmtNum(Math.round(totalReKwh))} kWh</span>
            )}
          </span>
          <span>合計 {(totalKwh / 1e6).toFixed(2)} GWh</span>
        </div>
      )}

      {error && <p className="text-xs text-ios-red px-1">{error}</p>}

      <button className="btn-primary w-full" onClick={handleSubmit}
        disabled={loading || filledMonths === 0}
        style={{ background: '#34C759', boxShadow: '0 2px 8px rgba(52,199,89,0.28)' }}>
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />合成中</>
          : '▶ 生成 15 分鐘模擬資料'}
      </button>

      <p className="text-xs text-ios-gray2 text-center leading-relaxed">
        依電費單合成全年 35,040 筆 15 分鐘用電數據
      </p>
    </div>
  )
}
