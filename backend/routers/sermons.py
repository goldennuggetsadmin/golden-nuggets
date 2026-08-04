"""Admin: Sermon CRUD, list, publish, feature, bulk, archive, duplicate."""
from datetime import datetime, timezone
from typing import Optional
import asyncio
import logging
import re

logger = logging.getLogger("sermons_router")

from fastapi import APIRouter, Depends, HTTPException, Query, Request
import uuid

from auth import require_admin
from models import Sermon, SermonCreate, SermonUpdate, BulkActionRequest
from services.sermon_service import SermonService
from services.serialization import clean, clean_list

# ── Series validation (shared definition) ───────────────────────────────────
VALID_SERIES = {
    "General", "My Life Story", "How the Angel Came to Me",
    "The Revelation of the Seven Seals", "The Revelation of Jesus Christ",
    "Conduct, Order, and Doctrine of the Church", "The Book of Hebrews",
    "The Holy Ghost", "Adoption", "The Seventy Weeks of Daniel",
    "The Church", "Demonology", "Israel and the Church",
    "The Church Age Book (audio)",
}
_SERMON_CODE_RE = re.compile(r"^\d{2}-\d{4}[A-Za-z]?$")

def _resolve_series(value) -> str:
    if not value or not str(value).strip():
        return "General"
    v = str(value).strip()
    if _SERMON_CODE_RE.match(v) or v not in VALID_SERIES:
        return "General"
    return v

router = APIRouter(prefix="/api/v1/admin/sermons", tags=["admin:sermons"])

@router.get("")
async def list_sermons(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    series: Optional[str] = None,
    year: Optional[str] = None,
    language: Optional[str] = None,
    category_id: Optional[str] = None,
    source: Optional[str] = None,
    featured: Optional[bool] = None,
    include_archived: bool = False,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    page_size: int = 20,
    _=Depends(require_admin),
):
    service = SermonService()
    try:
        result = await asyncio.wait_for(
            service.search_sermons(
                query=q, status=status, series=series, year=year, language=language,
                category_id=category_id, source=source, featured=featured,
                include_archived=include_archived, sort=sort, order=order,
                page=page, page_size=page_size
            ),
            timeout=5.0
        )
        return result
    except Exception as e:
        logger.warning(f"Sermon search failed: {e}")
        return {"items": [], "total": 0, "page": page, "page_size": page_size}


@router.get("/years")
async def list_years(_=Depends(require_admin)):
    try:
        service = SermonService()
        years = await asyncio.wait_for(service.get_distinct_years(), timeout=5.0)
        return {"items": years}
    except Exception as e:
        logger.warning(f"Sermon list_years failed: {e}")
        return {"items": []}


@router.get("/{sermon_id}")
async def get_sermon(sermon_id: str, _=Depends(require_admin)):
    service = SermonService()
    return await service.get_sermon(sermon_id)


@router.post("", response_model=Sermon)
async def create_sermon(body: SermonCreate, request: Request, current=Depends(require_admin)):
    service = SermonService()
    data = body.model_dump()
    data["series"] = _resolve_series(data.get("series"))  # Guard: never allow sermon codes as series
    sermon = Sermon(**data)
    doc = await service.create_sermon(sermon.model_dump(), current, request)
    
    import asyncio
    from services.transcript_service import process_sermon_transcripts
    asyncio.create_task(process_sermon_transcripts(doc["id"]))
    
    return doc


@router.patch("/{sermon_id}", response_model=Sermon)
async def update_sermon(sermon_id: str, body: SermonUpdate, request: Request, current=Depends(require_admin)):
    service = SermonService()
    updates = body.model_dump(exclude_unset=True)
    if "series" in updates:
        updates["series"] = _resolve_series(updates["series"])  # Guard: validate series on every update
    doc = await service.update_sermon(sermon_id, updates, current, request)
    
    import asyncio
    from services.transcript_service import process_sermon_transcripts
    asyncio.create_task(process_sermon_transcripts(doc["id"]))
    
    return doc


@router.delete("/{sermon_id}")
async def delete_sermon(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    await service.delete_sermon(sermon_id, current, request)
    return {"ok": True}


@router.post("/{sermon_id}/publish")
async def publish(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    await service.publish_sermon(sermon_id, current, request)
    return {"ok": True}


@router.post("/{sermon_id}/unpublish")
async def unpublish(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    await service.unpublish_sermon(sermon_id, current, request)
    return {"ok": True}


@router.post("/{sermon_id}/toggle-featured")
async def toggle_featured(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    new_val = await service.toggle_featured(sermon_id, current, request)
    return {"featured": new_val}


@router.post("/{sermon_id}/archive")
async def archive(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    await service.archive_sermon(sermon_id, current, request)
    return {"ok": True}


@router.post("/{sermon_id}/restore")
async def restore(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    await service.restore_sermon(sermon_id, current, request)
    return {"ok": True}


@router.post("/{sermon_id}/duplicate")
async def duplicate_sermon(sermon_id: str, request: Request, current=Depends(require_admin)):
    service = SermonService()
    return await service.duplicate_sermon(sermon_id, current, request)


@router.post("/bulk")
async def bulk_action(body: BulkActionRequest, request: Request, current=Depends(require_admin)):
    service = SermonService()
    n = await service.bulk_action(body.action, body.ids, body.category_id, current, request)
    return {"updated": n}


@router.post("/{sermon_id}/re-extract-transcripts")
async def re_extract_transcripts(sermon_id: str, request: Request, current=Depends(require_admin)):
    """Re-extract transcript paragraphs from the sermon's PDF files.
    
    Works for both uploaded PDFs (via storage_path) and external PDFs (via url).
    Useful for sermons imported before transcript extraction was added.
    """
    from services.transcript_service import process_sermon_transcripts
    res = await process_sermon_transcripts(sermon_id)
    if not res.get("ok") and res.get("message") == "Sermon not found":
        raise HTTPException(status_code=404, detail="Sermon not found")
    return res


@router.post("/{sermon_id}/refresh-preview")
async def refresh_preview(sermon_id: str, body: dict, request: Request, current=Depends(require_admin)):
    service = SermonService()
    existing = await service.get_sermon(sermon_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Sermon not found")

    title_changed = body.get("title") and body.get("title") != existing.get("title")
    audio_changed = body.get("audio_url") and body.get("audio_url") != existing.get("audio_url")
    pdf_te_changed = body.get("pdf_telugu_url") and body.get("pdf_telugu_url") != existing.get("pdf_telugu_url")
    pdf_en_changed = body.get("pdf_english_url") and body.get("pdf_english_url") != existing.get("pdf_english_url")

    changes = []
    if title_changed:
        changes.append({"field": "Title", "old": existing.get("title"), "new": body.get("title")})
    if audio_changed:
        changes.append({"field": "Audio URL", "old": "Previous Audio", "new": "Updated Stream URL"})
    if pdf_te_changed:
        changes.append({"field": "Telugu PDF URL", "old": "Previous PDF", "new": "Updated PDF URL"})
    if pdf_en_changed:
        changes.append({"field": "English PDF URL", "old": "Previous PDF", "new": "Updated PDF URL"})

    return {
        "sermon_id": sermon_id,
        "existing_title": existing.get("title"),
        "changes_detected": len(changes) > 0,
        "changes": changes,
        "current_version": existing.get("current_version", 1),
        "user_data_protected": ["notes", "highlights", "bookmarks", "favorites", "reading_progress"]
    }


@router.put("/{sermon_id}/refresh")
async def refresh_sermon(sermon_id: str, body: dict, request: Request, current=Depends(require_admin)):
    service = SermonService()
    existing = await service.get_sermon(sermon_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Sermon not found")

    # 1. Version History Preservation
    curr_v = existing.get("current_version", 1)
    history = existing.get("versions", []) or []
    if existing.get("canonical_text"):
        history.append({
            "version": curr_v,
            "canonical_text": existing.get("canonical_text"),
            "canonical_text_hash": existing.get("canonical_text_hash"),
            "official_pdf_hash": existing.get("official_pdf_hash"),
            "import_report": existing.get("import_report"),
            "archived_at": datetime.now(timezone.utc).isoformat()
        })

    # 2. Update Safe Metadata (Protect User Data)
    updates = {
        "title": body.get("title") or existing.get("title"),
        "speaker": body.get("speaker") or existing.get("speaker"),
        "date": body.get("date") or existing.get("date"),
        "year": body.get("year") or existing.get("year"),
        "audio_url": body.get("audio_url") or existing.get("audio_url"),
        "artwork_url": body.get("artwork_url") or existing.get("artwork_url"),
        "pdf_telugu_url": body.get("pdf_telugu_url") or existing.get("pdf_telugu_url"),
        "pdf_english_url": body.get("pdf_english_url") or existing.get("pdf_english_url"),
        "current_version": curr_v + 1,
        "versions": history
    }

    doc = await service.update_sermon(sermon_id, updates, current, request)

    # 3. Trigger PDF re-extraction & Generate Refresh Report
    from services.transcript_service import process_sermon_transcripts
    t_result = await process_sermon_transcripts(sermon_id)

    refresh_report = {
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "previous_hash": existing.get("canonical_text_hash"),
        "new_hash": t_result.get("canonical_text_hash"),
        "current_version": curr_v + 1,
        "user_data_protected": ["notes", "highlights", "bookmarks", "favorites", "reading_progress"],
        "status": "REFRESH_SUCCESSFUL"
    }

    return {"ok": True, "sermon": doc, "refresh_report": refresh_report}
