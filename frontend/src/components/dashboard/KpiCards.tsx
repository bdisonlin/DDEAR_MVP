import { useTilt } from '@/hooks/useTilt'
import type { KpiResult, RoiResult } from '@/types'
import { fmtNtd, fmtPct, fmtKwh } from '@/utils/formatters'

interface Props { kpis: KpiResult; roi: RoiResult }

interface CardProps {
  title: string
  value: string
  sub?: string
  accent: string
  bg: string
  border: string
  icon?: string
  positive?: boolean
}

function KpiCard({ title, value, sub, accent, bg, border, icon, positive }: CardProps) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(4)

  const subColor = positive == null ? '#8E8E93'
    : positive ? '#34C759' : '#FF3B30'

  return (
    <div
      ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
      className="kpi-card"
      style={{ background: bg, borderColor: border }}
    >
      {/* Header row */}
      <div className="relative z-10 flex items-center justify-between mb-2.5">
        <span className="font-bold uppercase" style={{ fontSize: 10, letterSpacing: '0.09em', color: accent }}>
          {title}
        </span>
        {icon && (
          <span
            className="w-8 h-8 flex items-center justify-center rounded-[9px] text-base shrink-0"
            style={{
              background: `${accent}18`,
              border: `1px solid ${accent}28`,
              boxShadow: `0 1px 4px ${accent}18`,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="relative z-10">
        <p
          className="font-bold font-data tracking-tight leading-none text-gray-900 dark:text-white"
          style={{ fontSize: 26 }}
        >
          {value}
        </p>
        {sub && (
          <p
            className="mt-1.5 font-data font-semibold"
            style={{ fontSize: 11.5, color: subColor }}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

export default function KpiCards({ kpis, roi }: Props) {
  const hasPenalty = kpis.demand_penalty_annual_ntd > 0
  const hasExcess  = kpis.res_tou_excess_annual_ntd  > 0
  const hasSpread  = kpis.storage_price_spread_ntd_per_kwh > 0

  return (
    <div className="space-y-2.5 animate-fade-up">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="年度節省"
          value={fmtNtd(kpis.annual_savings)}
          sub={`↓ ${fmtPct(kpis.savings_pct)}`}
          accent="#34C759"
          bg="rgba(52,199,89,0.07)"
          border="rgba(52,199,89,0.16)"
          icon="💰"
          positive={kpis.annual_savings > 0}
        />
        <KpiCard
          title="再生能源比例"
          value={fmtPct(kpis.re_ratio)}
          sub={`RE ${fmtKwh(kpis.re_kwh)}`}
          accent="#007AFF"
          bg="rgba(0,122,255,0.06)"
          border="rgba(0,122,255,0.14)"
          icon="♻️"
          positive={kpis.re_ratio > 0}
        />
        <KpiCard
          title="年減碳量"
          value={`${kpis.carbon_reduction_tons.toFixed(1)} t`}
          sub={`CO₂e ↓ ${fmtPct(kpis.carbon_reduction_pct)}`}
          accent="#AF52DE"
          bg="rgba(175,82,222,0.07)"
          border="rgba(175,82,222,0.16)"
          icon="🌿"
          positive={kpis.carbon_reduction_tons > 0}
        />
        <KpiCard
          title="總投資 CAPEX"
          value={fmtNtd(kpis.total_capex)}
          sub={`O&M ${fmtNtd(kpis.total_annual_om)} / yr`}
          accent="#FF9500"
          bg="rgba(255,149,0,0.07)"
          border="rgba(255,149,0,0.16)"
          icon="🏗️"
        />
        <KpiCard
          title="回本 / NPV"
          value={roi.payback_years != null ? `${roi.payback_years.toFixed(1)} 年` : '—'}
          sub={`NPV ${fmtNtd(roi.npv)}`}
          accent="#5856D6"
          bg="rgba(88,86,214,0.07)"
          border="rgba(88,86,214,0.16)"
          icon="📈"
          positive={roi.npv > 0}
        />
      </div>

      {/* Alert badges */}
      {(hasPenalty || hasExcess || hasSpread) && (
        <div className="flex flex-wrap gap-2">
          {hasPenalty && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm font-medium"
              style={{
                fontSize: 12,
                background: 'rgba(255,59,48,0.08)',
                border: '1px solid rgba(255,59,48,0.18)',
                color: '#FF3B30',
              }}
            >
              ⚠ 超約罰款 {fmtNtd(kpis.demand_penalty_annual_ntd)} / 年
            </div>
          )}
          {hasExcess && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm font-medium"
              style={{
                fontSize: 12,
                background: 'rgba(255,149,0,0.08)',
                border: '1px solid rgba(255,149,0,0.18)',
                color: '#FF9500',
              }}
            >
              ⚠ 住商超量加收 {fmtNtd(kpis.res_tou_excess_annual_ntd)} / 年
            </div>
          )}
          {hasSpread && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm font-medium"
              style={{
                fontSize: 12,
                background: 'rgba(0,122,255,0.08)',
                border: '1px solid rgba(0,122,255,0.18)',
                color: '#007AFF',
              }}
            >
              ⚡ 儲能尖離峰價差 {kpis.storage_price_spread_ntd_per_kwh.toFixed(2)} 元/度
            </div>
          )}
        </div>
      )}
    </div>
  )
}
