import { simApi } from './client'
import type { DRConfig, DRSettlement } from '@/types'

export const runDemandResponse = (
  data_id: string,
  cfg: DRConfig,
): Promise<DRSettlement> =>
  simApi.post<DRSettlement>('/demand_response', {
    data_id,
    program: cfg.program,
    contracted_kw: cfg.contracted_kw,
    bid_price_ntd_per_kwh: cfg.bid_price_ntd_per_kwh,
    event_duration_hours: cfg.event_duration_hours,
    notification_type: cfg.notification_type,
    peak_hours: cfg.peak_hours,
  })
