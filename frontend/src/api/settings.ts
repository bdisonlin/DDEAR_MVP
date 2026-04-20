const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export async function getSettings(): Promise<any> {
  const res = await fetch(`${BASE_URL}/settings`)
  if (!res.ok) {
    throw new Error('無法取得系統設定')
  }
  const payload = await res.json()
  return payload.data
}

export async function updateSettings(data: any): Promise<void> {
  const res = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || '寫入設定失敗')
  }
}
