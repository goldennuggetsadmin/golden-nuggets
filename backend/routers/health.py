"""Production Operations Health Dashboard Router (/api/v1/admin/health)."""
from fastapi import APIRouter, Depends
from auth import require_admin
from repositories.entities import sermons_repo
import hashlib

router = APIRouter(prefix="/api/v1/admin/health", tags=["admin:health"])


@router.get("/import-metrics")
async def get_import_metrics(_=Depends(require_admin)):
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
