"""AI-powered energy insights using Claude."""
import os
import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal

router = APIRouter()


class InsightRequest(BaseModel):
    annual_savings: float
    savings_pct: float
    re_ratio: float
    re_kwh: float
    carbon_reduction_tons: float
    carbon_reduction_pct: float
    total_capex: float
    payback_years: float | None
    npv: float
    irr: float | None
    net_load_kwh: float
    baseline_load_kwh: float
    export_kwh: float
    asset_types: list[str]


class Insight(BaseModel):
    type: Literal["success", "warning", "info", "tip"]
    title: str
    body: str
    metric: str | None = None


def _rule_based_insights(req: InsightRequest) -> list[Insight]:
    """Fallback rule-based insights when no API key is present."""
    insights: list[Insight] = []

    if req.annual_savings > 0:
        insights.append(Insight(
            type="success", title="電費節省顯著",
            body=f"導入再生能源資產後，年度電費節省 {req.savings_pct*100:.1f}%，相當於每月減少約 NT$ {req.annual_savings/12:,.0f} 的電費支出。",
            metric=f"NT$ {req.annual_savings:,.0f} / 年",
        ))

    if req.re_ratio < 0.10:
        insights.append(Insight(
            type="tip", title="RE 比例仍有提升空間",
            body="目前再生能源使用比例低於 10%。建議評估擴大太陽能裝置容量或導入儲能系統，以提高自發自用比例。",
            metric=f"當前 RE% = {req.re_ratio*100:.1f}%",
        ))
    elif req.re_ratio >= 0.30:
        insights.append(Insight(
            type="success", title="高再生能源比例",
            body=f"RE% 達 {req.re_ratio*100:.1f}%，已超越 30% 的綠能採購目標門檻，有助於 ESG 報告與 RE100 承諾。",
            metric=f"RE% = {req.re_ratio*100:.1f}%",
        ))

    if req.payback_years is not None and req.payback_years > 15:
        insights.append(Insight(
            type="warning", title="回本期較長",
            body=f"目前模擬方案回本期約 {req.payback_years:.1f} 年，建議重新評估資產配置組合，或申請政府補助以降低初始投資成本。",
            metric=f"回本 {req.payback_years:.1f} 年",
        ))
    elif req.payback_years is not None and req.payback_years <= 7:
        insights.append(Insight(
            type="success", title="投資效益優異",
            body=f"回本期僅 {req.payback_years:.1f} 年，IRR {(req.irr or 0)*100:.1f}%，遠超一般企業資金成本，建議積極推動。",
            metric=f"IRR {(req.irr or 0)*100:.1f}%",
        ))

    if req.export_kwh > req.re_kwh * 0.3:
        insights.append(Insight(
            type="tip", title="餘電比例偏高",
            body="超過 30% 的 RE 發電量無法自用而售回電網，建議導入儲能系統在尖峰時段放電，可進一步提升自用率與節省需量費。",
        ))

    if "storage" not in req.asset_types and req.re_ratio > 0:
        insights.append(Insight(
            type="info", title="考慮搭配儲能系統",
            body="目前配置缺乏儲能（BESS），導入儲能可在離峰充電、尖峰放電，削減基本電費（需量費）並提升 RE 自用率。",
        ))

    return insights[:5]


def _build_prompt(req: InsightRequest) -> str:
    assets_str = "、".join(set(req.asset_types)) if req.asset_types else "無"
    return f"""你是一位台灣能源顧問，請根據以下企業能源數位孿生模擬結果，給出 4-5 條專業的中文洞察與建議。

## 模擬結果摘要
- 年度電費節省：NT$ {req.annual_savings:,.0f}（{req.savings_pct*100:.1f}%）
- 再生能源比例（RE%）：{req.re_ratio*100:.1f}%
- RE 發電量：{req.re_kwh/1000:.1f} MWh（其中餘電售回 {req.export_kwh/1000:.1f} MWh）
- 年減碳：{req.carbon_reduction_tons:.1f} tCO₂e（{req.carbon_reduction_pct*100:.1f}%）
- 總投資（CAPEX）：NT$ {req.total_capex:,.0f}
- 回本期：{f"{req.payback_years:.1f} 年" if req.payback_years else "無法回本"}
- NPV：NT$ {req.npv:,.0f}
- IRR：{f"{(req.irr or 0)*100:.1f}%" if req.irr else "N/A"}
- 已導入資產：{assets_str}
- 基準用電量：{req.baseline_load_kwh/1000:.1f} MWh / 年

## 要求
請以 JSON 陣列格式回覆，每條洞察包含：
- type: "success" | "warning" | "info" | "tip"
- title: 簡短標題（10字以內）
- body: 具體說明與行動建議（50-80字）
- metric: 關鍵數字（選填）

只回覆 JSON，不要其他文字。格式範例：
[{{"type":"success","title":"...","body":"...","metric":"..."}}]"""


async def _call_claude(req: InsightRequest) -> list[Insight]:
    try:
        import anthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return _rule_based_insights(req)

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": _build_prompt(req)}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        return [Insight(**item) for item in data]
    except Exception:
        return _rule_based_insights(req)


@router.post("", response_model=list[Insight])
async def get_insights(req: InsightRequest):
    return await _call_claude(req)
