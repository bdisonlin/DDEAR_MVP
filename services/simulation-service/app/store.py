"""
Baseline data store.

Write path:  PostgreSQL (persistent) + Redis (hot cache, 24 h TTL)
Read path:   Redis → PostgreSQL → None
Delete path: both layers

Graceful fallback: if DATABASE_URL is not set (plain local dev), the module
falls back to the original in-memory dict so the app still works without Docker.
"""
import gzip
import io
import json
import logging
import threading
from dataclasses import dataclass
from typing import Optional

import pandas as pd

from app.db.connection import (
    engine, redis_client, _DB_MODE,
    BASELINE_TTL_S,
)

logger = logging.getLogger(__name__)

_CACHE_MODE = redis_client is not None

# ── Shared data model ──────────────────────────────────────────────────────────

@dataclass
class BaselineRecord:
    series:        pd.Series
    voltage:       str            = "high"
    contracted_kw: Optional[float] = None
    bill_type:     str            = "tiered"


# ── Serialisation helpers ──────────────────────────────────────────────────────

def _pack(series: pd.Series) -> bytes:
    """Gzip-compressed JSON (ISO timestamps)."""
    return gzip.compress(series.to_json(date_format="iso").encode())


def _unpack(blob: bytes) -> pd.Series:
    j = gzip.decompress(blob).decode()
    s = pd.read_json(io.StringIO(j), typ="series")
    s.index = pd.to_datetime(s.index, utc=True).tz_convert(None)
    return s


def _meta_key(data_id: str) -> str:
    return f"baseline:{data_id}:meta"


def _series_key(data_id: str) -> str:
    return f"baseline:{data_id}:series"


# ── In-memory fallback (no DB configured) ──────────────────────────────────────

_mem_lock:  threading.Lock           = threading.Lock()
_mem_store: dict[str, BaselineRecord] = {}


# ── Public API ────────────────────────────────────────────────────────────────

def save(
    data_id:       str,
    series:        pd.Series,
    voltage:       str   = "high",
    contracted_kw: Optional[float] = None,
    bill_type:     str   = "tiered",
) -> None:
    if not _DB_MODE:
        with _mem_lock:
            _mem_store[data_id] = BaselineRecord(
                series=series, voltage=voltage,
                contracted_kw=contracted_kw, bill_type=bill_type,
            )
        return

    blob = _pack(series)
    meta = {"voltage": voltage, "contracted_kw": contracted_kw, "bill_type": bill_type}

    # ── PostgreSQL write-through ───────────────────────────────────────────────
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO baselines
                (id, date_start, date_end, peak_kw, avg_kw, total_kwh,
                 voltage, contracted_kw, bill_type, num_intervals, series_gz)
            VALUES
                (:id, :date_start, :date_end, :peak_kw, :avg_kw, :total_kwh,
                 :voltage, :contracted_kw, :bill_type, :num_intervals, :series_gz)
            ON CONFLICT (id) DO UPDATE SET
                series_gz     = EXCLUDED.series_gz,
                voltage       = EXCLUDED.voltage,
                contracted_kw = EXCLUDED.contracted_kw,
                bill_type     = EXCLUDED.bill_type,
                date_start    = EXCLUDED.date_start,
                date_end      = EXCLUDED.date_end,
                peak_kw       = EXCLUDED.peak_kw,
                avg_kw        = EXCLUDED.avg_kw,
                total_kwh     = EXCLUDED.total_kwh,
                num_intervals = EXCLUDED.num_intervals
        """), {
            "id":            data_id,
            "date_start":    series.index[0].date(),
            "date_end":      series.index[-1].date(),
            "peak_kw":       float(series.max()),
            "avg_kw":        float(series.mean()),
            "total_kwh":     float(series.sum() * 0.25),
            "voltage":       voltage,
            "contracted_kw": contracted_kw,
            "bill_type":     bill_type,
            "num_intervals": len(series),
            "series_gz":     blob,
        })
        conn.commit()

    # ── Redis cache ────────────────────────────────────────────────────────────
    if _CACHE_MODE:
        try:
            redis_client.setex(_series_key(data_id), BASELINE_TTL_S, blob)
            redis_client.setex(_meta_key(data_id),   BASELINE_TTL_S,
                               json.dumps(meta).encode())
        except Exception as exc:
            logger.warning("Redis write failed (non-fatal): %s", exc)


def load(data_id: str) -> Optional[BaselineRecord]:
    if not _DB_MODE:
        with _mem_lock:
            return _mem_store.get(data_id)

    # ── Redis fast path ────────────────────────────────────────────────────────
    if _CACHE_MODE:
        try:
            blob     = redis_client.get(_series_key(data_id))
            meta_raw = redis_client.get(_meta_key(data_id))
            if blob and meta_raw:
                meta = json.loads(meta_raw)
                return BaselineRecord(series=_unpack(blob), **meta)
        except Exception as exc:
            logger.warning("Redis read failed (non-fatal): %s", exc)

    # ── PostgreSQL cold path ───────────────────────────────────────────────────
    from sqlalchemy import text
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT series_gz, voltage, contracted_kw, bill_type "
                 "FROM baselines WHERE id = :id"),
            {"id": data_id},
        ).fetchone()

    if row is None:
        return None

    blob = bytes(row.series_gz)
    series = _unpack(blob)
    meta = {
        "voltage":       row.voltage,
        "contracted_kw": row.contracted_kw,
        "bill_type":     row.bill_type,
    }

    # Re-warm Redis
    if _CACHE_MODE:
        try:
            redis_client.setex(_series_key(data_id), BASELINE_TTL_S, blob)
            redis_client.setex(_meta_key(data_id),   BASELINE_TTL_S,
                               json.dumps(meta).encode())
        except Exception as exc:
            logger.warning("Redis re-warm failed (non-fatal): %s", exc)

    return BaselineRecord(series=series, **meta)


def delete(data_id: str) -> None:
    if not _DB_MODE:
        with _mem_lock:
            _mem_store.pop(data_id, None)
        return

    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM baselines WHERE id = :id"), {"id": data_id})
        conn.commit()

    if _CACHE_MODE:
        try:
            redis_client.delete(_series_key(data_id), _meta_key(data_id))
        except Exception as exc:
            logger.warning("Redis delete failed (non-fatal): %s", exc)
