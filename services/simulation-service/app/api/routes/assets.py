"""Asset type catalogue endpoint."""
from fastapi import APIRouter
from app.schemas.simulation import AssetTypeInfo

router = APIRouter()

_CATALOGUE = [
    AssetTypeInfo(type="solar_self",     label="☀️ 自發自用太陽能", unit="kWp", color="#f9c74f", capex_hint_ntd_per_unit=35000, default_capacity=200),
    AssetTypeInfo(type="solar_purchase", label="☀️ 外購太陽能",     unit="kWp", color="#f8961e", capex_hint_ntd_per_unit=30000, default_capacity=200),
    AssetTypeInfo(type="wind",           label="💨 外購風力發電",    unit="kW",  color="#43aa8b", capex_hint_ntd_per_unit=70000, default_capacity=500),
    AssetTypeInfo(type="hydro",          label="💧 外購水力發電",    unit="kW",  color="#4d908e", capex_hint_ntd_per_unit=90000, default_capacity=300),
    AssetTypeInfo(type="hvac",           label="❄️ 空調效率提升",   unit="kW效益", color="#577590", capex_hint_ntd_per_unit=3000000, default_capacity=0),
    AssetTypeInfo(type="storage",        label="🔋 儲能系統",       unit="kWh", color="#90be6d", capex_hint_ntd_per_unit=15000, default_capacity=1000),
    AssetTypeInfo(type="ev",             label="⚡ 充電樁",          unit="kW",  color="#277da1", capex_hint_ntd_per_unit=80000, default_capacity=0),
]


@router.get("", response_model=list[AssetTypeInfo])
def list_asset_types():
    return _CATALOGUE
