from fastapi import APIRouter, HTTPException
from app.schemas.demand_response import DRRequest, DRSettlement
from app.core.demand_response import simulate_dr
from app import store

router = APIRouter()


@router.post("", response_model=DRSettlement)
def run_demand_response(req: DRRequest):
    series = store.load(req.data_id)
    if series is None:
        raise HTTPException(
            status_code=404,
            detail=f"data_id '{req.data_id}' not found. Please load baseline first.",
        )
    try:
        return simulate_dr(series, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
