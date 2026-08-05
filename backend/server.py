import os
import logging
from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from db import connect, disconnect
from config import settings
from providers.storage import get_storage_provider

# Routers
from routers.sermons import router as sermons_router
from routers.meetings import router as meetings_router
from routers.categories import router as categories_router
from routers.media import router as media_router
from routers.import_center import router as import_router
from routers.dashboard import router as dashboard_router
from routers.settings import router as settings_router
from routers.activity import router as activity_router
from routers.home import router as home_router
from routers.notifications import router as notifications_router
from routers.mobile import router as mobile_router
from routers.health import router as health_router
from routers.transcript_review import router as transcript_review_router

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.rate_limit import limiter
logger = logging.getLogger(__name__)

app = FastAPI(title="Golden Nuggets Admin API", version="1.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.error(f"Global exception on {request.url.path}: {exc}\n{tb}")
    return JSONResponse(status_code=500, content={"error": str(exc), "type": type(exc).__name__, "path": request.url.path})
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS setup — support credentials with dynamic origin reflection for web admin & mobile clients
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    import time
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = (time.perf_counter() - start_time) * 1000
    response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
    return response

from auth import auth_router

# Auth
app.include_router(auth_router)

# Admin API v1
app.include_router(sermons_router)
app.include_router(meetings_router)
app.include_router(categories_router)
app.include_router(media_router)
app.include_router(import_router)
app.include_router(transcript_review_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(activity_router)
app.include_router(home_router)
app.include_router(notifications_router)
app.include_router(health_router)

# Mobile API v1 (public)
app.include_router(mobile_router)

@app.get("/api/v1/admin/fix_db")
async def fix_db():
    from repositories.postgres import get_pool
    pool = get_pool()
    async with pool.acquire() as conn:
        migrations = [
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_start_page integer;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_start_paragraph integer;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_end_page integer;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_end_paragraph integer;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript TEXT;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcripts JSONB;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_page_count integer DEFAULT 0;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_paragraph_count integer DEFAULT 0;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_parsed boolean DEFAULT false;",
            "ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_parser_version TEXT DEFAULT '5.0-canonical-preservation';",
        ]
        for sql in migrations:
            await conn.execute(sql)
    return {"status": "ok", "migrations_run": len(migrations)}


@app.get("/")
async def root_index():
    return {"service": "golden-nuggets-admin", "version": "1.0.0", "ok": True}


@app.get("/health")
async def health_root():
    return {"status": "healthy"}


@app.get("/api/")
async def root():
    return {"service": "golden-nuggets-admin", "version": "1.0.0", "ok": True}


@app.get("/api/v1/health")
async def health():
    try:
        storage_name = get_storage_provider().name
    except Exception:
        storage_name = "unconfigured"
    return {"status": "healthy", "storage": storage_name}


def _validate_startup_environment():
    """Verify essential packages, environment settings, and directories on backend startup."""
    REQUIRED_PACKAGES = [
        "fastapi", "uvicorn", "asyncpg", "httpx", "pdfplumber",
        "cachetools", "supabase", "pydantic", "jose", "passlib"
    ]
    missing = []
    for pkg in REQUIRED_PACKAGES:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        msg = f"CRITICAL STARTUP FAILURE: Missing required Python packages: {missing}. Please run `pip install -r requirements.txt`."
        logger.critical(msg)
        raise RuntimeError(msg)

    if not settings.DATABASE_URL:
        msg = "CRITICAL STARTUP FAILURE: DATABASE_URL is not set."
        logger.critical(msg)
        raise RuntimeError(msg)


@app.on_event("startup")
async def on_startup():
    logger.info("================================──────────────────────────────")
    logger.info("🚀 Golden Nuggets Backend Starting Up...")
    logger.info("Environment: %s", os.environ.get("ENVIRONMENT", "development"))
    _validate_startup_environment()
    logger.info("Initializing database connection pool on startup...")
    await connect()
    try:
        provider = get_storage_provider()
        logger.info("Storage provider ready: %s", provider.name)
    except Exception as e:
        logger.warning(f"Storage provider init failed at startup: {e}")
    logger.info("✅ Startup Validation Complete — System Operational!")
    logger.info("================================──────────────────────────────")


@app.on_event("shutdown")
async def on_shutdown():
    await disconnect()



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
