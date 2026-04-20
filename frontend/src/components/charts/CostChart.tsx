import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { MonthlyRow } from '@/types'

interface Props { monthly: MonthlyRow[] }

const tooltipStyle = {
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
}

export default function CostChart({ monthly }: Props) {
  const data = monthly.map((m) => ({
    month: m.month.slice(5),
    基準電費: Math.round(m.baseline_cost),
    模擬後電費: Math.round(m.scenario_cost),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 15, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }}
          axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
        <YAxis tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }}
          tickFormatter={(v) => `${(v / 1e3).toFixed(0)}K`} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`NT$ ${v.toLocaleString()}`]} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace', color: '#8E8E93' }} />
        <Bar dataKey="基準電費" fill="rgba(0,122,255,0.55)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="模擬後電費" fill="rgba(52,199,89,0.65)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
