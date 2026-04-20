import { useState, useRef } from 'react'
import type { BillRow, BillType, VoltageLevel, MonthlyBillSummary, MonthlyBillRequestRow } from '@/types'
import { uploadMonthlyBill } from '@/api/simulation'

interface Props {
  onSuccess: (result: MonthlyBillSummary) => void
}

const MONTH_SHORT = ['1','2','3','4','5','6','7','8','9','10','11','12']
const SUMMER_MONTHS_LOW  = new Set([6, 7, 8, 9])
// High-voltage summer: May 16 – Oct 15. For UI purposes we gray peak for months
// that are entirely non-summer: Jan-Apr (1-4) and Nov-Dec (11-12) for high voltage
// and Oct-May (10-5) for low voltage.
const isSummerMonth = (m: number, voltage: VoltageLevel) =>
  voltage === 'high'
    ? (m >= 5 && m <= 10)   // May–Oct all touched by high-voltage summer
    : SUMMER_MONTHS_LOW.has(m)

const BILL_TYPES: { value: BillType; label: string; short: string }[] = [
  { value: 'tiered',    label: '累進計價',         short: '累進' },
  { value: 'res_2tier', label: '住商二段式時間電價', short: '住商2段' },
  { value: 'res_3tier', label: '住商三段式時間電價', short: '住商3段' },
  { value: 'com_2tier', label: '商用二段式時間電價', short: '商用2段' },
  { value: 'com_3tier', label: '商用三段式時間電價', short: '商用3段' },
]

type PeriodKey = 'kwh' | 'peak_kwh' | 'semi_kwh' | 'sat_kwh' | 'offpeak_kwh'
type RePeriodKey = 're_kwh' | 're_peak_kwh' | 're_semi_kwh' | 're_sat_kwh' | 're_offpeak_kwh'

interface ColDef {
  key: PeriodKey
  label: string
  reKey: RePeriodKey
}

const PERIOD_COLS: Record<BillType, ColDef[]> = {
  tiered: [
    { key: 'kwh',         label: '用電',   reKey: 're_kwh' },
  ],
  res_2tier: [
    { key: 'peak_kwh',    label: '尖峰',   reKey: 're_peak_kwh' },
    { key: 'offpeak_kwh', label: '離峰',   reKey: 're_offpeak_kwh' },
  ],
  res_3tier: [
    { key: 'peak_kwh',    label: '尖峰',   reKey: 're_peak_kwh' },
    { key: 'semi_kwh',    label: '半峰',   reKey: 're_semi_kwh' },
    { key: 'offpeak_kwh', label: '離峰',   reKey: 're_offpeak_kwh' },
  ],
  com_2tier: [
    { key: 'peak_kwh',    label: '尖峰',   reKey: 're_peak_kwh' },
    { key: 'sat_kwh',     label: '週六',   reKey: 're_sat_kwh' },
    { key: 'offpeak_kwh', label: '離峰',   reKey: 're_offpeak_kwh' },
  ],
  com_3tier: [
    { key: 'peak_kwh',    label: '尖峰',   reKey: 're_peak_kwh' },
    { key: 'semi_kwh',    label: '半峰',   reKey: 're_semi_kwh' },
    { key: 'sat_kwh',     label: '週六',   reKey: 're_sat_kwh' },
    { key: 'offpeak_kwh', label: '離峰',   reKey: 're_offpeak_kwh' },
  ],
}

function emptyRow(month: number): BillRow {
  return {
    month,
    kwh: '', peak_kwh: '', semi_kwh: '', sat_kwh: '', offpeak_kwh: '',
    peak_kw: '',
    re_kwh: '', re_peak_kwh: '', re_semi_kwh: '', re_sat_kwh: '', re_offpeak_kwh: '',
  }
}

function emptyRows(): BillRow[] {
  return Array.from({ length: 12 }, (_, i) => emptyRow(i + 1))
}

function totalFromRow(row: BillRow, billType: BillType): number {
  const cols = PERIOD_COLS[billType]
  return cols.reduce((s, c) => s + (parseFloat(row[c.key]) || 0), 0)
}

function downloadTemplate(billType: BillType) {
  const cols = PERIOD_COLS[billType]
  const header = ['month', ...cols.map(c => c.key), 'peak_kw', ...cols.map(c => c.reKey)].join(',')
  const body = Array.from({ length: 12 }, (_, i) =>
    [i + 1, ...cols.map(() => ''), '', ...cols.map(() => '')].join(',')
  ).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `monthly_bill_${billType}_template.csv`
  a.click()
}

const inputCls = `w-full rounded px-1 py-1 text-xs border border-black/8 dark:border-white/10
  bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
  focus:border-ios-blue/50 focus:ring-1 focus:ring-ios-blue/20 text-center`

const reInputCls = `w-full rounded px-1 py-1 text-xs border border-black/8 dark:border-white/10
  bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
  focus:border-ios-green/50 focus:ring-1 focus:ring-ios-green/20 text-center`

export default function MonthlyBillForm({ onSuccess }: Props) {
  const [year, setYear]           = useState(2024)
  const [billType, setBillType]   = useState<BillType>('tiered')
  const [voltage, setVoltage]     = useState<VoltageLevel>('high')
  const [rows, setRows]           = useState<BillRow[]>(emptyRows())
  const [showRe, setShowRe]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const cols = PERIOD_COLS[billType]

  const setCell = (idx: number, field: keyof BillRow, val: string) =>
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: val } : row))

  const handleBillTypeChange = (t: BillType) => {
    setBillType(t)
    setRows(emptyRows())
    setError(null)
  }

  const totalKwh     = rows.reduce((s, r) => s + totalFromRow(r, billType), 0)
  const filledMonths = rows.filter(r => totalFromRow(r, billType) > 0).length

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? ''
      const lines = text.trim().split('\n').filter(l => !l.startsWith('#'))
      const hasHeader = isNaN(Number(lines[0]?.split(',')[0]))
      const dataLines = hasHeader ? lines.slice(1) : lines
      const headers: string[] = hasHeader
        ? lines[0].split(',').map(s => s.trim())
        : ['month', ...cols.map(c => c.key), 'peak_kw', ...cols.map(c => c.reKey)]

      const next = emptyRows()
      dataLines.forEach(line => {
        const parts = line.split(',').map(s => s.trim())
        const idx = parseInt(parts[0]) - 1
        if (idx < 0 || idx >= 12) return
        headers.forEach((h, j) => {
          if (h in next[idx]) {
            (next[idx] as unknown as Record<string, string>)[h] = parts[j] ?? ''
          }
        })
      })
      setRows(next)
      const hasRe = next.some(r =>
        [r.re_kwh, r.re_peak_kwh, r.re_semi_kwh, r.re_sat_kwh, r.re_offpeak_kwh].some(v => v !== '')
      )
      if (hasRe) setShowRe(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleSubmit = async () => {
    const validRows: MonthlyBillRequestRow[] = rows
      .filter(r => totalFromRow(r, billType) > 0)
      .map(r => {
        const base: MonthlyBillRequestRow = { month: r.month }
        if (billType === 'tiered') {
          const v = parseFloat(r.kwh)
          if (v > 0) base.kwh = v
        } else {
          for (const col of cols) {
            if (col.key === 'peak_kwh' && !isSummerMonth(r.month, voltage)) continue
            const v = parseFloat(r[col.key])
            if (v >= 0 && r[col.key] !== '') base[col.key] = v
          }
        }
        if (r.peak_kw !== '') { const v = parseFloat(r.peak_kw); if (v > 0) base.peak_kw = v }
        if (showRe) {
          if (billType === 'tiered') {
            const v = parseFloat(r.re_kwh); if (v >= 0 && r.re_kwh !== '') base.re_kwh = v
          } else {
            for (const col of cols) {
              const v = parseFloat(r[col.reKey])
              if (v >= 0 && r[col.reKey] !== '') base[col.reKey] = v
            }
          }
        }
        return base
      })

    if (validRows.length === 0) {
      setError('請至少填入一個月的用電量')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const contractedKw = rows[0].peak_kw !== '' ? parseFloat(rows[0].peak_kw) || null : null
      const result = await uploadMonthlyBill({
        year, bill_type: billType, voltage, contracted_kw: contractedKw, rows: validRows,
      })
      onSuccess(result)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Grid: month label + kWh cols + RE cols (if shown) — peak_kw is a separate section
  const reColCount = showRe ? cols.length : 0
  const dataCols   = cols.length + reColCount
  const gridCols   = `32px repeat(${dataCols}, minmax(62px, 1fr))`

  return (
    <div className="space-y-3">
      {/* Year row */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="label">帳單年份</label>
          <select className="input" value={year} onChange={e => setYear(+e.target.value)}>
            {[2021,2022,2023,2024,2025].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="pt-5 flex gap-1">
          <button onClick={() => fileRef.current?.click()} title="匯入 CSV"
            className="w-8 h-8 flex items-center justify-center rounded-ios-sm text-ios-blue hover:opacity-70 transition-opacity border border-ios-blue/20 bg-ios-blue/5 text-sm">↑</button>
          <button onClick={() => downloadTemplate(billType)} title="下載範本"
            className="w-8 h-8 flex items-center justify-center rounded-ios-sm text-ios-gray1 hover:opacity-70 transition-opacity border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-sm">↓</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
        </div>
      </div>

      {/* Bill type selector */}
      <div>
        <label className="label">電費類型</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {BILL_TYPES.map(t => (
            <button key={t.value} onClick={() => handleBillTypeChange(t.value)}
              title={t.label}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                billType === t.value
                  ? 'bg-ios-blue/10 border-ios-blue/30 text-ios-blue'
                  : 'bg-black/4 dark:bg-white/6 border-black/8 dark:border-white/10 text-ios-gray1 hover:opacity-80'
              }`}>
              {t.short}
            </button>
          ))}
        </div>
        {billType !== 'tiered' && (
          <p className="text-xs text-ios-gray2 mt-1 leading-relaxed">
            {billType === 'res_2tier' && '住商簡易二段式：週末＋假日全天離峰'}
            {billType === 'res_3tier' && '住商簡易三段式：週末＋假日全天離峰，非夏季無尖峰'}
            {billType === 'com_2tier' && '商用二段式：週六半尖峰獨立計價'}
            {billType === 'com_3tier' && '商用三段式：含尖峰、半尖峰、週六半尖峰、離峰'}
          </p>
        )}
      </div>

      {/* Voltage level */}
      <div>
        <label className="label">電壓級別</label>
        <div className="flex gap-1 mt-1">
          {([
            { value: 'high', label: '高壓／特高壓', hint: '夏月 5/16–10/15' },
            { value: 'low',  label: '低壓',         hint: '夏月 6/1–9/30' },
          ] as { value: VoltageLevel; label: string; hint: string }[]).map(v => (
            <button key={v.value} onClick={() => setVoltage(v.value)} title={v.hint}
              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                voltage === v.value
                  ? 'bg-ios-blue/10 border-ios-blue/30 text-ios-blue'
                  : 'bg-black/4 dark:bg-white/6 border-black/8 dark:border-white/10 text-ios-gray1 hover:opacity-80'
              }`}>
              {v.label}
              <span className="block text-[9px] opacity-60 font-normal">{v.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* RE toggle */}
      <label className="flex items-center gap-2 text-xs text-ios-gray1 cursor-pointer">
        <input type="checkbox" checked={showRe} onChange={e => setShowRe(e.target.checked)}
          className="accent-ios-green w-3.5 h-3.5" />
        顯示綠電轉供欄位
      </label>

      {/* kWh Table */}
      <div className="overflow-x-auto rounded-ios-sm border border-black/8 dark:border-white/8" style={{ maxHeight: 320 }}>
        {/* Header */}
        <div className="sticky top-0 bg-ios-gray6 dark:bg-[#1c1c22] border-b border-black/6 dark:border-white/6 px-2 py-1.5"
          style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4 }}>
          <span></span>
          {cols.map(c => (
            <div key={c.key} className="flex flex-col items-center leading-tight">
              <span className="text-[11px] font-semibold text-ios-gray1">{c.label}</span>
              <span className="text-[9px] text-ios-gray2">kWh</span>
            </div>
          ))}
          {showRe && cols.map(c => (
            <div key={c.reKey} className="flex flex-col items-center leading-tight">
              <span className="text-[11px] font-semibold text-ios-green">{c.label}</span>
              <span className="text-[9px] text-ios-green/60">RE</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row, i) => (
          <div key={row.month}
            className="border-b border-black/4 dark:border-white/4 last:border-0 px-2 py-1 items-center"
            style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4 }}>
            <span className="text-[11px] font-medium text-ios-gray1 text-center">{MONTH_SHORT[i]}月</span>

            {cols.map(c => {
              const isPeakCol = c.key === 'peak_kwh'
              const noSummerPeak = isPeakCol && billType !== 'tiered' && !isSummerMonth(row.month, voltage)
              return noSummerPeak
                ? <div key={c.key} className="w-full rounded px-1 py-1 text-[10px] text-center text-ios-gray2
                    bg-black/4 dark:bg-white/4 border border-dashed border-black/10 dark:border-white/10">
                    非夏月
                  </div>
                : <input key={c.key}
                    type="number" min={0} step={1000}
                    value={row[c.key]}
                    onChange={e => setCell(i, c.key, e.target.value)}
                    className={inputCls}
                  />
            })}

            {showRe && cols.map(c => {
              const isPeakCol = c.reKey === 're_peak_kwh'
              const noSummerPeak = isPeakCol && billType !== 'tiered' && !isSummerMonth(row.month, voltage)
              return noSummerPeak
                ? <div key={c.reKey} className="w-full rounded px-1 py-1 text-[10px] text-center text-ios-gray2
                    bg-black/4 dark:bg-white/4 border border-dashed border-black/10 dark:border-white/10">
                    非夏月
                  </div>
                : <input key={c.reKey}
                    type="number" min={0} step={1000}
                    value={row[c.reKey]}
                    onChange={e => setCell(i, c.reKey, e.target.value)}
                    className={reInputCls}
                  />
            })}
          </div>
        ))}
      </div>

      {/* Peak demand — single value applied to all months */}
      <div className="flex items-center gap-2">
        <label className="label whitespace-nowrap" title="電費單上的「契約容量」(kW)。填入後可讓系統更準確限制尖峰負載，不知道或沒有可略過。">
          契約容量 kW（選填）
        </label>
        <input
          type="number" min={0} step={10}
          placeholder="例：100"
          value={rows[0].peak_kw}
          onChange={e => {
            const v = e.target.value
            setRows(r => r.map(row => ({ ...row, peak_kw: v })))
          }}
          className="w-28 rounded px-2 py-1 text-xs border border-black/8 dark:border-white/10
            bg-white/80 dark:bg-white/6 text-gray-900 dark:text-gray-100 outline-none
            focus:border-ios-blue/50 focus:ring-1 focus:ring-ios-blue/20"
        />
      </div>

      {/* Summary */}
      {totalKwh > 0 && (
        <div className="flex justify-between text-xs text-ios-gray1 font-data px-1">
          <span>已填 {filledMonths} / 12 月</span>
          <span>合計 {(totalKwh / 1e6).toFixed(2)} GWh</span>
        </div>
      )}

      {error && <p className="text-xs text-ios-red px-1">{error}</p>}

      <button
        className="btn-primary w-full"
        onClick={handleSubmit}
        disabled={loading || filledMonths === 0}
        style={{ background: '#34C759', boxShadow: '0 2px 8px rgba(52,199,89,0.28)' }}
      >
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
