import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import EnergyStrategy from '@/pages/EnergyStrategy'
import { useSandboxStore } from '@/store/useSandboxStore'
import { getAssetTypes } from '@/api/simulation'
import Settings from '@/pages/Settings'

export default function App() {
  const setAssetTypes = useSandboxStore((s) => s.setAssetTypes)

  useEffect(() => {
    getAssetTypes().then(setAssetTypes).catch(console.error)
  }, [setAssetTypes])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/strategy" element={<EnergyStrategy />} />
      </Routes>
    </Layout>
  )
}
