const BASE_SIM  = import.meta.env.VITE_SIMULATION_API_URL ?? '/api/simulation'
const BASE_DATA = import.meta.env.VITE_DATA_API_URL       ?? '/api/data'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[${res.status}] ${text}`)
  }
  return res.json() as Promise<T>
}

export const simApi = {
  get:  <T>(path: string)             => request<T>(`${BASE_SIM}${path}`),
  post: <T>(path: string, body: unknown) =>
    request<T>(`${BASE_SIM}${path}`, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(`${BASE_SIM}${path}`, { method: 'PUT', body: JSON.stringify(body) }),
}

export const dataApi = {
  uploadFile: async (file: File): Promise<{ file_id: string; filename: string; size: number }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_DATA}/files/upload`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}
