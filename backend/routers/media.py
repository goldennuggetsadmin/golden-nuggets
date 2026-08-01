"""Admin: Media upload / list / delete / serve / replace via StorageProvider."""
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
from config.settings import settings

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, Request

from auth import require_admin
from repositories.entities import media_repo
from services import log as activity_log
from services.serialization import clean, clean_list
from providers.storage import get_storage_provider

router = APIRouter(prefix="/api/v1/admin/media", tags=["admin:media"])

ALLOWED_KINDS = {"audio", "pdf", "artwork", "banner", "other"}
MAX_SIZE = 500 * 1024 * 1024  # 500 MB


MIME_TYPES = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4", "ogg": "audio/ogg", "flac": "audio/flac",
    "pdf": "application/pdf",
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _guess_content_type(filename: str, fallback: str) -> str:
    if "." in filename:
        return MIME_TYPES.get(filename.rsplit(".", 1)[-1].lower(), fallback)
    return fallback


@router.post("/upload")
async def upload_media(
    request: Request,
    kind: str = Query(..., description="audio|pdf|artwork|banner|other"),
    file: UploadFile = File(...),
    linked_type: Optional[str] = Query(None),
    linked_id: Optional[str] = Query(None),
    current=Depends(require_admin),
):
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 500 MB limit")

    provider = get_storage_provider()
    content_type = file.content_type or _guess_content_type(file.filename or "unknown", "application/octet-stream")
    path = provider.build_upload_path(kind, file.filename or "file.bin", settings.APP_NAME)

    try:
        obj = provider.upload(path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}")

    storage_path = obj.get("path", path)
    doc = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "original_filename": file.filename,
        "content_type": content_type,
        "size": obj.get("size", len(data)),
        "storage_path": storage_path,
        "provider": obj.get("provider", provider.name),
        "public_url": None,  # NEVER persist signed URLs
        "linked_type": linked_type,
        "linked_id": linked_id,
        "is_deleted": False,
        "created_at": _now(),
    }
    await media_repo().insert(doc)

    # Update the linked entity's storage_path if applicable
    if linked_type and linked_id:
        storage_field_map = {
            "audio": "audio_storage_path",
            "artwork": "artwork_storage_path",
            "pdf": "pdf_english_storage_path",
            "banner": "banner_storage_path",
        }
        field = storage_field_map.get(kind)
        if field and linked_type == "sermon":
            from repositories.entities import sermons_repo
            await sermons_repo().update_one(
                {"id": linked_id},
                {field: storage_path, "updated_at": _now()}
            )
            # If uploaded file is a PDF, trigger background transcript extraction
            if kind == "pdf":
                import asyncio
                from services.transcript_service import extract_transcript_from_pdf_bytes
                
                async def _bg_extract(pdf_data: bytes, s_id: str):
                    result = extract_transcript_from_pdf_bytes(pdf_data)
                    result["updated_at"] = _now()
                    await sermons_repo().update_one({"id": s_id}, result)

                asyncio.create_task(_bg_extract(data, linked_id))

        elif field and linked_type == "meeting":
            from repositories.entities import meetings_repo
            await meetings_repo().update_one(
                {"id": linked_id},
                {field: storage_path, "updated_at": _now()}
            )

    await activity_log(actor=current, action="media_uploaded", entity_type="media", entity_id=doc["id"], message=f"Uploaded {file.filename} ({obj.get('size')} B)", request=request, metadata={"kind": kind, "size": obj.get('size')})
    return doc


@router.post("/{media_id}/replace")
async def replace_media(
    media_id: str,
    request: Request,
    file: UploadFile = File(...),
    current=Depends(require_admin),
):
    repo = media_repo()
    rec = await repo.find_one({"id": media_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 500 MB limit")

    provider = get_storage_provider()
    content_type = file.content_type or _guess_content_type(file.filename or rec["original_filename"], rec.get("content_type", "application/octet-stream"))
    new_path = provider.build_upload_path(rec["kind"], file.filename or rec["original_filename"], settings.APP_NAME)
    obj = provider.upload(new_path, data, content_type)

    old_path = rec["storage_path"]
    await repo.update_one({"id": media_id}, {
        "storage_path": obj.get("path", new_path),
        "content_type": content_type,
        "size": obj.get("size", len(data)),
        "original_filename": file.filename,
        "updated_at": _now(),
    })
    try:
        provider.delete(old_path)
    except Exception:
        pass
    doc = await repo.find_one({"id": media_id})
    await activity_log(actor=current, action="media_replaced", entity_type="media", entity_id=media_id, request=request)
    return clean(doc)


@router.get("")
async def list_media(
    kind: Optional[str] = None, 
    q: Optional[str] = None, 
    page: int = 1,
    page_size: int = 20,
    _=Depends(require_admin)
):
    filt = {"is_deleted": False}
    if kind:
        filt["kind"] = kind
    if q:
        filt["original_filename"] = {"$regex": q, "$options": "i"}
        
    repo = media_repo()
    total = await repo.count(filt)
    items = await repo.find(filt, sort=[("created_at", -1)], skip=(page - 1) * page_size, limit=page_size)
    return {"items": clean_list(items), "total": total}


@router.get("/usage")
async def usage(_=Depends(require_admin)):
    total = 0
    by_kind: dict = {}
    for d in await media_repo().find({"is_deleted": False}, projection={"size": 1, "kind": 1}):
        total += int(d.get("size", 0) or 0)
        by_kind[d.get("kind", "other")] = by_kind.get(d.get("kind", "other"), 0) + int(d.get("size", 0) or 0)
    return {"total_bytes": total, "by_kind": by_kind}


@router.delete("/{media_id}")
async def delete_media(media_id: str, request: Request, current=Depends(require_admin)):
    repo = media_repo()
    rec = await repo.find_one({"id": media_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    await repo.update_one({"id": media_id}, {"is_deleted": True, "deleted_at": _now()})
    try:
        get_storage_provider().delete(rec["storage_path"])
    except Exception:
        pass
    await activity_log(actor=current, action="media_deleted", entity_type="media", entity_id=media_id, request=request)
    return {"ok": True}


@router.get("/file/{media_id}")
async def serve_media(media_id: str, _=Depends(require_admin)):
    rec = await media_repo().find_one({"id": media_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        data, content_type = get_storage_provider().stream(rec["storage_path"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage error: {e}")
    return Response(content=data, media_type=rec.get("content_type", content_type))
