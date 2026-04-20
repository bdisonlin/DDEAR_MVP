"""Financial metrics: Payback, NPV, IRR."""
import numpy as np


def calculate_roi(
    annual_savings: float,
    total_capex: float,
    annual_om: float,
    years: int = 20,
    discount_rate: float = 0.05,
) -> dict:
    if total_capex <= 0:
        return {"payback_years": 0, "npv": annual_savings * years, "irr": None, "cash_flows": []}

    net_annual = annual_savings - annual_om
    payback = total_capex / net_annual if net_annual > 0 else float("inf")

    cash_flows = [-total_capex] + [net_annual] * years
    npv = float(np.npv(discount_rate, cash_flows)) if hasattr(np, "npv") else _npv(discount_rate, cash_flows)
    irr = _irr(cash_flows)

    cumulative = np.cumsum(cash_flows)
    return {
        "payback_years": payback,
        "npv": npv,
        "irr": irr,
        "cash_flows": cash_flows,
        "cumulative_cash_flows": cumulative.tolist(),
        "net_annual_benefit": net_annual,
    }


def _npv(rate: float, cash_flows: list) -> float:
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))


def _irr(cash_flows, iterations=200, tol=1e-7):
    rate = 0.10
    for _ in range(iterations):
        f = sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))
        df = sum(-t * cf / (1 + rate) ** (t + 1) for t, cf in enumerate(cash_flows))
        if abs(df) < tol:
            break
        rate -= f / df
        if rate <= -1:
            return None
    residual = abs(sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows)))
    return rate if residual < 1.0 else None
