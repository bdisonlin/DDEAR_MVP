import { useSandboxStore } from '@/store/useSandboxStore'
import { useThemeContext } from '@/context/ThemeContext'
import { fmtNtd } from '@/utils/formatters'

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
    <header className="glass-header shrink-0 flex items-center justify-between px-3 md:px-6 py-3.5 border-b border-black/8 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="開啟選單"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-ios"
          style={{ background: 'linear-gradient(145deg, #007AFF, #5856D6)' }}>
          <span className="text-white text-sm font-bold">⚡</span>
        </div>
        <div>
          <span className="text-base font-bold text-gray-900 dark:text-white tracking-tight">DDEAR</span>
          <span className="text-xs text-ios-gray1 ml-2">能源數位孿生沙盒</span>
        </div>
      </div>

      {/* Status pills + theme toggle */}
      <div className="flex items-center gap-2 md:gap-3">
        {isSimulating && (
          <div className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: 'rgba(0,122,255,0.10)', color: '#007AFF' }}>
            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin-slow" />
            模擬中
          </div>
        )}

        {baseline && !isSimulating && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 md:px-3 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10">
            <div className="dot-live" />
            <span className="text-gray-600 dark:text-gray-300">基準</span>
            <span className="font-semibold text-gray-800 dark:text-white">{fmtNtd(baseline.annual_cost_ntd)} / 年</span>
          </div>
        )}

        {baseline && (
          <div className="hidden md:block px-2.5 md:px-3 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200">
            資產 <span className="font-bold text-ios-blue">{assets.length}</span> 項
          </div>
        )}

        {simResult && (
          <div className="px-2.5 md:px-3 py-1.5 rounded-full text-xs font-semibold"
            style={simResult.kpis.annual_savings > 0
              ? { background: 'rgba(52,199,89,0.12)', color: '#34C759' }
              : { background: 'rgba(255,59,48,0.10)', color: '#FF3B30' }}>
            節省 {fmtNtd(simResult.kpis.annual_savings)}
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-gray-600 dark:text-gray-300"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  )
}
