import { simApi } from './client'

export const getSettings = async (): Promise<any> => {
  const payload: any = await simApi.get('/settings')
  return payload.data
}

export const updateSettings = async (data: any): Promise<void> => {
  await simApi.put('/settings', data)
}
