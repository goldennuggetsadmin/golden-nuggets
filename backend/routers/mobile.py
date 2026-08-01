"""Mobile: public-facing APIs consumed by the React Native app.

These endpoints return published content only. No auth required on read
endpoints; analytics event can carry a device_id for aggregation.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, HTTPException, Query, Response

from config.settings import settings
from models import MobileEvent
from repositories.entities import sermons_repo, meetings_repo, categories_repo, home_repo, analytics_repo, media_repo, notifications_repo
from services.serialization import clean_list
from services.sermon_service import filter_sermons_by_series
from providers.storage import get_storage_provider

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_external_url(value: str) -> bool:
    """Return True if the value is an external permanent URL (not a Supabase storage_path)."""
    return value.startswith("http://") or value.startswith("https://")


def _is_admin_media_ref(value: str) -> bool:
    """Return True if the value is an internal admin media file reference."""
    return "/api/v1/admin/media/file/" in value


async def _resolve_media_url(
    storage_path: Optional[str],
    legacy_url: Optional[str],
) -> Optional[str]:
    """Resolve a media field to a usable URL for the mobile app.
    
    Architecture:
    1. If storage_path exists → generate a fresh signed URL (Supabase media)
    2. If legacy_url is an external URL → pass through as-is (imported media)
    3. If legacy_url is an admin media ref → look up storage_path from media_assets → signed URL
    4. Otherwise → None
    
    Signed URLs are NEVER stored. They are generated fresh on every request.
    """
    provider = get_storage_provider()
    import asyncio
    ttl = settings.MEDIA_URL_TTL

    # Priority 1: storage_path → fresh signed URL
    if storage_path:
        try:
            url = await asyncio.to_thread(provider.create_signed_url, storage_path, ttl)
            if url:
                return url
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for {storage_path}: {e}")

    # Priority 2: legacy URL handling
    if not legacy_url:
        return None

    # External permanent URL (e.g. branham.org) → pass through
    if _is_external_url(legacy_url) and not _is_admin_media_ref(legacy_url):
        return legacy_url

    # Admin media reference → resolve from media_assets table
    if _is_admin_media_ref(legacy_url):
        try:
            media_id = legacy_url.split("/api/v1/admin/media/file/")[-1]
            rec = await media_repo().find_one({"id": media_id, "is_deleted": False})
            if rec and rec.get("storage_path"):
                url = await asyncio.to_thread(provider.create_signed_url, rec["storage_path"], ttl)
                if url:
                    return url
            # Fallback: serve via mobile proxy endpoint
            return f"/api/v1/mobile/media/file/{media_id}"
        except Exception as e:
            logger.warning(f"Failed to resolve media ref {legacy_url}: {e}")

    return legacy_url


async def _project_sermon(s: dict) -> dict:
    """Shape a sermon for mobile consumption.
    
    For each media field, resolve using storage_path (preferred) or legacy URL.
    Signed URLs are generated fresh on every call — never stored in DB.
    """
    audio_url = await _resolve_media_url(
        s.get("audio_storage_path"), s.get("audio_url")
    )
    artwork_url = await _resolve_media_url(
        s.get("artwork_storage_path"), s.get("artwork_url")
    )
    pdf_english_url = await _resolve_media_url(
        s.get("pdf_english_storage_path"), s.get("pdf_english_url")
    )
    pdf_telugu_url = await _resolve_media_url(
        s.get("pdf_telugu_storage_path"), s.get("pdf_telugu_url")
    )

    return {
        "id": s.get("id"),
        "title": s.get("title"),
        "speaker": s.get("speaker"),
        "series": s.get("series"),
        "year": s.get("year"),
        "date": s.get("date"),
        "language": s.get("language"),
        "description": s.get("description"),
        "duration": s.get("duration"),
        "location": s.get("location"),
        "state": s.get("state"),
        "tags": s.get("tags", []),
        "category_ids": s.get("category_ids", []),
        "featured": bool(s.get("featured")),
        "sermon_code": s.get("sermon_code"),
        "source": s.get("source"),  # "manual" | "import"
        "audio_url": audio_url,
        "playable": bool(audio_url),
        "artwork_url": artwork_url,
        "pdf_english_url": pdf_english_url,
        "pdf_telugu_url": pdf_telugu_url,
        "canonical_text": s.get("canonical_text") or s.get("transcript"),
        "canonical_text_hash": s.get("canonical_text_hash"),
        "official_pdf_hash": s.get("official_pdf_hash"),
        "import_engine": s.get("import_engine"),
        "import_report": s.get("import_report"),
        "transcripts": s.get("transcripts", []) or ([{"language": s.get("language") or "English", "text": s.get("canonical_text") or s.get("transcript"), "paragraphs": [{"text": p.strip(), "paragraph_number": i + 1} for i, p in enumerate(((s.get("canonical_text") or s.get("transcript")) or "").split("\n\n")) if p.strip()]}] if (s.get("canonical_text") or s.get("transcript")) else []),
        "transcript_page_count": s.get("transcript_page_count", 0),
        "transcript_paragraph_count": s.get("transcript_paragraph_count", 0),
        "transcript_parsed": bool(s.get("transcript_parsed")) or bool(s.get("canonical_text")) or bool(s.get("transcript")),
        "created_at": s.get("created_at"),
    }


async def _project_meeting(m: dict) -> dict:
    banner_url = await _resolve_media_url(
        m.get("banner_storage_path"), m.get("banner_url")
    )
    return {
        "id": m.get("id"),
        "title": m.get("title"),
        "speaker": m.get("speaker"),
        "description": m.get("description"),
        "start_date": m.get("start_date"),
        "end_date": m.get("end_date"),
        "time": m.get("time"),
        "location": m.get("location"),
        "google_maps_url": m.get("google_maps_url"),
        "youtube_url": m.get("youtube_url"),
        "registration_link": m.get("registration_link"),
        "banner_url": banner_url,
        "featured": bool(m.get("featured")),
        "status": m.get("status"),
    }


# ---------- Sermons ----------
@router.get("/sermons")
async def list_sermons(
    q: Optional[str] = Query(None),
    language: Optional[str] = None,
    category_id: Optional[str] = None,
    year: Optional[str] = None,
    series: Optional[str] = None,
    category: Optional[str] = None,
    featured: Optional[bool] = None,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    page_size: int = 1000,
):
    filt: dict = {"status": "published", "is_archived": {"$ne": True}}
    if q and isinstance(q, str):
        filt["title"] = {"$regex": q, "$options": "i"}
    if language:
        filt["language"] = language
    if year:
        filt["year"] = year
    
    # Single source of truth series/category query filter via shared sermon_service
    requested_series = series or category

    if category_id:
        filt["category_ids"] = category_id
    if featured is not None:
        filt["featured"] = featured

    repo = sermons_repo()
    raw_items = await repo.find(
        filt,
        sort=[(sort, -1 if order == "desc" else 1)],
    )
    items = filter_sermons_by_series(raw_items, requested_series)
    total = len(items)
    
    # Apply pagination on filtered items
    start_idx = max(0, (page - 1) * page_size)
    paginated_items = items[start_idx : start_idx + page_size]

    projected_items = []
    for s in paginated_items:
        projected_items.append(await _project_sermon(s))
    return {"items": projected_items, "total": total, "page": page, "page_size": page_size}


@router.get("/sermons/{sermon_id}")
async def get_sermon(sermon_id: str):
    doc = None
    import re
    if re.match(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", sermon_id):
        try:
            doc = await sermons_repo().find_one({"id": sermon_id, "status": "published"})
        except Exception:
            doc = None
    
    if not doc:
        try:
            doc = await sermons_repo().find_one({"code": sermon_id, "status": "published"})
        except Exception:
            doc = None
    if not doc:
        try:
            doc = await sermons_repo().find_one({"audio_id": sermon_id, "status": "published"})
        except Exception:
            doc = None
    if not doc:
        items = await sermons_repo().find({"status": "published"})
        for s in items:
            if s.get("id") == sermon_id or s.get("code") == sermon_id or s.get("audio_id") == sermon_id or (s.get("title") and sermon_id.lower() in s.get("title").lower()):
                doc = s
                break

    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return await _project_sermon(doc)


@router.get("/media/file/{media_id}")
async def serve_public_media_file(media_id: str):
    """Public media proxy for mobile app — serves media files without requiring admin authentication."""
    rec = await media_repo().find_one({"id": media_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        data, content_type = get_storage_provider().stream(rec["storage_path"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage error: {e}")
    return Response(content=data, media_type=rec.get("content_type", content_type))


@router.get("/media/{media_path:path}")
async def stream_media(media_path: str):
    """Proxy stream endpoint for provider-hosted files."""
    try:
        data, content_type = get_storage_provider().stream(media_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Media not available: {e}")
    return Response(content=data, media_type=content_type)


# ---------- Meetings ----------
@router.get("/meetings")
async def list_meetings(status: Optional[str] = None):
    filt = {"is_archived": {"$ne": True}, "status": {"$in": ["upcoming", "live", "completed"] if not status else [status]}}
    items = await meetings_repo().find(filt, sort=[("start_date", 1)], limit=200)
    projected = []
    for m in items:
        projected.append(await _project_meeting(m))
    return {"items": projected, "total": len(items)}


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    doc = await meetings_repo().find_one({"id": meeting_id})
    if not doc or doc.get("is_archived"):
        raise HTTPException(status_code=404, detail="Not found")
    return await _project_meeting(doc)


# ---------- Categories ----------
@router.get("/categories")
async def list_categories():
    items = await categories_repo().find({}, sort=[("name", 1)])
    return {"items": clean_list(items), "total": len(items)}


# ---------- Notifications ----------
@router.get("/notifications")
async def get_mobile_notifications(language: Optional[str] = None):
    filt = {"status": "published"}
    if language:
        filt["$or"] = [{"audience": "all"}, {"audience": "language", "language": {"$regex": f"^{language}$", "$options": "i"}}]
        
    items = await notifications_repo().find(filt, sort=[("delivered_at", -1)], limit=50)
    return {"items": clean_list(items), "total": len(items)}


# ---------- Home ----------
@router.get("/home")
async def home(language: Optional[str] = None):
    """Aggregated payload for the mobile home screen — driven by Home Management.
    
    language: optional ISO-639-1 code (en, te) to filter featured and recently-added sermons.
    Upcoming meetings are intentionally excluded from language filtering.
    """
    home = await home_repo().find_one({"id": "global"}) or {}
    sermons = sermons_repo()
    meetings = meetings_repo()
    categories = categories_repo()

    # Build language filter for sermons (case-insensitive if set)
    lang_filt = {}
    if language:
        lang_filt["language"] = {"$regex": f"^{language}$", "$options": "i"}

    featured_ids = home.get("featured_sermon_ids", []) or []
    featured = []
    for sid in featured_ids:
        filt = {"id": sid, "status": "published", **lang_filt}
        s = await sermons.find_one(filt)
        if s:
            featured.append(await _project_sermon(s))

    recent = []
    if home.get("show_recently_added", True):
        recent_filt = {"status": "published", "is_archived": {"$ne": True}, **lang_filt}
        rows = await sermons.find(
            recent_filt,
            sort=[("created_at", -1)],
            limit=home.get("recently_added_count") or 6,
        )
        for s in rows:
            recent.append(await _project_sermon(s))

    # Meetings are ALWAYS shown regardless of language
    upcoming = []
    if home.get("show_upcoming_meetings", True):
        selected = home.get("upcoming_meeting_ids", []) or []
        if selected:
            for mid in selected:
                m = await meetings.find_one({"id": mid})
                if m:
                    upcoming.append(await _project_meeting(m))
        else:
            rows = await meetings.find(
                {"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}},
                sort=[("start_date", 1)],
                limit=5,
            )
            for m in rows:
                upcoming.append(await _project_meeting(m))

    cats = []
    for cid in home.get("category_ids", []) or []:
        c = await categories.find_one({"id": cid})
        if c:
            cats.append(c)

    banner_sermon_doc = await sermons.find_one({"id": home.get("featured_banner_sermon_id")}) if home.get("featured_banner_sermon_id") else None
    banner_meeting_doc = await meetings.find_one({"id": home.get("featured_banner_meeting_id")}) if home.get("featured_banner_meeting_id") else None
    banner_image_url = await _resolve_media_url(
        home.get("featured_banner_image_storage_path"),
        home.get("featured_banner_image_url"),
    )
    banner = {
        "title": home.get("featured_banner_title"),
        "subtitle": home.get("featured_banner_subtitle"),
        "image_url": banner_image_url,
        "sermon": await _project_sermon(banner_sermon_doc) if banner_sermon_doc else None,
        "meeting": await _project_meeting(banner_meeting_doc) if banner_meeting_doc else None,
    }

    return {
        "banner": banner,
        "featured_sermons": featured,
        "recently_added": recent,
        "categories": clean_list(cats),
        "upcoming_meetings": upcoming,
    }


# ---------- Analytics ----------
@router.post("/analytics/event")
async def analytics_event(event: MobileEvent):
    """Record a mobile analytics event. Also increments counters on sermons."""
    doc = event.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = _now()
    await analytics_repo().insert(doc)
    if event.sermon_id:
        if event.event == "play":
            await sermons_repo().raw_update_one({"id": event.sermon_id}, {"$inc": {"play_count": 1}})
        elif event.event == "download":
            await sermons_repo().raw_update_one({"id": event.sermon_id}, {"$inc": {"download_count": 1}})
        elif event.event == "favorite":
            await sermons_repo().raw_update_one({"id": event.sermon_id}, {"$inc": {"favorite_count": 1}})
        elif event.event == "unfavorite":
            await sermons_repo().raw_update_one({"id": event.sermon_id}, {"$inc": {"favorite_count": -1}})
    return {"ok": True}
