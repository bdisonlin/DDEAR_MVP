import { useState, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

const MIN_W = 200
const MAX_W = 520
const DEFAULT_W = 288

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_W)
  const startX = useRef(0)
  const startW = useRef(DEFAULT_W)

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startX.current = e.clientX
    startW.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, startW.current + ev.clientX - startX.current))
      setSidebarWidth(w)
    }
    const onUp = () => {
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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper — fixed drawer on mobile, resizable on md+ */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:flex md:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ width: sidebarWidth }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />

        {/* Drag handle — desktop only */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize group hidden md:block z-50"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px
            bg-transparent group-hover:bg-ios-blue/50 transition-colors duration-150" />
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  )
}
