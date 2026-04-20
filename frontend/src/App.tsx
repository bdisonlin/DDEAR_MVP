import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Welcome from '@/pages/Welcome'
import Dashboard from '@/pages/Dashboard'
import { useSandboxStore } from '@/store/useSandboxStore'
import { getAssetTypes } from '@/api/simulation'

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
      </Routes>
    </Layout>
  )
}
