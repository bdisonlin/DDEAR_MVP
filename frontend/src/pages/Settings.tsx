import { useState, useEffect, type ReactNode } from 'react'
import { getSettings, updateSettings } from '@/api/settings'
import { useSandboxStore } from '@/store/useSandboxStore'

// ── Types ──────────────────────────────────────────────────────────────────────

type TouPeriod  = { peak: number; semi_peak: number; off_peak: number }
type TouVoltage = { summer: TouPeriod; non_summer: TouPeriod }
type TierRow    = { max_kwh: number | null; rate: number }

interface TariffDraft {
  seasons: {
    high: { summer_start: string; summer_end: string }
    low:  { summer_start: string; summer_end: string }
  }
  tou: { high: TouVoltage; low: TouVoltage }
  progressive: { summer: TierRow[]; non_summer: TierRow[] }
  penalties: {
    demand_over_10pct: number
    demand_within_10pct: number
    res_tou_excess_threshold: number
    res_tou_excess_rate: number
  }
  demand_charges: { high: number; low: number }
}

// ── Primitive components ───────────────────────────────────────────────────────

function NumInput({
  value, onChange, step = '0.01', disabled, width = 'w-24',
}: {
  value: number; onChange: (v: number) => void
  step?: string; disabled?: boolean; width?: string
}) {
  return (
    <input
      type="number" step={step} min="0"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      disabled={disabled}
      className={`${width} px-2.5 py-1.5 rounded-lg text-sm font-data text-right border
        outline-none transition-colors
        ${disabled
          ? 'bg-transparent border-transparent text-ios-gray2 cursor-not-allowed'
          : 'bg-white dark:bg-white/[0.07] border-black/[0.12] dark:border-white/[0.12] focus:border-ios-blue'
        }`}
    />
  )
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="MM-DD"
      className="w-20 px-2.5 py-1.5 rounded-lg text-sm font-data text-center border
        border-black/[0.12] dark:border-white/[0.12] focus:border-ios-blue
        bg-white dark:bg-white/[0.07] outline-none transition-colors"
    />
  )
}

function FieldLabel({ label, unit, children }: { label: string; unit?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-ios-gray1">{label}</span>
      <div className="flex items-center gap-1.5">
        {children}
        {unit && <span className="text-xs text-ios-gray2 shrink-0">{unit}</span>}
      </div>
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm rounded-2xl
      border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]
        flex items-center gap-2 bg-black/[0.02] dark:bg-white/[0.02]">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── TOU Rate Table ─────────────────────────────────────────────────────────────

function TouTable({ tou, onChange }: { tou: TouVoltage; onChange: (next: TouVoltage) => void }) {
  const set = (season: 'summer' | 'non_summer', key: keyof TouPeriod, v: number) =>
    onChange({ ...tou, [season]: { ...tou[season], [key]: v } })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-y-1.5">
        <thead>
          <tr className="text-xs text-ios-gray1">
            <th className="text-left pb-1 font-medium w-28" />
            <th className="pb-1 font-medium text-right pr-2">尖峰</th>
            <th className="pb-1 font-medium text-right pr-2">半尖峰</th>
            <th className="pb-1 font-medium text-right pr-2">離峰</th>
            <th className="pb-1 font-medium text-left pl-1 text-ios-gray2">元/kWh</th>
          </tr>
        </thead>
        <tbody>
          {(['summer', 'non_summer'] as const).map(season => {
            const isSummer = season === 'summer'
            return (
              <tr key={season} className={`rounded-xl ${isSummer ? 'bg-orange-500/[0.06]' : 'bg-sky-500/[0.06]'}`}>
                <td className="py-2.5 pl-3 rounded-l-xl">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
                    ${isSummer
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    }`}>
                    {isSummer ? '☀ 夏月' : '❄ 非夏月'}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right">
                  {!isSummer
                    ? <span className="text-xs text-ios-gray2 pr-1">— 無尖峰</span>
                    : <NumInput value={tou.summer.peak} onChange={v => set('summer', 'peak', v)} />
                  }
                </td>
                <td className="py-2.5 px-2 text-right">
                  <NumInput
                    value={tou[season].semi_peak}
                    onChange={v => set(season, 'semi_peak', v)}
                  />
                </td>
                <td className="py-2.5 px-2 text-right">
                  <NumInput
                    value={tou[season].off_peak}
                    onChange={v => set(season, 'off_peak', v)}
                  />
                </td>
                <td className="py-2.5 pr-3 rounded-r-xl" />
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-ios-gray2 mt-1 pl-1">
        ※ 台電非夏月無尖峰時段，系統自動將該時段計為半尖峰
      </p>
    </div>
  )
}

// ── Progressive Tier Table ─────────────────────────────────────────────────────

function TierTable({
  tiers,
  onChange,
}: {
  tiers: { summer: TierRow[]; non_summer: TierRow[] }
  onChange: (next: { summer: TierRow[]; non_summer: TierRow[] }) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ios-gray1 border-b border-black/[0.06] dark:border-white/[0.06]">
            <th className="text-left pb-2.5 font-medium">用電級距</th>
            <th className="text-right pb-2.5 font-medium pr-3">
              <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                ☀ 夏月
              </span>
            </th>
            <th className="text-right pb-2.5 font-medium pr-1">
              <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                ❄ 非夏月
              </span>
            </th>
            <th className="text-left pb-2.5 pl-2 font-medium text-ios-gray2">元/kWh</th>
          </tr>
        </thead>
        <tbody>
          {tiers.summer.map((tier, i) => {
            const prev = i === 0 ? 0 : (tiers.summer[i - 1].max_kwh ?? '∞')
            const rangeLabel = tier.max_kwh == null
              ? `${prev} kWh 以上`
              : `${prev} ~ ${tier.max_kwh} kWh`
            return (
              <tr key={i}
                className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0
                  hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <td className="py-2.5 text-xs text-ios-gray1 font-data">{rangeLabel}</td>
                <td className="py-2.5 pr-3 text-right">
                  <NumInput
                    value={tier.rate}
                    onChange={v => {
                      const next = [...tiers.summer]
                      next[i] = { ...next[i], rate: v }
                      onChange({ ...tiers, summer: next })
                    }}
                  />
                </td>
                <td className="py-2.5 pr-1 text-right">
                  <NumInput
                    value={tiers.non_summer[i]?.rate ?? 0}
                    onChange={v => {
                      const next = [...tiers.non_summer]
                      next[i] = { ...next[i], rate: v }
                      onChange({ ...tiers, non_summer: next })
                    }}
                  />
                </td>
                <td />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const { financial, setFinancial } = useSandboxStore()

  const [draft, setDraft]     = useState<TariffDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [voltageTab, setVoltageTab] = useState<'high' | 'low'>('high')

  useEffect(() => {
    getSettings()
      .then(data => { setDraft(data as TariffDraft); setError(null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!draft) return
    setSaving(true); setError(null); setSuccess(false)
    try {
      await updateSettings(draft)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const patch = <K extends keyof TariffDraft>(key: K, value: TariffDraft[K]) =>
    setDraft(d => d ? { ...d, [key]: value } : d)

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin-slow" />
    </div>
  )

  if (!draft) return (
    <div className="max-w-3xl mx-auto py-16 text-center space-y-3">
      <p className="text-4xl">⚡</p>
      <p className="font-semibold text-gray-700 dark:text-gray-300">無法載入費率資料</p>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">費率參數設定</h1>
          <p className="text-sm text-ios-gray1 mt-1">
            調整台電費率表，儲存後即時套用於所有模擬計算
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary shrink-0 flex items-center gap-2"
        >
          {saving && (
            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin-slow" />
          )}
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400
          rounded-xl text-sm border border-red-200 dark:border-red-500/20">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400
          rounded-xl text-sm border border-green-200 dark:border-green-500/20">
          ✓ 費率已更新，下次執行模擬將自動套用新費率
        </div>
      )}

      {/* ── 0. Financial ── */}
      <SectionCard title="財務參數" icon="💰">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <FieldLabel label="折現率 (WACC)" unit="%">
            <NumInput
              value={financial.discount_rate * 100}
              onChange={v => setFinancial({ ...financial, discount_rate: v / 100 })}
              step="0.5"
              width="w-24"
            />
          </FieldLabel>
          <FieldLabel label="財務分析年限" unit="年">
            <NumInput
              value={financial.project_years}
              onChange={v => setFinancial({ ...financial, project_years: Math.round(v) })}
              step="1"
              width="w-24"
            />
          </FieldLabel>
        </div>
        <p className="text-xs text-ios-gray2 mt-4">
          ※ 折現率與年限用於 NPV / IRR 試算；綠電 PPA 費率請在電費單上傳時各別設定
        </p>
      </SectionCard>

      {/* ── 1. TOU Rates ── */}
      <SectionCard title="時間電價費率" icon="⚡">
        {/* Voltage tab switcher */}
        <div className="flex gap-1 mb-5 bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-xl w-fit">
          {(['high', 'low'] as const).map(v => (
            <button
              key={v}
              onClick={() => setVoltageTab(v)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all
                ${voltageTab === v
                  ? 'bg-white dark:bg-white/[0.15] shadow-sm text-gray-900 dark:text-white'
                  : 'text-ios-gray1 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              {v === 'high' ? '高壓用電' : '低壓用電'}
            </button>
          ))}
        </div>

        <TouTable
          tou={draft.tou[voltageTab]}
          onChange={next => patch('tou', { ...draft.tou, [voltageTab]: next })}
        />
      </SectionCard>

      {/* ── 2. Demand Charges ── */}
      <SectionCard title="需量費率" icon="📊">
        <div className="grid grid-cols-2 gap-6">
          {(['high', 'low'] as const).map(v => (
            <FieldLabel key={v} label={v === 'high' ? '高壓需量費率（契約容量）' : '低壓需量費率（契約容量）'} unit="元/kW">
              <NumInput
                value={draft.demand_charges[v]}
                onChange={val => patch('demand_charges', { ...draft.demand_charges, [v]: val })}
                step="0.1"
                width="w-28"
              />
            </FieldLabel>
          ))}
        </div>
      </SectionCard>

      {/* ── 3. Penalties ── */}
      <SectionCard title="超約罰款與住商超量費率" icon="⚠️">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <FieldLabel label="超約 10% 以內罰款倍率" unit="倍">
            <NumInput
              value={draft.penalties.demand_within_10pct}
              onChange={v => patch('penalties', { ...draft.penalties, demand_within_10pct: v })}
              step="0.5"
              width="w-20"
            />
          </FieldLabel>
          <FieldLabel label="超約 10% 以上罰款倍率" unit="倍">
            <NumInput
              value={draft.penalties.demand_over_10pct}
              onChange={v => patch('penalties', { ...draft.penalties, demand_over_10pct: v })}
              step="0.5"
              width="w-20"
            />
          </FieldLabel>
          <FieldLabel label="住商超量門檻" unit="kWh／月">
            <NumInput
              value={draft.penalties.res_tou_excess_threshold}
              onChange={v => patch('penalties', { ...draft.penalties, res_tou_excess_threshold: v })}
              step="50"
              width="w-24"
            />
          </FieldLabel>
          <FieldLabel label="住商超量加收費率" unit="元/kWh">
            <NumInput
              value={draft.penalties.res_tou_excess_rate}
              onChange={v => patch('penalties', { ...draft.penalties, res_tou_excess_rate: v })}
              step="0.01"
              width="w-20"
            />
          </FieldLabel>
        </div>
        <p className="text-xs text-ios-gray2 mt-4">
          ※ 超約罰款倍率係以需量費率計算，台電標準為 2× / 3×
        </p>
      </SectionCard>

      {/* ── 4. Season Dates ── */}
      <SectionCard title="夏月起訖日期定義" icon="📅">
        <div className="space-y-4">
          {(['high', 'low'] as const).map(v => (
            <div key={v} className="flex items-center gap-4 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-10 text-center shrink-0
                ${v === 'high'
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                }`}>
                {v === 'high' ? '高壓' : '低壓'}
              </span>
              <div className="flex items-center gap-2">
                <div className="text-xs text-ios-gray1">起始</div>
                <DateInput
                  value={draft.seasons[v].summer_start}
                  onChange={val => patch('seasons', {
                    ...draft.seasons,
                    [v]: { ...draft.seasons[v], summer_start: val },
                  })}
                />
              </div>
              <span className="text-ios-gray2 text-sm">→</span>
              <div className="flex items-center gap-2">
                <div className="text-xs text-ios-gray1">結束</div>
                <DateInput
                  value={draft.seasons[v].summer_end}
                  onChange={val => patch('seasons', {
                    ...draft.seasons,
                    [v]: { ...draft.seasons[v], summer_end: val },
                  })}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ios-gray2 mt-4">
          ※ 格式 MM-DD，台電高壓：05-16 ~ 10-15；低壓：06-01 ~ 09-30
        </p>
      </SectionCard>

      {/* ── 5. Progressive Tiers ── */}
      <SectionCard title="累進費率（住宅用電）" icon="📈">
        <TierTable
          tiers={draft.progressive}
          onChange={next => patch('progressive', next)}
        />
      </SectionCard>

    </div>
  )
}
