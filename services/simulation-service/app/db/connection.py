"""
Database connections — PostgreSQL (SQLAlchemy) + Redis.

Both clients are module-level singletons.  If DATABASE_URL / REDIS_URL are
not set (plain local dev without Docker), the module still imports safely;
store.py falls back to in-memory mode in that case.
"""
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "")
REDIS_URL    = os.getenv("REDIS_URL", "")

# ── PostgreSQL ─────────────────────────────────────────────────────────────────
engine    = None
_DB_MODE  = False
if DATABASE_URL:
    try:
        from sqlalchemy import create_engine
        engine   = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _DB_MODE = True
    except Exception as exc:  # pragma: no cover
        logger.warning("PostgreSQL unavailable — falling back to in-memory store: %s", exc)

# ── Redis ──────────────────────────────────────────────────────────────────────
redis_client = None
if REDIS_URL:
    try:
        import redis as _redis
        redis_client = _redis.from_url(REDIS_URL, decode_responses=False)
        redis_client.ping()   # fail fast if Redis is unreachable at startup
    except Exception as exc:  # pragma: no cover
        logger.warning("Redis unavailable — cache disabled: %s", exc)
        redis_client = None

# TTLs
BASELINE_TTL_S  = 86_400   # 24 h — keep hot baselines in Redis
SIM_RESULT_TTL_S = 3_600   #  1 h — simulation result cache


# ── Schema bootstrap ───────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS re_generation_profiles (
    source_type  VARCHAR(32)  NOT NULL,
    year         INTEGER      NOT NULL,
    series_gz    BYTEA        NOT NULL,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (source_type, year)
);

CREATE TABLE IF NOT EXISTS baselines (
    id              VARCHAR(12)  PRIMARY KEY,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    date_start      DATE         NOT NULL,
    date_end        DATE         NOT NULL,
    peak_kw         FLOAT        NOT NULL,
    avg_kw          FLOAT        NOT NULL,
    total_kwh       FLOAT        NOT NULL,
    voltage         VARCHAR(10)  NOT NULL DEFAULT 'high',
    contracted_kw   FLOAT,
    bill_type       VARCHAR(20)  NOT NULL DEFAULT 'tiered',
    num_intervals   INT          NOT NULL,
    series_gz       BYTEA        NOT NULL
);

CREATE TABLE IF NOT EXISTS tariff_presets (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    config_json JSONB        NOT NULL
);
"""


def init_db() -> None:
    """Create tables if they don't exist. Called once at service startup."""
    if engine is None:
        logger.info("No DATABASE_URL — skipping schema init (in-memory mode)")
        return
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(_DDL))
        conn.commit()
    logger.info("PostgreSQL schema ready")
