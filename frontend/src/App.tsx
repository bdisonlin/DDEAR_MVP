import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Welcome from '@/pages/Welcome'
import Dashboard from '@/pages/Dashboard'
import EnergyStrategy from '@/pages/EnergyStrategy'
import { useSandboxStore } from '@/store/useSandboxStore'
import { getAssetTypes } from '@/api/simulation'
import Settings from '@/pages/Settings'

export default function App() {
  const setAssetTypes = useSandboxStore((s) => s.setAssetTypes)
  const baseline = useSandboxStore((s) => s.baseline)

  useEffect(() => {
    getAssetTypes().then(setAssetTypes).catch(console.error)
  }, [setAssetTypes])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={baseline ? <Dashboard /> : <Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/strategy" element={<EnergyStrategy />} />
      </Routes>
    </Layout>
  )
}
