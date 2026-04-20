"""DDEAR Simulation Service — FastAPI entry point."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import baseline, simulate, assets, insights, demand_response, monthly_bill

app = FastAPI(
    title="DDEAR Simulation Service",
    description="Energy Digital Twin — scenario simulation & ROI API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — tighten ALLOWED_ORIGINS in production via env var
origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(baseline.router, prefix="/api/v1/baseline", tags=["baseline"])
app.include_router(simulate.router, prefix="/api/v1/simulate", tags=["simulate"])
app.include_router(assets.router,   prefix="/api/v1/assets",   tags=["assets"])
app.include_router(insights.router,         prefix="/api/v1/insights",        tags=["insights"])
app.include_router(demand_response.router,  prefix="/api/v1/demand_response",  tags=["demand_response"])
app.include_router(monthly_bill.router,     prefix="/api/v1/baseline/monthly",  tags=["baseline"])


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": "simulation-service", "version": "1.0.0"}
