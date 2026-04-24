"""
Simulation run persistence — PostgreSQL + Redis result cache.

save_run()   — persist inputs + result; cache result in Redis (1 h TTL)
get_cached() — check Redis cache by request hash before computing
list_runs()  — fetch recent simulation runs for the history UI
"""
import hashlib
import json
import logging
from typing import Any, Optional

from app.db.connection import engine, redis_client, SIM_RESULT_TTL_S, _DB_MODE

logger = logging.getLogger(__name__)

_CACHE_MODE = redis_client is not None


def _request_hash(assets: list, tariff: dict, financial: dict) -> str:
    payload = json.dumps(
        {"assets": assets, "tariff": tariff, "financial": financial},
        sort_keys=True, default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def get_cached(assets: list, tariff: dict, financial: dict) -> Optional[dict]:
    """Return a previously cached SimulationResponse dict, or None on miss."""
    if not _CACHE_MODE:
        return None
    key = f"simcache:{_request_hash(assets, tariff, financial)}"
    try:
        raw = redis_client.get(key)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis sim cache read failed: %s", exc)
    return None


def save_run(
    baseline_id:   str,
    assets:        list,
    tariff:        dict,
    financial:     dict,
    result:        dict,
    annual_savings: float,
    re_ratio:      float,
    total_capex:   float,
) -> None:
    """Persist run to PostgreSQL and cache result in Redis."""
    req_hash = _request_hash(assets, tariff, financial)

    # Redis cache — store full result
    if _CACHE_MODE:
        key = f"simcache:{req_hash}"
        try:
            redis_client.setex(key, SIM_RESULT_TTL_S, json.dumps(result, default=str).encode())
        except Exception as exc:
            logger.warning("Redis sim cache write failed: %s", exc)

    # PostgreSQL — persist for history / audit
    if not _DB_MODE:
        return

    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO simulation_runs
                    (baseline_id, request_hash, assets_json, tariff_json,
                     financial_json, result_json, annual_savings, re_ratio, total_capex)
                VALUES
                    (:baseline_id, :request_hash, :assets_json::jsonb, :tariff_json::jsonb,
                     :financial_json::jsonb, :result_json::jsonb,
                     :annual_savings, :re_ratio, :total_capex)
            """), {
                "baseline_id":    baseline_id,
                "request_hash":   req_hash,
                "assets_json":    json.dumps(assets,    default=str),
                "tariff_json":    json.dumps(tariff,    default=str),
                "financial_json": json.dumps(financial, default=str),
                "result_json":    json.dumps(result,    default=str),
                "annual_savings": annual_savings,
                "re_ratio":       re_ratio,
                "total_capex":    total_capex,
            })
            conn.commit()
    except Exception as exc:
        logger.error("Simulation run persist failed (non-fatal): %s", exc)


def list_runs(baseline_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Return most-recent simulation runs for a baseline (no result blob)."""
    if not _DB_MODE:
        return []
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id::text, created_at, assets_json, tariff_json,
                   annual_savings, re_ratio, total_capex
            FROM simulation_runs
            WHERE baseline_id = :bid
            ORDER BY created_at DESC
            LIMIT :lim
        """), {"bid": baseline_id, "lim": limit}).fetchall()
    return [
        {
            "id":             r.id,
            "created_at":     r.created_at.isoformat(),
            "assets":         r.assets_json,
            "tariff":         r.tariff_json,
            "annual_savings": r.annual_savings,
            "re_ratio":       r.re_ratio,
            "total_capex":    r.total_capex,
        }
        for r in rows
    ]


def get_run_result(run_id: str) -> Optional[dict]:
    """Fetch the full SimulationResponse dict for a past run."""
    if not _DB_MODE:
        return None
    from sqlalchemy import text
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT result_json FROM simulation_runs WHERE id = :id::uuid"),
            {"id": run_id},
        ).fetchone()
    return row.result_json if row else None
