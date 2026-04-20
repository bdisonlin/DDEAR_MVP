export const fmtNtd = (v: number): string => {
  if (Math.abs(v) >= 1e6) return `NT$ ${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `NT$ ${(v / 1e3).toFixed(1)}K`
  return `NT$ ${v.toFixed(0)}`
}

export const fmtPct = (v: number, decimals = 1): string =>
  `${(v * 100).toFixed(decimals)}%`

export const fmtKwh = (v: number): string => {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)} GWh`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)} MWh`
  return `${v.toFixed(0)} kWh`
}

export const fmtKw = (v: number): string => `${v.toFixed(0)} kW`
