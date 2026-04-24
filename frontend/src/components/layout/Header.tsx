import { useSandboxStore } from '@/store/useSandboxStore'
import { useThemeContext } from '@/context/ThemeContext'
import { fmtNtd } from '@/utils/formatters'
import { Link } from 'react-router-dom'

interface HeaderProps {
  onMenuClick?: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const baseline     = useSandboxStore((s) => s.baseline)
  const simResult    = useSandboxStore((s) => s.simResult)
  const assets       = useSandboxStore((s) => s.assets)
  const isSimulating = useSandboxStore((s) => s.isSimulating)
  const { theme, toggle } = useThemeContext()

  return (
    <header className="glass-header shrink-0 flex items-center justify-between px-3 md:px-5 py-3 border-b border-black/[0.07] dark:border-white/[0.07] z-20">

      {/* ── Left: Logo ── */}
      <div className="flex items-center gap-2.5">
        {/* Hamburger – mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-[8px] text-gray-500 dark:text-gray-400 hover:bg-black/6 dark:hover:bg-white/10 transition-colors"
          aria-label="開啟選單"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3"  width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>

        {/* Logo icon */}
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(145deg, #1a8aff, #5856D6)',
            boxShadow: '0 2px 8px rgba(0,122,255,0.30), inset 0 1px 0 rgba(255,255,255,0.22)',
          }}
        >
          <span className="text-white" style={{ fontSize: 15 }}>⚡</span>
        </div>

        <div className="leading-tight">
          <div className="font-bold text-gray-900 dark:text-white tracking-tight" style={{ fontSize: 15 }}>
            DDEAR
          </div>
          <div className="text-gray-400 dark:text-gray-500" style={{ fontSize: 10.5, letterSpacing: '0.03em' }}>
            能源數位孿生沙盒
          </div>
        </div>
      </div>

      {/* ── Right: Status pills + controls ── */}
      <div className="flex items-center gap-1.5 md:gap-2">

        {/* Simulating indicator */}
        {isSimulating && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-semibold"
            style={{
              fontSize: 11.5,
              background: 'rgba(0,122,255,0.09)',
              color: '#007AFF',
              border: '1px solid rgba(0,122,255,0.20)',
            }}
          >
            <div className="w-2.5 h-2.5 border-[1.8px] border-current border-t-transparent rounded-full animate-spin-slow" />
            模擬中
          </div>
        )}

        {/* Baseline cost pill */}
        {baseline && !isSimulating && (
          <div
            className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-full"
            style={{
              fontSize: 11.5,
              background: 'rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            <div className="dot-live" style={{ width: 6, height: 6 }} />
            <span className="text-gray-500 dark:text-gray-400">基準</span>
            <span className="font-semibold font-data text-gray-800 dark:text-gray-200">
              {fmtNtd(baseline.annual_cost_ntd)}<span className="text-gray-400"> / 年</span>
            </span>
          </div>
        )}

        {/* Asset count pill */}
        {baseline && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{
              fontSize: 11.5,
              background: 'rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.07)',
              color: '#6b7280',
            }}
          >
            資產
            <span className="font-bold text-ios-blue">{assets.length}</span>
            項
          </div>
        )}

        {/* Savings pill */}
        {simResult && (
          <div
            className="px-2.5 py-1.5 rounded-full font-semibold font-data"
            style={{
              fontSize: 11.5,
              ...(simResult.kpis.annual_savings > 0
                ? { background: 'rgba(52,199,89,0.10)', color: '#34C759', border: '1px solid rgba(52,199,89,0.22)' }
                : { background: 'rgba(255,59,48,0.09)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.20)' }
              )
            }}
          >
            節省 {fmtNtd(simResult.kpis.annual_savings)}
          </div>
        )}

        {/* Strategy link */}
        <Link
          to="/strategy"
          title="能源策略規劃"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-semibold transition-all duration-200 hover:opacity-80"
          style={{
            fontSize: 11.5,
            background: 'rgba(99,102,241,0.10)',
            color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.22)',
          }}
        >
          ⚡ 策略規劃
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.07)',
            fontSize: 14,
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Settings link */}
        <Link
          to="/settings"
          title="系統設定"
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.07)',
            fontSize: 14,
          }}
        >
          ⚙️
        </Link>
      </div>
    </header>
  )
}
