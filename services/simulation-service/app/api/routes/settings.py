"""
Settings routes:
  GET/PUT /api/v1/settings           — live tariff config (hot-reload from JSON file)
  GET     /api/v1/settings/presets   — list saved tariff presets
  POST    /api/v1/settings/presets   — save a new preset
  PUT     /api/v1/settings/presets/{id} — update a preset
  DELETE  /api/v1/settings/presets/{id} — delete a preset
  POST    /api/v1/settings/presets/{id}/apply — load preset into live config
"""
import json
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core import tariff_config
from app.db.connection import engine, _DB_MODE

router = APIRouter()


# ── Live tariff config (file-backed, hot-reload) ───────────────────────────────

class SettingsResponse(BaseModel):
    data: dict[str, Any]


@router.get("", response_model=SettingsResponse)
def get_settings():
    return SettingsResponse(data=tariff_config.TARIFF_DATA)


@router.put("")
def update_settings(payload: dict[str, Any]):
    try:
        with open(tariff_config._config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        tariff_config.TARIFF_DATA = payload
        tariff_config.HV_TOU = payload.get("tou", {}).get("high", tariff_config.HV_TOU)
        tariff_config.LV_COM_TOU = payload.get("tou", {}).get("low", tariff_config.LV_COM_TOU)
        tariff_config.RES_TIERS = payload.get("progressive", tariff_config.RES_TIERS)
        tariff_config.HV_DEMAND_CHARGE_PER_KW = payload.get("demand_charges", {}).get(
            "high", tariff_config.HV_DEMAND_CHARGE_PER_KW)
        tariff_config.LV_COM_DEMAND_CHARGE_PER_KW = payload.get("demand_charges", {}).get(
            "low", tariff_config.LV_COM_DEMAND_CHARGE_PER_KW)

        pens = payload.get("penalties", {})
        tariff_config.DEMAND_PENALTY_WITHIN_10PCT = pens.get(
            "demand_within_10pct", tariff_config.DEMAND_PENALTY_WITHIN_10PCT)
        tariff_config.DEMAND_PENALTY_OVER_10PCT = pens.get(
            "demand_over_10pct", tariff_config.DEMAND_PENALTY_OVER_10PCT)
        tariff_config.RES_TOU_EXCESS_THRESHOLD_KWH = pens.get(
            "res_tou_excess_threshold", tariff_config.RES_TOU_EXCESS_THRESHOLD_KWH)
        tariff_config.RES_TOU_EXCESS_RATE_NTD_PER_KWH = pens.get(
            "res_tou_excess_rate", tariff_config.RES_TOU_EXCESS_RATE_NTD_PER_KWH)

        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Tariff preset CRUD ─────────────────────────────────────────────────────────

class TariffPresetIn(BaseModel):
    name:       str
    is_default: bool = False
    config:     dict[str, Any]


class TariffPreset(BaseModel):
    id:         int
    name:       str
    is_default: bool
    created_at: str
    updated_at: str
    config:     dict[str, Any]


def _require_db():
    if not _DB_MODE:
        raise HTTPException(
            status_code=503,
            detail="Database not configured — set DATABASE_URL to enable preset storage.",
        )


@router.get("/presets")
def list_presets():
    _require_db()
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, name, is_default, created_at, updated_at, config_json "
                 "FROM tariff_presets ORDER BY is_default DESC, name")
        ).fetchall()
    return [
        TariffPreset(
            id=r.id, name=r.name, is_default=r.is_default,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
            config=r.config_json,
        )
        for r in rows
    ]


@router.post("/presets", status_code=201)
def create_preset(body: TariffPresetIn):
    _require_db()
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if body.is_default:
                conn.execute(
                    text("UPDATE tariff_presets SET is_default = FALSE WHERE is_default = TRUE")
                )
            row = conn.execute(text("""
                INSERT INTO tariff_presets (name, is_default, config_json)
                VALUES (:name, :is_default, :config_json::jsonb)
                RETURNING id, name, is_default, created_at, updated_at, config_json
            """), {
                "name":        body.name,
                "is_default":  body.is_default,
                "config_json": json.dumps(body.config),
            }).fetchone()
            conn.commit()
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail=f"Preset '{body.name}' already exists.")
        raise HTTPException(status_code=500, detail=str(exc))

    return TariffPreset(
        id=row.id, name=row.name, is_default=row.is_default,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        config=row.config_json,
    )


@router.put("/presets/{preset_id}")
def update_preset(preset_id: int, body: TariffPresetIn):
    _require_db()
    from sqlalchemy import text
    with engine.connect() as conn:
        if body.is_default:
            conn.execute(
                text("UPDATE tariff_presets SET is_default = FALSE WHERE is_default = TRUE")
            )
        row = conn.execute(text("""
            UPDATE tariff_presets
            SET name = :name, is_default = :is_default,
                config_json = :config_json::jsonb,
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, name, is_default, created_at, updated_at, config_json
        """), {
            "id": preset_id, "name": body.name,
            "is_default": body.is_default,
            "config_json": json.dumps(body.config),
        }).fetchone()
        conn.commit()

    if row is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    return TariffPreset(
        id=row.id, name=row.name, is_default=row.is_default,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        config=row.config_json,
    )


@router.delete("/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: int):
    _require_db()
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM tariff_presets WHERE id = :id"), {"id": preset_id})
        conn.commit()


@router.post("/presets/{preset_id}/apply")
def apply_preset(preset_id: int):
    """Load a saved preset into the live tariff config (same effect as PUT /)."""
    _require_db()
    from sqlalchemy import text
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT config_json FROM tariff_presets WHERE id = :id"),
            {"id": preset_id},
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    return update_settings(row.config_json)
