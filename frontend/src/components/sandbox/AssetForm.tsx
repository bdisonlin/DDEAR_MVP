import { useState } from 'react'
import { useSandboxStore } from '@/store/useSandboxStore'
import type { Asset, AssetParams } from '@/types'
import { fmtNum } from '@/utils/formatters'

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
  // sofc / natgas
  const [elecEff,      setElecEff]      = useState(0.55)   // default SOFC
  const [gasPriceM3,   setGasPriceM3]   = useState(13.7)   // NT$/m³ (Taiwan CPC industrial)
  const [dispatchCF,   setDispatchCF]   = useState(0.85)   // capacity factor
  // PPA contract params (solar_purchase / wind / hydro)
  // ppaContractMode: 'kwh' = 年度採購電量 | 'kw' = 採購裝置容量
  const [ppaContractMode, setPpaContractMode] = useState<'kwh' | 'kw'>('kwh')
  const [ppaPricePerKwh,  setPpaPricePerKwh]  = useState(3.5)                  // NT$/kWh
  const [rniAnnualKwh,    setRniAnnualKwh]    = useState<number | ''>('')       // R_ni (kwh mode primary)
  const [kniMonthlyKwh,   setKniMonthlyKwh]   = useState<number | ''>('')       // K_ni (optional)

  const handleTypeChange = (t: string) => {
    setType(t)
    const nInfo = assetTypes.find((x) => x.type === t)!
    setCap(nInfo.default_capacity)
    setCapexPerUnit(nInfo.capex_hint_ntd_per_unit)
    if (t === 'wind')   { setCapFactor(0.35) }
    if (t === 'hydro')  { setCapFactor(0.40) }
    if (t === 'sofc')   { setElecEff(0.55); setDispatchCF(0.85) }
    if (t === 'natgas') { setElecEff(0.38); setDispatchCF(0.65) }
  }

  const handleAdd = () => {
    if (!info) return
    let params: AssetParams = { capacity_kw: cap, capex_ntd: 0, annual_om_ntd: 0 }

    if (['solar_self', 'solar_purchase', 'wind', 'hydro'].includes(type)) {
      const isPpa = type !== 'solar_self'

      if (!isPpa) {
        const capex = cap * capexPerUnit
        params = {
          capacity_kw: cap, capex_ntd: capex, annual_om_ntd: capex * 0.015,
        }
      } else {
        // PPA asset: no capital ownership; cost = unit price × annual kWh
        const cf = (type === 'wind' || type === 'hydro') ? capFactor : 0.15
        let ppaCap: number
        let annualCost: number
        let annual_cap_kwh: number | undefined
        const monthly_cap_kwh = kniMonthlyKwh !== '' ? kniMonthlyKwh as number : undefined

        if (ppaContractMode === 'kwh') {
          const qty = rniAnnualKwh !== '' ? rniAnnualKwh as number : 0
          ppaCap = Math.max(1, Math.round(qty / Math.max(cf * 8760, 1)))
          annualCost = qty * ppaPricePerKwh
          annual_cap_kwh = qty > 0 ? qty : undefined
        } else {
          ppaCap = cap
          annualCost = cap * cf * 8760 * ppaPricePerKwh
          annual_cap_kwh = rniAnnualKwh !== '' ? rniAnnualKwh as number : undefined
        }

        params = {
          capacity_kw: ppaCap,
          capex_ntd: 0,
          annual_om_ntd: annualCost,
          capacity_factor: (type === 'wind' || type === 'hydro') ? capFactor : undefined,
          transfer_ratio: 1.0,
          ...(annual_cap_kwh  !== undefined && { annual_cap_kwh }),
          ...(monthly_cap_kwh !== undefined && { monthly_cap_kwh }),
        }
      }
    } else if (type === 'sofc' || type === 'natgas') {
      const capex = cap * capexPerUnit
      const gasPriceKwh = gasPriceM3 / 10.55  // NT$/m³ → NT$/kWh_fuel
      params = {
        capacity_kw: cap, capex_ntd: capex, annual_om_ntd: capex * 0.025,
        capacity_factor: dispatchCF,
        electrical_efficiency: elecEff,
        gas_price_ntd_per_kwh_fuel: gasPriceKwh,
      }
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

      {/* RE assets — solar_self */}
      {type === 'solar_self' && (<>
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
      </>)}

      {/* RE assets — PPA (solar_purchase / wind / hydro) */}
      {['solar_purchase', 'wind', 'hydro'].includes(type) && (<>
        {(type === 'wind' || type === 'hydro') && (
          <div>
            <label className="label">
              容量因子 —{' '}
              <span className="text-ios-blue font-data normal-case">{(capFactor * 100).toFixed(0)}%</span>
              <span className="text-ios-gray2 ml-1 normal-case text-xs">
                {type === 'wind' ? '（台灣離岸典型 30–45%）' : '（台灣水力典型 35–50%）'}
              </span>
            </label>
            <input type="range"
              min={type === 'wind' ? 0.20 : 0.25}
              max={type === 'wind' ? 0.55 : 0.60}
              step={0.01} value={capFactor}
              onChange={(e) => setCapFactor(+e.target.value)}
              className="w-full accent-ios-blue" />
          </div>
        )}

        {/* PPA 合約條件 */}
        {(() => {
          const cf = (type === 'wind' || type === 'hydro') ? capFactor : 0.15
          const estAnnualKwh = ppaContractMode === 'kwh'
            ? (rniAnnualKwh !== '' ? rniAnnualKwh as number : 0)
            : cap * cf * 8760
          const annualCostDisplay = estAnnualKwh * ppaPricePerKwh
          return (
            <div className="rounded-ios-sm px-3 py-2.5 space-y-2.5"
              style={{ background: 'rgba(0,122,255,0.04)', border: '1px solid rgba(0,122,255,0.12)' }}>
              <p className="text-xs font-semibold text-ios-blue">PPA 合約條件</p>

              {/* Mode tabs */}
              <div className="flex gap-0.5 p-0.5 rounded-ios-sm bg-black/5 dark:bg-white/6">
                {([
                  { id: 'kwh', label: '年度採購電量' },
                  { id: 'kw',  label: '採購裝置容量' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button"
                    onClick={() => setPpaContractMode(opt.id)}
                    className={[
                      'flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-200',
                      ppaContractMode === opt.id
                        ? 'bg-white dark:bg-white/15 text-ios-blue shadow-ios'
                        : 'text-ios-gray1 hover:text-gray-700 dark:hover:text-gray-300',
                    ].join(' ')}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* 年度採購電量 mode */}
              {ppaContractMode === 'kwh' && (
                <div>
                  <label className="label">
                    R<sub>ni</sub> 年度採購量
                    <span className="text-ios-gray2 ml-1 normal-case text-xs">kWh／年</span>
                  </label>
                  <input className="input" type="number" placeholder="例：20,000,000"
                    value={rniAnnualKwh}
                    onChange={(e) => setRniAnnualKwh(e.target.value === '' ? '' : +e.target.value)}
                    min={0} step={100000} />
                  {rniAnnualKwh !== '' && (
                    <p className="text-xs text-ios-gray2 mt-1">
                      約 {fmtNum((rniAnnualKwh as number) / 1000)} MWh／年
                    </p>
                  )}
                </div>
              )}

              {/* 採購裝置容量 mode */}
              {ppaContractMode === 'kw' && (
                <div>
                  <label className="label">
                    裝置容量
                    <span className="text-ios-gray2 ml-1 normal-case text-xs">{info.unit}</span>
                  </label>
                  <input className="input" type="number" value={cap}
                    onChange={(e) => setCap(+e.target.value)} min={10} />
                  <p className="text-xs text-ios-gray2 mt-1">
                    預估年發電量：約{' '}
                    <span className="font-data text-ios-blue">
                      {fmtNum(cap * cf * 8760 / 1000)} MWh／年
                    </span>
                    {' '}（CF {(cf * 100).toFixed(0)}%）
                  </p>
                </div>
              )}

              {/* 每度電單價 */}
              <div>
                <label className="label">
                  每度電單價
                  <span className="text-ios-gray2 ml-1 normal-case text-xs">NT$／kWh</span>
                </label>
                <input className="input" type="number" value={ppaPricePerKwh}
                  onChange={(e) => setPpaPricePerKwh(+e.target.value)}
                  min={0.1} max={20} step={0.1} />
              </div>

              {/* Auto-computed annual cost */}
              <div className="rounded-ios-sm px-2.5 py-2 flex items-center justify-between"
                style={{ background: 'rgba(0,122,255,0.07)' }}>
                <span className="text-xs text-ios-gray1">預估年度採購總價</span>
                <span className="text-xs font-semibold font-data text-ios-blue">
                  NT$ {annualCostDisplay >= 1e6
                    ? `${(annualCostDisplay / 1e6).toFixed(2)} M`
                    : annualCostDisplay.toLocaleString()} ／年
                </span>
              </div>

              {/* K_ni optional monthly cap */}
              <div>
                <label className="label">
                  K<sub>ni</sub> 月度約定量
                  <span className="text-ios-gray2 ml-1 normal-case text-xs">kWh／月（選填）</span>
                </label>
                <input className="input" type="number" placeholder="不限"
                  value={kniMonthlyKwh}
                  onChange={(e) => setKniMonthlyKwh(e.target.value === '' ? '' : +e.target.value)}
                  min={0} step={1000} />
              </div>

              {/* R_ni optional annual cap for kw mode */}
              {ppaContractMode === 'kw' && (
                <div>
                  <label className="label">
                    R<sub>ni</sub> 年度電量上限
                    <span className="text-ios-gray2 ml-1 normal-case text-xs">kWh／年（選填）</span>
                  </label>
                  <input className="input" type="number" placeholder="不限"
                    value={rniAnnualKwh}
                    onChange={(e) => setRniAnnualKwh(e.target.value === '' ? '' : +e.target.value)}
                    min={0} step={10000} />
                </div>
              )}
              {(kniMonthlyKwh !== '' || (ppaContractMode === 'kw' && rniAnnualKwh !== '')) && (
                <p className="text-xs text-ios-gray2">月度與年度上限同時生效，以先達到者為準。</p>
              )}
            </div>
          )
        })()}
      </>)}

      {/* SOFC / Natural Gas */}
      {(type === 'sofc' || type === 'natgas') && (<>
        <div>
          <label className="label">裝置容量 (kW)</label>
          <input className="input" type="number" value={cap}
            onChange={(e) => setCap(+e.target.value)} min={50} step={50} />
        </div>
        <div>
          <label className="label">
            電效率 —{' '}
            <span className="text-ios-blue font-data normal-case">{(elecEff * 100).toFixed(0)}%</span>
            <span className="text-ios-gray2 ml-1 normal-case text-xs">
              {type === 'sofc' ? '（SOFC 典型 50–60%）' : '（NG 典型 35–45%）'}
            </span>
          </label>
          <input type="range"
            min={type === 'sofc' ? 0.45 : 0.30}
            max={type === 'sofc' ? 0.65 : 0.48}
            step={0.01} value={elecEff}
            onChange={(e) => setElecEff(+e.target.value)}
            className="w-full accent-ios-blue" />
        </div>
        <div>
          <label className="label">
            天然氣單價 —{' '}
            <span className="text-ios-blue font-data normal-case">NT$ {gasPriceM3.toFixed(1)}/m³</span>
          </label>
          <input type="range" min={8} max={22} step={0.5} value={gasPriceM3}
            onChange={(e) => setGasPriceM3(+e.target.value)}
            className="w-full accent-ios-blue" />
          <div className="flex justify-between text-xs text-ios-gray2 font-data mt-0.5">
            <span>8</span><span>NT$/m³</span><span>22</span>
          </div>
        </div>
        <div>
          <label className="label">
            容量因子 —{' '}
            <span className="text-ios-blue font-data normal-case">{(dispatchCF * 100).toFixed(0)}%</span>
          </label>
          <input type="range" min={0.30} max={0.95} step={0.01} value={dispatchCF}
            onChange={(e) => setDispatchCF(+e.target.value)}
            className="w-full accent-ios-blue" />
        </div>
        <div>
          <label className="label">造價 NT$/kW</label>
          <input className="input" type="number" value={capexPerUnit}
            onChange={(e) => setCapexPerUnit(+e.target.value)} />
        </div>
        <div className="rounded-ios-sm px-3 py-2 text-xs space-y-0.5"
          style={{ background: 'rgba(231,111,81,0.07)', border: '1px solid rgba(231,111,81,0.18)' }}>
          <p className="font-semibold" style={{ color: '#e76f51' }}>💡 排碳說明</p>
          <p className="text-ios-gray1">
            天然氣：0.202 kg CO₂/kWh_fuel；電效率 {(elecEff*100).toFixed(0)}% 時約{' '}
            <span className="font-data font-semibold">{(0.202 / elecEff).toFixed(3)} kg CO₂/kWh_e</span>
            {0.202 / elecEff < 0.494
              ? <span className="text-ios-green">（低於台電 0.494）✓</span>
              : <span className="text-ios-red">（高於台電 0.494）⚠</span>}
          </p>
        </div>
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
