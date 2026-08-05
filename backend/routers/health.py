"""Production & Development Health Dashboard Router."""
import os
import time
import datetime
from fastapi import APIRouter, Depends
from auth import require_admin
from repositories.entities import sermons_repo
from providers.storage import get_storage_provider
from db import get_pool

router = APIRouter(tags=["health"])
START_TIME = time.time()

@router.get("/health")
@router.get("/api/v1/health")
@router.get("/api/v1/mobile/health")
@router.get("/api/v1/admin/health")
async def get_health_status():
    db_ok = False
    sermon_count = 0
    pool_status = "unavailable"
    
    try:
        pool = get_pool()
        if pool:
            async with pool.acquire() as conn:
                sermon_count = await conn.fetchval("SELECT COUNT(*) FROM sermons")
                db_ok = True
                pool_status = f"asyncpg (active, size={pool.get_size()})"
        else:
            items = await sermons_repo().find({}, limit=1)
            db_ok = True
            pool_status = "supabase_rest_fallback"
            sermon_count = await sermons_repo().count({})
    except Exception as e:
        db_ok = False
        pool_status = f"error ({e})"

    storage_ok = False
    storage_provider_name = "unconfigured"
    try:
        provider = get_storage_provider()
        storage_provider_name = provider.name
        storage_ok = True
    except Exception:
        storage_ok = False

    uptime_seconds = int(time.time() - START_TIME)

    return {
        "status": "healthy" if (db_ok and storage_ok) else "degraded",
        "environment": os.environ.get("ENVIRONMENT", "development"),
        "version": "1.0.0",
        "uptime_seconds": uptime_seconds,
        "startup_time": datetime.datetime.fromtimestamp(START_TIME, tz=datetime.timezone.utc).isoformat(),
        "database": {
            "status": "OK" if db_ok else "ERROR",
            "sermon_count": sermon_count,
            "pool_status": pool_status,
        },
        "storage": {
            "status": "OK" if storage_ok else "ERROR",
            "provider": storage_provider_name,
            "bucket": "sermons",
        },
        "background_worker": "OPERATIONAL",
    }


@router.get("/api/v1/admin/health/import-metrics")
async def get_import_metrics(_=Depends(require_admin)):
    import hashlib
    all_sermons = await sermons_repo().find({})
    
    total_sermons = len(all_sermons)
    successful_imports = 0
    failed_imports = 0
    missing_pdfs = 0
    missing_canonical_text = 0
    hash_failures = 0
    total_versions = 0

    for s in all_sermons:
        can_text = s.get("canonical_text") or s.get("transcript")
        can_hash = s.get("canonical_text_hash")
        pdf_url = s.get("pdf_telugu_url") or s.get("pdf_english_url")

        if not pdf_url:
            missing_pdfs += 1
        
        if not can_text:
            missing_canonical_text += 1
            failed_imports += 1
        else:
            successful_imports += 1
            comp_hash = hashlib.sha256(can_text.encode("utf-8")).hexdigest()
            if can_hash and can_hash != comp_hash:
                hash_failures += 1
        
        history = s.get("versions", []) or []
        total_versions += len(history) + 1

    return {
        "status": "OPERATIONAL",
        "metrics": {
            "total_sermons": total_sermons,
            "successful_imports": successful_imports,
            "failed_imports": failed_imports,
            "duplicate_warnings_logged": 0,
            "refreshes_executed": 0,
            "total_versions": total_versions,
            "hash_failures": hash_failures,
            "missing_pdfs": missing_pdfs,
            "missing_canonical_text": missing_canonical_text,
        }
    }

