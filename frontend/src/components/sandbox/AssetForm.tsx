import { useState } from 'react'
import { useSandboxStore } from '@/store/useSandboxStore'
import type { Asset, AssetParams } from '@/types'

interface Props { onAdd: (asset: Asset) => void; onCancel: () => void }

export default function AssetForm({ onAdd, onCancel }: Props) {
  const assetTypes = useSandboxStore((s) => s.assetTypes)
  const [type, setType] = useState(assetTypes[0]?.type ?? 'solar_self')
  const [name, setName] = useState('')

  const info = assetTypes.find((t) => t.type === type)!

  const [cap,          setCap]          = useState(info?.default_capacity ?? 200)
  const [capexPerUnit, setCapexPerUnit] = useState(info?.capex_hint_ntd_per_unit ?? 35000)
  const [capFactor,    setCapFactor]    = useState(0.30)
  const [effGain,      setEffGain]      = useState(0.15)
  const [capKwh,       setCapKwh]       = useState(1000)
  const [powerKw,      setPowerKw]      = useState(500)
  const [numChargers,  setNumChargers]  = useState(10)
  const [chargerKw,    setChargerKw]    = useState(22)
  const [smart,        setSmart]        = useState(true)

  const handleTypeChange = (t: string) => {
    setType(t)
    const nInfo = assetTypes.find((x) => x.type === t)!
    setCap(nInfo.default_capacity)
    setCapexPerUnit(nInfo.capex_hint_ntd_per_unit)
  }

  const handleAdd = () => {
    if (!info) return
    let params: AssetParams = { capacity_kw: cap, capex_ntd: 0, annual_om_ntd: 0 }

    if (['solar_self', 'solar_purchase', 'wind', 'hydro'].includes(type)) {
      const capex = cap * capexPerUnit
      params = { capacity_kw: cap, capex_ntd: capex, annual_om_ntd: capex * 0.015,
                 capacity_factor: type === 'wind' ? capFactor : undefined }
    } else if (type === 'hvac') {
      params = { capacity_kw: 0, capex_ntd: capexPerUnit, annual_om_ntd: capexPerUnit * 0.01, efficiency_gain: effGain }
    } else if (type === 'storage') {
      const capex = capKwh * capexPerUnit
      params = { capacity_kw: powerKw, capex_ntd: capex, annual_om_ntd: capex * 0.02,
                 capacity_kwh: capKwh, power_kw: powerKw, efficiency: 0.92 }
    } else if (type === 'ev') {
      const capex = numChargers * capexPerUnit
      params = { capacity_kw: numChargers * chargerKw, capex_ntd: capex, annual_om_ntd: capex * 0.03,
                 num_chargers: numChargers, charger_kw: chargerKw, smart_charging: smart }
    }

    onAdd({
      id: crypto.randomUUID().slice(0, 8),
      name: name || `${info.label} #${Date.now().toString().slice(-4)}`,
      type, params, color: info.color, label: info.label,
    })
  }

  return (
    <div className="rounded-ios-sm border border-black/8 dark:border-white/10 p-3 space-y-3 asset-form-panel">
      {/* Type selector */}
      <div>
        <label className="label">資產類型</label>
        <select className="input" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
          {assetTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <label className="label">資產名稱（選填）</label>
        <input className="input" placeholder={`${info?.label}`} value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>

      {/* RE assets */}
      {['solar_self', 'solar_purchase', 'wind', 'hydro'].includes(type) && (<>
        <div>
          <label className="label">裝置容量 ({info.unit})</label>
          <input className="input" type="number" value={cap}
            onChange={(e) => setCap(+e.target.value)} min={10} />
        </div>
        <div>
          <label className="label">造價 NT$/{info.unit}</label>
          <input className="input" type="number" value={capexPerUnit}
            onChange={(e) => setCapexPerUnit(+e.target.value)} />
        </div>
        {type === 'wind' && (
          <div>
            <label className="label">
              容量因子 —{' '}
              <span className="text-ios-blue font-data normal-case">{(capFactor * 100).toFixed(0)}%</span>
            </label>
            <input type="range" min={0.10} max={0.50} step={0.01} value={capFactor}
              onChange={(e) => setCapFactor(+e.target.value)}
              className="w-full accent-ios-blue" />
          </div>
        )}
      </>)}

      {/* HVAC */}
      {type === 'hvac' && (<>
        <div>
          <label className="label">
            效率提升 —{' '}
            <span className="text-ios-blue font-data normal-case">{(effGain * 100).toFixed(0)}%</span>
          </label>
          <input type="range" min={0.05} max={0.40} step={0.01} value={effGain}
            onChange={(e) => setEffGain(+e.target.value)} className="w-full accent-ios-blue" />
        </div>
        <div>
          <label className="label">設備投資 NT$</label>
          <input className="input" type="number" value={capexPerUnit}
            onChange={(e) => setCapexPerUnit(+e.target.value)} />
        </div>
      </>)}

      {/* Storage */}
      {type === 'storage' && (<>
        <div>
          <label className="label">儲能容量 (kWh)</label>
          <input className="input" type="number" value={capKwh}
            onChange={(e) => setCapKwh(+e.target.value)} min={100} />
        </div>
        <div>
          <label className="label">額定功率 (kW)</label>
          <input className="input" type="number" value={powerKw}
            onChange={(e) => setPowerKw(+e.target.value)} min={50} />
        </div>
        <div>
          <label className="label">造價 NT$/kWh</label>
          <input className="input" type="number" value={capexPerUnit}
            onChange={(e) => setCapexPerUnit(+e.target.value)} />
        </div>
      </>)}

      {/* EV */}
      {type === 'ev' && (<>
        <div>
          <label className="label">充電樁數量</label>
          <input className="input" type="number" value={numChargers}
            onChange={(e) => setNumChargers(+e.target.value)} min={1} />
        </div>
        <div>
          <label className="label">單樁功率 (kW)</label>
          <select className="input" value={chargerKw}
            onChange={(e) => setChargerKw(+e.target.value)}>
            {[7.4, 11, 22, 50, 120].map(k => <option key={k} value={k}>{k} kW</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2.5 text-xs text-ios-gray1 cursor-pointer py-1">
          <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)}
            className="accent-ios-blue w-3.5 h-3.5" />
          智慧排程充電（離峰）
        </label>
        <div>
          <label className="label">每樁造價 NT$</label>
          <input className="input" type="number" value={capexPerUnit}
            onChange={(e) => setCapexPerUnit(+e.target.value)} />
        </div>
      </>)}

      <div className="flex gap-2 pt-1">
        <button className="btn-primary flex-1 text-xs" onClick={handleAdd}>加入沙盒</button>
        <button className="btn-ghost text-xs" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}
