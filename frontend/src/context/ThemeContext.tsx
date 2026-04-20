import { createContext, useContext } from 'react'
import { useTheme } from '@/hooks/useTheme'

interface ThemeCtx { theme: 'light' | 'dark'; toggle: () => void }
const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const ctx = useTheme()
  return <ThemeContext.Provider value={ctx}>{children}</ThemeContext.Provider>
}

export const useThemeContext = () => useContext(ThemeContext)
