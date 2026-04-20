"""Baseline data endpoints — sample generation and CSV upload."""
import io
import uuid
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File

from app.schemas.simulation import SampleBaselineRequest, BaselineSummary
from app.core.tariff import calculate_electricity_cost
from app import store

router = APIRouter()


def _summarise(data_id: str, series: pd.Series, voltage: str = "high") -> BaselineSummary:
    monthly = calculate_electricity_cost(series, voltage=voltage)
    return BaselineSummary(
        data_id=data_id,
        peak_kw=float(series.max()),
        avg_kw=float(series.mean()),
        total_kwh=float(series.sum() * 0.25),
        annual_cost_ntd=float(monthly["total_cost"].sum()),
        date_start=str(series.index[0].date()),
        date_end=str(series.index[-1].date()),
        num_intervals=len(series),
    )


@router.post("/sample", response_model=BaselineSummary)
def generate_sample(req: SampleBaselineRequest):
    """Generate a synthetic factory load profile and store it."""
    from app.utils.data_generator import generate_sample_load
    data_id = str(uuid.uuid4())[:12]
    series = generate_sample_load(req.year, req.peak_kw)
    store.save(data_id, series)
    return _summarise(data_id, series)


@router.post("/upload", response_model=BaselineSummary)
async def upload_csv(file: UploadFile = File(...)):
    """Upload a 15-min interval CSV (columns: timestamp, load_kw)."""
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content), parse_dates=[0])
        df.columns = ["timestamp", "load_kw"]
        df = df.set_index("timestamp").sort_index()
        df = df.resample("15min").mean().interpolate()
        series = df["load_kw"].rename("load_kw")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV parse error: {exc}")

    if len(series) < 96:
        raise HTTPException(status_code=422, detail="需至少 1 天 (96筆) 的 15 分鐘資料")

    data_id = str(uuid.uuid4())[:12]
    store.save(data_id, series)
    return _summarise(data_id, series)


@router.delete("/{data_id}", status_code=204)
def delete_baseline(data_id: str):
    store.delete(data_id)
