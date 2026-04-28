import { useSandboxStore } from '@/store/useSandboxStore'
import { useThemeContext } from '@/context/ThemeContext'
import { fmtNtd } from '@/utils/formatters'
import { Link, useLocation } from 'react-router-dom'

interface HeaderProps {
  onMenuClick?: () => void
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.05 1.05M10.05 10.05l1.05 1.05M2.9 11.1l1.05-1.05M10.05 3.95l1.05-1.05"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 8.5A5 5 0 015.5 2.5a5 5 0 000 9 5 5 0 006-3z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Header({ onMenuClick }: HeaderProps) {
  const baseline     = useSandboxStore((s) => s.baseline)
  const simResult    = useSandboxStore((s) => s.simResult)
  const assets       = useSandboxStore((s) => s.assets)
  const isSimulating = useSandboxStore((s) => s.isSimulating)
  const { theme, toggle } = useThemeContext()
  const location = useLocation()

  return (
    <header className="glass-header shrink-0 flex items-center justify-between px-3 md:px-5 py-2.5 z-20"
      style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>

      {/* ── Left: Logo + hamburger ── */}
      <div className="flex items-center gap-2.5">
        {/* Hamburger – mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-[9px] text-gray-500 dark:text-gray-400 transition-all active:scale-90"
          style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.07)' }}
          aria-label="開啟選單"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 4h11M2 7.5h11M2 11h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 relative"
            style={{
              background: 'linear-gradient(145deg, #1a8aff, #5856D6)',
              boxShadow: '0 2px 10px rgba(0,122,255,0.32), inset 0 1px 0 rgba(255,255,255,0.28)',
            }}
          >
            <span className="text-white" style={{ fontSize: 15 }}>⚡</span>
          </div>
          <div className="leading-tight">
            <div className="font-bold text-gray-900 dark:text-white tracking-tight" style={{ fontSize: 15 }}>
              DDEAR
            </div>
            <div className="text-gray-400 dark:text-gray-500" style={{ fontSize: 10, letterSpacing: '0.03em' }}>
              能源數位孿生沙盒
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Status + controls ── */}
      <div className="flex items-center gap-1.5 md:gap-2">

        {/* Simulating indicator */}
        {isSimulating && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-semibold animate-pulse-soft"
            style={{
              fontSize: 11.5,
              background: 'rgba(0,122,255,0.09)',
              color: '#007AFF',
              border: '1px solid rgba(0,122,255,0.20)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 0 12px rgba(0,122,255,0.15)',
            }}
          >
            <div className="w-2.5 h-2.5 border-[1.8px] border-current border-t-transparent rounded-full animate-spin-slow" />
            <span className="hidden sm:inline">模擬中</span>
          </div>
        )}

        {/* Baseline cost pill */}
        {baseline && !isSimulating && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{
              fontSize: 11.5,
              background: 'rgba(255,255,255,0.55)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
            }}
          >
            <span className="dot-live" style={{ width: 6, height: 6 }} />
            <span className="text-gray-500 dark:text-gray-400">基準</span>
            <span className="font-semibold font-data text-gray-800 dark:text-gray-200">
              {fmtNtd(baseline.annual_cost_ntd)}<span className="text-gray-400 dark:text-gray-500"> / 年</span>
            </span>
          </div>
        )}

        {/* Asset count badge */}
        {baseline && assets.length > 0 && (
          <div
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-full"
            style={{
              fontSize: 11.5,
              background: 'rgba(255,255,255,0.50)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.80)',
              color: '#6b7280',
            }}
          >
            資產
            <span
              className="font-bold rounded-full px-1.5 py-0.5"
              style={{
                fontSize: 10.5, color: '#007AFF',
                background: 'rgba(0,122,255,0.10)',
              }}
            >
              {assets.length}
            </span>
          </div>
        )}

        {/* Savings pill */}
        {simResult && (
          <div
            className="px-2.5 py-1.5 rounded-full font-semibold font-data"
            style={{
              fontSize: 11.5,
              ...(simResult.kpis.annual_savings > 0
                ? {
                    background: 'rgba(52,199,89,0.10)',
                    color: '#34C759',
                    border: '1px solid rgba(52,199,89,0.22)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 0 10px rgba(52,199,89,0.12)',
                  }
                : {
                    background: 'rgba(255,59,48,0.09)',
                    color: '#FF3B30',
                    border: '1px solid rgba(255,59,48,0.20)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                  }
              )
            }}
          >
            節省 {fmtNtd(simResult.kpis.annual_savings)}
          </div>
        )}

        {/* Strategy nav pill */}
        <Link
          to="/strategy"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-semibold transition-all duration-200 hover:opacity-85 active:scale-95"
          style={{
            fontSize: 11.5,
            background: location.pathname === '/strategy'
              ? 'rgba(88,86,214,0.14)'
              : 'rgba(255,255,255,0.45)',
            color: '#5856D6',
            border: '1px solid rgba(88,86,214,0.22)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
            backdropFilter: 'blur(12px)',
          }}
        >
          ⚡ 策略規劃
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-90"
          style={{
            background: 'rgba(255,255,255,0.50)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
            color: theme === 'dark' ? '#FFCC00' : '#5856D6',
          }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Settings link */}
        <Link
          to="/settings"
          title="系統設定"
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-90"
          style={{
            background: location.pathname === '/settings'
              ? 'rgba(0,122,255,0.12)'
              : 'rgba(255,255,255,0.50)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
            fontSize: 14,
          }}
        >
          ⚙️
        </Link>
      </div>
    </header>
  )
}
