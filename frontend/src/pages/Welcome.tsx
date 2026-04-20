import { useSandboxStore } from '@/store/useSandboxStore'
import { useTilt } from '@/hooks/useTilt'

const ASSET_ICONS: Record<string, string> = {
  solar_self: '☀️', solar_purchase: '☀️', wind: '💨', hydro: '💧',
  hvac: '❄️', storage: '🔋', ev: '⚡',
}
const ASSET_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  solar_self:     { bg: 'rgba(255,149,0,0.10)',  text: '#FF9500', border: 'rgba(255,149,0,0.20)'  },
  solar_purchase: { bg: 'rgba(255,149,0,0.10)',  text: '#FF9500', border: 'rgba(255,149,0,0.20)'  },
  wind:           { bg: 'rgba(90,200,250,0.12)', text: '#5AC8FA', border: 'rgba(90,200,250,0.25)' },
  hydro:          { bg: 'rgba(0,122,255,0.10)',  text: '#007AFF', border: 'rgba(0,122,255,0.20)'  },
  hvac:           { bg: 'rgba(175,82,222,0.10)', text: '#AF52DE', border: 'rgba(175,82,222,0.20)' },
  storage:        { bg: 'rgba(52,199,89,0.10)',  text: '#34C759', border: 'rgba(52,199,89,0.20)'  },
  ev:             { bg: 'rgba(88,86,214,0.10)',  text: '#5856D6', border: 'rgba(88,86,214,0.20)'  },
}

function AssetTypeCard({ type, label }: { type: string; label: string }) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(6)
  const c = ASSET_COLORS[type] ?? { bg: 'rgba(0,122,255,0.08)', text: '#007AFF', border: 'rgba(0,122,255,0.15)' }

  return (
    <div ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
      className="card-3d text-center py-5 cursor-default"
      style={{ background: c.bg, borderColor: c.border }}>
      <span className="text-2xl block mb-2">{ASSET_ICONS[type] ?? '🏭'}</span>
      <div className="text-xs font-semibold tracking-wide" style={{ color: c.text }}>
        {label.replace(/^.\s/, '')}
      </div>
    </div>
  )
}

export default function Welcome() {
  const assetTypes = useSandboxStore((s) => s.assetTypes)

  return (
    <div className="max-w-2xl mx-auto text-center py-16 space-y-10 animate-fade-up">

      {/* Hero */}
      <div className="space-y-3">
        <div className="relative inline-block">
          <div className="w-20 h-20 mx-auto rounded-ios-xl flex items-center justify-center shadow-glass-lg mb-4"
            style={{ background: 'linear-gradient(145deg, #007AFF, #5856D6)' }}>
            <span className="text-4xl">⚡</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-gradient-blue">DDEAR</h1>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-300 font-light tracking-wide">能源數位孿生沙盒</p>
        <p className="text-xs text-ios-gray2 tracking-widest uppercase font-data">
          Dynamic Digital Energy Asset ROI
        </p>
      </div>

      {/* Steps */}
      <div className="card text-left space-y-4">
        <p className="section-title">快速開始</p>
        {[
          { n: '01', text: '在左側載入示範資料，或上傳 15 分鐘間隔用電 CSV', color: '#007AFF' },
          { n: '02', text: '點擊「+ 新增」加入太陽能、儲能、風力等能源資產', color: '#34C759' },
          { n: '03', text: '即時 Digital Twin 模擬：成本節省、RE%、碳排、ROI', color: '#5856D6' },
        ].map(({ n, text, color }) => (
          <div key={n} className="flex items-start gap-4 group">
            <span className="font-data text-sm font-bold shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-ios-sm"
              style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}>
              {n}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pt-1">{text}</span>
          </div>
        ))}
      </div>

      {/* Asset type grid */}
      {assetTypes.length > 0 && (
        <div>
          <p className="section-title">支援資產類型</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {assetTypes.map((t) => (
              <AssetTypeCard key={t.type} type={t.type} label={t.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
