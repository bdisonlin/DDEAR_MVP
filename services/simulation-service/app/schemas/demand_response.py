from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class DRProgram(str, Enum):
    PLANNED_MONTHLY   = "planned_monthly"   # 計畫性－月選8日型
    PLANNED_DAILY     = "planned_daily"     # 計畫性－日選時段型
    RT_GUARANTEED     = "rt_guaranteed"     # 即時性－保證反應型（有罰則）
    RT_FLEXIBLE       = "rt_flexible"       # 即時性－彈性反應型（無罰則）
    BID_ECONOMIC      = "bid_economic"      # 競價－經濟型（無罰則）
    BID_RELIABLE      = "bid_reliable"      # 競價－可靠型（有罰則）


class NotificationType(str, Enum):
    DAY_AHEAD    = "day_ahead"      # 日前通知
    SAME_DAY_2H  = "same_day_2h"   # 當日2小時前（+20% bonus）
    SAME_DAY_1H  = "same_day_1h"   # 當日1小時前（+20% bonus）


class DRRequest(BaseModel):
    data_id: str
    program: DRProgram
    contracted_kw: float = Field(..., ge=20, description="約定抑低契約容量 (kW)")
    bid_price_ntd_per_kwh: float = Field(3.0, ge=0.0, le=10.0, description="報價 (元/度)")
    events_per_year: Optional[int] = Field(None, ge=1, le=365)
    event_duration_hours: float = Field(2.0, ge=0.5, le=4.0, description="每次執行時數")
    notification_type: NotificationType = NotificationType.DAY_AHEAD
    peak_hours: list[int] = Field(default=[13, 14, 15, 16, 17], description="尖峰時段 (hour of day)")


class MonthlyDRRow(BaseModel):
    month: str
    cbl_kw: float
    actual_reduction_kw: float
    execution_rate: float        # 0-1
    discount_rate: float         # 0-1.4
    events: int
    flow_revenue: float
    basic_fee_discount: float
    penalty: float
    net_revenue: float


class DRSettlement(BaseModel):
    program: DRProgram
    program_label: str
    contracted_kw: float
    bid_price: float
    cbl_kw: float
    avg_actual_reduction_kw: float
    avg_execution_rate: float
    total_events_per_year: int
    total_event_hours: float
    annual_flow_revenue: float
    annual_basic_fee_discount: float
    annual_penalty: float
    annual_net_revenue: float
    has_penalty: bool
    notification_type: NotificationType
    avg_discount_rate: float
    monthly: list[MonthlyDRRow]
