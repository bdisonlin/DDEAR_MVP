"""Baseline creation from monthly electricity bill data."""
import uuid
from fastapi import APIRouter, HTTPException

from app.schemas.monthly_bill import MonthlyBillRequest, MonthlyBillSummary
from app.core.monthly_synthesis import synthesize_from_monthly
from app.core.tariff import calculate_electricity_cost
from app import store

router = APIRouter()

_RE_CAPACITY_FACTOR = 0.18   # assumed solar capacity factor for suggested capacity


@router.post("", response_model=MonthlyBillSummary)
def create_from_monthly_bill(req: MonthlyBillRequest):
    """Synthesize a 15-min load profile from monthly electricity bill rows."""
    try:
        series = synthesize_from_monthly(
            req.year, req.rows, req.bill_type, req.voltage
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"合成失敗：{exc}")

    data_id = str(uuid.uuid4())[:12]
    store.save(
        data_id, series,
        voltage=req.voltage,
        contracted_kw=req.contracted_kw,
        bill_type=req.bill_type,
    )

    monthly_cost = calculate_electricity_cost(
        series,
        voltage=req.voltage,
        contracted_kw=req.contracted_kw,
        bill_type=req.bill_type,
    )

    total_re_kwh = float(sum(r.total_re_kwh for r in req.rows))
    suggested_cap = round(total_re_kwh / (8760 * _RE_CAPACITY_FACTOR), 1) if total_re_kwh > 0 else 0.0

    return MonthlyBillSummary(
        data_id=data_id,
        peak_kw=float(series.max()),
        avg_kw=float(series.mean()),
        total_kwh=float(series.sum() * 0.25),
        annual_cost_ntd=float(monthly_cost["total_cost"].sum()),
        date_start=str(series.index[0].date()),
        date_end=str(series.index[-1].date()),
        num_intervals=len(series),
        re_kwh=total_re_kwh,
        suggested_re_capacity_kw=suggested_cap,
    )
