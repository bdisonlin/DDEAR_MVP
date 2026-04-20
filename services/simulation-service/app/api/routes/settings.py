import json
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core import tariff_config

router = APIRouter()

class SettingsResponse(BaseModel):
    data: dict[str, Any]

@router.get("", response_model=SettingsResponse)
def get_settings():
    return SettingsResponse(data=tariff_config.TARIFF_DATA)

@router.put("")
def update_settings(payload: dict[str, Any]):
    try:
        # Write to persistence
        with open(tariff_config._config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        # Hot-reload in memory module
        tariff_config.TARIFF_DATA = payload
        tariff_config.HV_TOU = payload.get("tou", {}).get("high", tariff_config.HV_TOU)
        tariff_config.LV_COM_TOU = payload.get("tou", {}).get("low", tariff_config.LV_COM_TOU)
        tariff_config.RES_TIERS = payload.get("progressive", tariff_config.RES_TIERS)
        
        tariff_config.HV_DEMAND_CHARGE_PER_KW = payload.get("demand_charges", {}).get("high", tariff_config.HV_DEMAND_CHARGE_PER_KW)
        tariff_config.LV_COM_DEMAND_CHARGE_PER_KW = payload.get("demand_charges", {}).get("low", tariff_config.LV_COM_DEMAND_CHARGE_PER_KW)

        pens = payload.get("penalties", {})
        tariff_config.DEMAND_PENALTY_WITHIN_10PCT = pens.get("demand_within_10pct", tariff_config.DEMAND_PENALTY_WITHIN_10PCT)
        tariff_config.DEMAND_PENALTY_OVER_10PCT = pens.get("demand_over_10pct", tariff_config.DEMAND_PENALTY_OVER_10PCT)
        tariff_config.RES_TOU_EXCESS_THRESHOLD_KWH = pens.get("res_tou_excess_threshold", tariff_config.RES_TOU_EXCESS_THRESHOLD_KWH)
        tariff_config.RES_TOU_EXCESS_RATE_NTD_PER_KWH = pens.get("res_tou_excess_rate", tariff_config.RES_TOU_EXCESS_RATE_NTD_PER_KWH)

        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
