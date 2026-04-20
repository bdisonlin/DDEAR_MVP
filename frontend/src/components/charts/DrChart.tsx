import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { DRSettlement } from '@/types'
import { fmtNtd } from '@/utils/formatters'

interface Props { result: DRSettlement }

const tooltipStyle = {
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
}

export default function DrChart({ result }: Props) {
  const data = result.monthly.map((m) => ({
    month: m.month.slice(5),
    流動電費: Math.round(m.flow_revenue),
    基本費扣減: Math.round(m.basic_fee_discount),
    罰款: Math.round(-m.penalty),
    淨收益: Math.round(m.net_revenue),
    執行率: Math.round(m.execution_rate * 100),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#8E8E93', fontSize: 10 }} axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
        <YAxis yAxisId="ntd" tick={{ fill: '#8E8E93', fontSize: 10 }}
          tickFormatter={(v) => `${(v / 1e3).toFixed(0)}K`} axisLine={false} tickLine={false} />
        <YAxis yAxisId="pct" orientation="right" tick={{ fill: '#8E8E93', fontSize: 10 }}
          tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} domain={[0, 150]} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v: number, name: string) =>
            name === '執行率' ? [`${v}%`, name] : [fmtNtd(v), name]
          } />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8E8E93' }} />
        <ReferenceLine yAxisId="ntd" y={0} stroke="rgba(0,0,0,0.10)" />
        <Bar yAxisId="ntd" dataKey="流動電費" stackId="a" fill="rgba(0,122,255,0.55)" radius={[0,0,0,0]} />
        <Bar yAxisId="ntd" dataKey="基本費扣減" stackId="a" fill="rgba(52,199,89,0.55)" radius={[0,0,0,0]} />
        <Bar yAxisId="ntd" dataKey="罰款" stackId="a" fill="rgba(255,59,48,0.55)" radius={[0,0,0,0]} />
        <Line yAxisId="pct" type="monotone" dataKey="執行率" stroke="#FF9500" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
