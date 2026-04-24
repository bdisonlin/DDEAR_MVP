import { useSandboxStore } from '@/store/useSandboxStore'
import { useTilt } from '@/hooks/useTilt'

const ASSET_ICONS: Record<string, string> = {
  solar_self: '☀️', solar_purchase: '☀️', wind: '💨', hydro: '💧',
  hvac: '❄️', storage: '🔋', ev: '⚡',
}
const ASSET_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  solar_self:     { bg: 'rgba(255,149,0,0.08)',  text: '#FF9500', border: 'rgba(255,149,0,0.18)'  },
  solar_purchase: { bg: 'rgba(255,149,0,0.08)',  text: '#FF9500', border: 'rgba(255,149,0,0.18)'  },
  wind:           { bg: 'rgba(90,200,250,0.10)', text: '#5AC8FA', border: 'rgba(90,200,250,0.22)' },
  hydro:          { bg: 'rgba(0,122,255,0.08)',  text: '#007AFF', border: 'rgba(0,122,255,0.18)'  },
  hvac:           { bg: 'rgba(175,82,222,0.08)', text: '#AF52DE', border: 'rgba(175,82,222,0.18)' },
  storage:        { bg: 'rgba(52,199,89,0.08)',  text: '#34C759', border: 'rgba(52,199,89,0.18)'  },
  ev:             { bg: 'rgba(88,86,214,0.08)',  text: '#5856D6', border: 'rgba(88,86,214,0.18)'  },
}

function AssetTypeCard({ type, label }: { type: string; label: string }) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(6)
  const c = ASSET_COLORS[type] ?? { bg: 'rgba(0,122,255,0.07)', text: '#007AFF', border: 'rgba(0,122,255,0.14)' }

  return (
    <div
      ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
      className="card-3d text-center py-5 cursor-default"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <span style={{ fontSize: 26 }} className="block mb-2">{ASSET_ICONS[type] ?? '🏭'}</span>
      <div className="font-semibold" style={{ fontSize: 12, color: c.text }}>
        {label.replace(/^.\s/, '')}
      </div>
    </div>
  )
}

const STEPS = [
  {
    n: '01',
    text: '在左側載入示範資料，或上傳 15 分鐘間隔用電 CSV',
    color: '#007AFF',
    icon: '📊',
  },
  {
    n: '02',
    text: '點擊「+ 新增」加入太陽能、儲能、風力等能源資產',
    color: '#34C759',
    icon: '⚡',
  },
  {
    n: '03',
    text: '即時 Digital Twin 模擬：成本節省、RE%、碳排、ROI',
    color: '#5856D6',
    icon: '🎯',
  },
]

export default function Welcome() {
  const assetTypes = useSandboxStore((s) => s.assetTypes)

  return (
    <div className="max-w-2xl mx-auto text-center py-14 space-y-10 animate-fade-up px-4">

      {/* ── Hero ── */}
      <div className="space-y-4">
        {/* Icon + gradient ring */}
        <div className="relative inline-flex flex-col items-center">
          <div
            className="w-20 h-20 mx-auto rounded-[22px] flex items-center justify-center mb-5"
            style={{
              background: 'linear-gradient(145deg, #1a8aff, #5856D6)',
              boxShadow: '0 8px 32px rgba(0,122,255,0.35), 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <span style={{ fontSize: 38 }}>⚡</span>
          </div>

          {/* Subtle glow ring */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full -z-10 blur-2xl opacity-30"
            style={{ background: 'radial-gradient(circle, #007AFF, transparent)' }}
          />

          <h1 className="text-gradient-blue font-bold tracking-tight" style={{ fontSize: 52 }}>
            DDEAR
          </h1>
          <p className="text-gray-600 dark:text-gray-300 font-light mt-1.5" style={{ fontSize: 17 }}>
            能源數位孿生沙盒
          </p>
          <p className="font-data text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-[0.12em]" style={{ fontSize: 10.5 }}>
            Dynamic Digital Energy Asset ROI
          </p>
        </div>
      </div>

      {/* ── Quick Start Steps ── */}
      <div className="card text-left">
        <p className="section-title mb-4">快速開始</p>
        <div className="space-y-3">
          {STEPS.map(({ n, text, color, icon }) => (
            <div key={n} className="flex items-start gap-4 group">
              {/* Step badge */}
              <div
                className="w-9 h-9 rounded-[10px] flex flex-col items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                style={{
                  background: `${color}12`,
                  border: `1px solid ${color}24`,
                  boxShadow: `0 2px 8px ${color}18`,
                }}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>
              </div>

              <div className="pt-1 flex-1">
                <div className="font-bold mb-0.5" style={{ fontSize: 10, color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  步驟 {n}
                </div>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed" style={{ fontSize: 13.5 }}>
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature highlights ── */}
      <div className="grid grid-cols-3 gap-3 text-left">
        {[
          { icon: '💰', label: '電費節省', desc: '準確計算 TOU 費率差額', color: '#34C759' },
          { icon: '🌿', label: '碳排分析', desc: '台電排放係數即時換算', color: '#AF52DE' },
          { icon: '📈', label: 'ROI 試算', desc: 'NPV / IRR 20 年回收', color: '#5856D6' },
        ].map(({ icon, label, desc, color }) => (
          <div
            key={label}
            className="card py-4 px-3.5 text-center"
            style={{ background: `${color}07`, borderColor: `${color}16` }}
          >
            <span style={{ fontSize: 24 }} className="block mb-2">{icon}</span>
            <div className="font-bold text-gray-800 dark:text-gray-200 mb-1" style={{ fontSize: 13 }}>{label}</div>
            <div className="text-gray-400 dark:text-gray-500 leading-snug" style={{ fontSize: 11.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* ── Asset type grid ── */}
      {assetTypes.length > 0 && (
        <div>
          <p className="section-title mb-3">支援資產類型</p>
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
