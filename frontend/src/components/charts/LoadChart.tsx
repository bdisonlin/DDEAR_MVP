import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { LoadChartPoint } from '@/types'

interface Props { data: LoadChartPoint[] }

const tooltipStyle = {
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
}

export default function LoadChart({ data }: Props) {
  const sampled = data.filter((_, i) => i % 4 === 0)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={sampled} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(0,0,0,0.05)" />
        <XAxis dataKey="ts" tickFormatter={(v) => v.slice(11, 16)}
          tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }}
          interval={Math.floor(sampled.length / 12)}
          axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
        <YAxis tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'ui-monospace' }} unit=" kW"
          axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle}
          labelStyle={{ color: '#6b7280', fontSize: 11 }}
          formatter={(v: number) => [`${v.toFixed(0)} kW`]} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace', color: '#8E8E93' }} />
        <Line type="monotone" dataKey="baseline_kw" name="基準負載"
          stroke="#007AFF" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="scenario_kw" name="模擬後淨負載"
          stroke="#FF9500" dot={false} strokeWidth={2} strokeDasharray="6 3" />
        <Line type="monotone" dataKey="re_gen_kw" name="綠能發電量"
          stroke="#34C759" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  )
}
