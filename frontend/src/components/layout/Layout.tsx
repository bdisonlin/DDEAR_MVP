import { useState, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

const MIN_W = 200
const MAX_W = 520
const DEFAULT_W = 292

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_W)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startW = useRef(DEFAULT_W)

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startX.current = e.clientX
    startW.current = sidebarWidth
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, startW.current + ev.clientX - startX.current))
      setSidebarWidth(w)
    }
    const onUp = () => {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop — liquid blur overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden transition-opacity duration-300"
          style={{
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40
          transition-transform duration-300 ease-[cubic-bezier(0.34,1.20,0.64,1)]
          md:relative md:translate-x-0 md:flex md:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ width: sidebarWidth }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />

        {/* Drag handle — desktop only */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 h-full w-3 cursor-col-resize group hidden md:flex items-center justify-center z-50"
        >
          {/* Visible drag pill */}
          <div
            className="h-12 w-[3px] rounded-full transition-all duration-200"
            style={{
              background: isDragging
                ? 'rgba(0,122,255,0.65)'
                : 'transparent',
              boxShadow: isDragging
                ? '0 0 8px rgba(0,122,255,0.40)'
                : 'none',
            }}
          />
          {/* Hover state */}
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-full"
            style={{ background: 'rgba(0,122,255,0.38)' }}
          />
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 md:p-5">{children}</main>
      </div>
    </div>
  )
}
