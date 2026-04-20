import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import type { RoiResult } from '@/types'
import { fmtNtd } from '@/utils/formatters'

interface Props { roi: RoiResult }

const tooltipStyle = {
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
}

export default function RoiChart({ roi }: Props) {
  const data = roi.cash_flows.map((cf, i) => ({
    year: i,
    年度現金流: Math.round(cf),
    累積現金流: Math.round(roi.cumulative_cash_flows[i] ?? 0),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis dataKey="year" tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }}
          label={{ value: 'yr', position: 'right', fill: '#8E8E93', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
        <YAxis tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }}
          tickFormatter={(v) => fmtNtd(v)} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtNtd(v)]} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace', color: '#8E8E93' }} />
        <ReferenceLine y={0} stroke="rgba(0,0,0,0.10)" />
        {roi.payback_years != null && roi.payback_years <= roi.cash_flows.length && (
          <ReferenceLine x={Math.round(roi.payback_years)} stroke="#FF9500" strokeDasharray="4 2"
            label={{ value: `回本 ${roi.payback_years.toFixed(1)}yr`, fill: '#FF9500', fontSize: 10 }} />
        )}
        <Bar dataKey="年度現金流" fill="rgba(0,122,255,0.45)" radius={[3, 3, 0, 0]} />
        <Line type="monotone" dataKey="累積現金流" stroke="#FF9500" dot={false} strokeWidth={2.5} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
