"""DDEAR Simulation Service — FastAPI entry point."""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import baseline, simulate, assets, insights, demand_response, monthly_bill, settings, strategy

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    try:
        from app.db.connection import init_db
        init_db()
    except Exception as exc:
        logger.warning("DB init failed — continuing in in-memory mode: %s", exc)

    # Pre-compute RE generation profiles for recent years and store in PostgreSQL.
    # Runs on every cold start; ON CONFLICT DO NOTHING skips already-stored rows,
    # so this is safe and fast after the first deployment in any environment.
    try:
        import asyncio
        from datetime import datetime
        from app.core.re_profiles import prewarm_profiles
        current_year = datetime.now().year
        years = list(range(current_year - 4, current_year + 3))
        await asyncio.to_thread(prewarm_profiles, years)
        logger.info("RE profile prewarm complete: %s", years)
    except Exception as exc:
        logger.warning("RE profile prewarm failed (non-fatal): %s", exc)

    yield
    # ── Shutdown (nothing to clean up) ─────────────────────────────────────────


app = FastAPI(
    title="DDEAR Simulation Service",
    description="Energy Digital Twin — scenario simulation & ROI API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — tighten ALLOWED_ORIGINS in production via env var
origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(baseline.router,         prefix="/api/v1/baseline",          tags=["baseline"])
app.include_router(simulate.router,         prefix="/api/v1/simulate",          tags=["simulate"])
app.include_router(assets.router,           prefix="/api/v1/assets",            tags=["assets"])
app.include_router(insights.router,         prefix="/api/v1/insights",          tags=["insights"])
app.include_router(demand_response.router,  prefix="/api/v1/demand_response",   tags=["demand_response"])
app.include_router(monthly_bill.router,     prefix="/api/v1/baseline/monthly",  tags=["baseline"])
app.include_router(settings.router,         prefix="/api/v1/settings",          tags=["settings"])
app.include_router(strategy.router,         prefix="/api/v1/strategy",          tags=["strategy"])


@app.get("/health", tags=["health"])
def health():
    from app.db.connection import engine, redis_client
    return {
        "status":   "ok",
        "service":  "simulation-service",
        "version":  "1.0.0",
        "db":       "postgres" if engine is not None else "in-memory",
        "cache":    "redis"    if redis_client is not None else "disabled",
    }
