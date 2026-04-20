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
      <div className="relative z-10 flex items-start justify-between mb-2">
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: accent }}>
          {title}
        </span>
        {icon && (
          <span className="text-lg w-8 h-8 flex items-center justify-center rounded-ios-sm"
            style={{ background: bg, border: `1px solid ${border}` }}>
            {icon}
          </span>
        )}
      </div>

      <div className="relative z-10">
        <p className="text-2xl font-bold font-data tracking-tight text-gray-900 dark:text-white">
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-1 font-data font-medium" style={{ color: subColor }}>{sub}</p>
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
    <div className="space-y-3 animate-fade-up">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="年度節省"
          value={fmtNtd(kpis.annual_savings)}
          sub={`↓ ${fmtPct(kpis.savings_pct)}`}
          accent="#34C759"
          bg="rgba(52,199,89,0.08)"
          border="rgba(52,199,89,0.18)"
          icon="💰"
          positive={kpis.annual_savings > 0}
        />
        <KpiCard
          title="再生能源比例"
          value={fmtPct(kpis.re_ratio)}
          sub={`RE ${fmtKwh(kpis.re_kwh)}`}
          accent="#007AFF"
          bg="rgba(0,122,255,0.07)"
          border="rgba(0,122,255,0.15)"
          icon="♻️"
          positive={kpis.re_ratio > 0}
        />
        <KpiCard
          title="年減碳量"
          value={`${kpis.carbon_reduction_tons.toFixed(1)} t`}
          sub={`CO₂e ↓ ${fmtPct(kpis.carbon_reduction_pct)}`}
          accent="#AF52DE"
          bg="rgba(175,82,222,0.08)"
          border="rgba(175,82,222,0.18)"
          icon="🌿"
          positive={kpis.carbon_reduction_tons > 0}
        />
        <KpiCard
          title="總投資 CAPEX"
          value={fmtNtd(kpis.total_capex)}
          sub={`O&M ${fmtNtd(kpis.total_annual_om)} / yr`}
          accent="#FF9500"
          bg="rgba(255,149,0,0.08)"
          border="rgba(255,149,0,0.18)"
          icon="🏗️"
        />
        <KpiCard
          title="回本 / NPV"
          value={roi.payback_years != null ? `${roi.payback_years.toFixed(1)} 年` : '—'}
          sub={`NPV ${fmtNtd(roi.npv)}`}
          accent="#5856D6"
          bg="rgba(88,86,214,0.08)"
          border="rgba(88,86,214,0.18)"
          icon="📈"
          positive={roi.npv > 0}
        />
      </div>

      {/* Penalty / arbitrage alerts */}
      {(hasPenalty || hasExcess || hasSpread) && (
        <div className="flex flex-wrap gap-2">
          {hasPenalty && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm text-xs font-medium
              bg-red-500/10 border border-red-500/20 text-red-500">
              ⚠ 超約罰款 {fmtNtd(kpis.demand_penalty_annual_ntd)} / 年
            </div>
          )}
          {hasExcess && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm text-xs font-medium
              bg-orange-500/10 border border-orange-500/20 text-orange-400">
              ⚠ 住商超量加收 {fmtNtd(kpis.res_tou_excess_annual_ntd)} / 年
            </div>
          )}
          {hasSpread && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-sm text-xs font-medium
              bg-ios-blue/10 border border-ios-blue/20 text-ios-blue">
              ⚡ 儲能尖離峰價差 {kpis.storage_price_spread_ntd_per_kwh.toFixed(2)} 元/度
            </div>
          )}
        </div>
      )}
    </div>
  )
}
