"""Mobile: public-facing APIs consumed by the React Native app.

These endpoints return published content only. No auth required on read
endpoints; analytics event can carry a device_id for aggregation.
"""
from datetime import datetime, timezone
from typing import Optional
import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Query, Response

from config.settings import settings
from models import MobileEvent
from repositories.entities import sermons_repo, meetings_repo, categories_repo, home_repo, analytics_repo, media_repo, notifications_repo
from services.serialization import clean_list
from services.sermon_service import filter_sermons_by_series
from providers.storage import get_storage_provider
from services.meeting_service import is_meeting_expired

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_external_url(value: str) -> bool:
    """Return True if the value is an external permanent URL (not a Supabase storage_path)."""
    return value.startswith("http://") or value.startswith("https://")


def _is_admin_media_ref(value: str) -> bool:
    """Return True if the value is an internal admin media file reference."""
    return "/api/v1/admin/media/file/" in value


def _resolve_media_url(
    storage_path: Optional[str],
    legacy_url: Optional[str]
) -> Optional[str]:
    if legacy_url and not _is_admin_media_ref(legacy_url):
        return legacy_url
    if storage_path:
        return get_storage_provider().get_public_url(storage_path)
    return legacy_url


def _build_transcripts(s: dict) -> list:
    import json
    raw = s.get("transcripts")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = None
    if isinstance(raw, list) and len(raw) > 0:
        return raw

    text_val = s.get("transcript") or s.get("canonical_text")
    if text_val and isinstance(text_val, str) and text_val.strip():
        lang = s.get("language") or "English"
        paras = []
        for idx, block in enumerate(text_val.split("\n\n")):
            clean_block = block.strip()
            if clean_block:
                paras.append({
                    "paragraph_number": idx + 1,
                    "text": clean_block,
                    "language": lang,
                })
        return paras

    return []


def _project_sermon(s: dict, include_transcripts: bool = False) -> dict:
    """Shape a sermon for mobile consumption synchronously."""
    pdf_english_path = s.get("english_pdf_storage_path") or s.get("pdf_english_storage_path")
    pdf_english_legacy = s.get("pdf_english_url") or s.get("english_pdf_url")
    pdf_telugu_path = s.get("telugu_pdf_storage_path") or s.get("pdf_telugu_storage_path")
    pdf_telugu_legacy = s.get("pdf_telugu_url") or s.get("telugu_pdf_url")

    audio_url = _resolve_media_url(s.get("audio_storage_path"), s.get("audio_url"))
    artwork_url = _resolve_media_url(s.get("artwork_storage_path"), s.get("artwork_url"))
    pdf_english_url = _resolve_media_url(pdf_english_path, pdf_english_legacy)
    pdf_telugu_url = _resolve_media_url(pdf_telugu_path, pdf_telugu_legacy)

    code_str = s.get("sermon_code") or s.get("id") or "sermon"
    built_transcripts = _build_transcripts(s) if include_transcripts else []

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

        # Official PDF Resources (Enterprise Metadata)
        "english_pdf_url": pdf_english_url,
        "english_pdf_hash": s.get("english_pdf_hash"),
        "english_pdf_size": s.get("english_pdf_size"),
        "english_pdf_filename": s.get("english_pdf_filename") or f"{code_str}_English.pdf",
        "english_pdf_page_count": s.get("english_pdf_page_count") or 0,

        "telugu_pdf_url": pdf_telugu_url,
        "telugu_pdf_hash": s.get("telugu_pdf_hash"),
        "telugu_pdf_size": s.get("telugu_pdf_size"),
        "telugu_pdf_filename": s.get("telugu_pdf_filename") or f"{code_str}_Telugu.pdf",
        "telugu_pdf_page_count": s.get("telugu_pdf_page_count") or 0,

        # Backward compatibility aliases
        "pdf_english_url": pdf_english_url,
        "pdf_telugu_url": pdf_telugu_url,

        "canonical_text": s.get("canonical_text") or s.get("transcript"),
        "canonical_text_hash": s.get("canonical_text_hash"),
        "official_pdf_hash": s.get("official_pdf_hash") or s.get("english_pdf_hash") or s.get("telugu_pdf_hash"),
        "import_engine": s.get("import_engine"),
        "import_report": s.get("import_report"),
        "transcripts": built_transcripts,
        "transcript_page_count": s.get("transcript_page_count", 0),
        "transcript_paragraph_count": len(built_transcripts) or s.get("transcript_paragraph_count", 0),
        "transcript_parsed": len(built_transcripts) > 0 or bool(s.get("transcript_parsed")) or bool(s.get("canonical_text")) or bool(s.get("transcript")),
        "created_at": s.get("created_at"),
    }


def _project_meeting(m: dict) -> dict:
    banner_url = _resolve_media_url(
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
def _encode_cursor(created_at: str, item_id: str) -> str:
    import base64, json
    payload = json.dumps({"c": str(created_at or ""), "i": str(item_id or "")})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def _decode_cursor(cursor_str: str) -> tuple[Optional[str], Optional[str]]:
    import base64, json
    try:
        raw = base64.urlsafe_b64decode(cursor_str.encode()).decode()
        data = json.loads(raw)
        return data.get("c"), data.get("i")
    except Exception:
        return None, None


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
    page_size: int = 20,
    cursor: Optional[str] = Query(None),
):
    import time, logging
    t_start = time.perf_counter()

    # Determine effective page_size:
    # 1. If caller explicitly passed 10000 -> legacy full-catalog query (preserve compatibility)
    # 2. Standard queries clamp page_size between 1 and 100 (default 20)
    if page_size == 10000 or page_size > 5000:
        eff_page_size = 10000
    else:
        eff_page_size = max(1, min(100, page_size))

    filt: dict = {"status": "published", "is_archived": {"$ne": True}}
    if q and isinstance(q, str):
        filt["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"sermon_code": {"$regex": q, "$options": "i"}},
            {"speaker": {"$regex": q, "$options": "i"}},
            {"series": {"$regex": q, "$options": "i"}},
        ]
    if language:
        l_lower = language.lower()
        if l_lower in ["en", "english"]:
            filt["language"] = {"$in": ["en", "English", "english", "EN"]}
        elif l_lower in ["te", "telugu"]:
            filt["language"] = {"$in": ["te", "Telugu", "telugu", "TE"]}
        else:
            filt["language"] = language
    if year:
        filt["year"] = year
    
    requested_series = series or category
    if category_id:
        filt["category_ids"] = category_id
    if featured is not None:
        filt["featured"] = featured

    repo = sermons_repo()

    # Apply Keyset / Cursor Pagination filtering if cursor provided
    cursor_c, cursor_i = _decode_cursor(cursor) if cursor else (None, None)
    if cursor_c:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(cursor_c.replace("Z", "+00:00"))
            filt["created_at"] = {"$lt": dt}
        except Exception:
            pass

    # For paginated requests (eff_page_size <= 100), fetch limit = eff_page_size + 1 to check has_more
    if eff_page_size <= 100 and not requested_series:
        skip_val = 0 if cursor_c else max(0, (page - 1) * eff_page_size)
        raw_items = await repo.find(
            filt,
            sort=[(sort, -1 if order == "desc" else 1)],
            skip=skip_val,
            limit=eff_page_size + 1,
        )
        total_count = await repo.count(filt)
    else:
        raw_items = await repo.find(
            filt,
            sort=[(sort, -1 if order == "desc" else 1)],
        )
        total_count = len(raw_items)

    t_db = time.perf_counter()

    filtered_items = filter_sermons_by_series(raw_items, requested_series) if requested_series else raw_items

    # Determine pagination slice and next_cursor
    has_more = False
    next_cursor = None
    if eff_page_size <= 100 and len(filtered_items) > eff_page_size:
        has_more = True
        paginated_items = filtered_items[:eff_page_size]
    else:
        paginated_items = filtered_items

    if paginated_items and has_more:
        last_item = paginated_items[-1]
        next_cursor = _encode_cursor(last_item.get("created_at"), last_item.get("id"))

    projected_items = [_project_sermon(s) for s in paginated_items]
    t_project = time.perf_counter()

    db_time_ms = round((t_db - t_start) * 1000, 2)
    ser_time_ms = round((t_project - t_db) * 1000, 2)
    total_time_ms = round((t_project - t_start) * 1000, 2)

    logging.getLogger(__name__).info(
        f"[Timing Trace] GET /sermons | DB Query: {db_time_ms}ms | Serialization: {ser_time_ms}ms | Total: {total_time_ms}ms | Returned: {len(projected_items)} | Total DB: {total_count}"
    )

    return {
        "items": projected_items,
        "total": total_count,
        "page": page,
        "page_size": eff_page_size,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


@router.get("/years")
async def list_years(language: Optional[str] = None):
    """Return summary of published sermons grouped by year in descending order."""
    filt: dict = {"status": "published", "is_archived": {"$ne": True}}
    if language:
        l_lower = language.lower()
        if l_lower in ["en", "english"]:
            filt["language"] = {"$in": ["en", "English", "english", "EN"]}
        elif l_lower in ["te", "telugu"]:
            filt["language"] = {"$in": ["te", "Telugu", "telugu", "TE"]}
        else:
            filt["language"] = language

    repo = sermons_repo()
    raw_items = await repo.find(filt)

    counts: dict[int, int] = {}
    for s in raw_items:
        yr = s.get("year")
        if not yr and s.get("date"):
            yr = str(s.get("date"))[:4]
        if not yr and s.get("sermon_code"):
            code = str(s.get("sermon_code"))
            if len(code) >= 2 and code[:2].isdigit():
                yy = int(code[:2])
                yr = 1900 + yy if yy >= 40 else 2000 + yy
        if yr:
            try:
                yr_num = int(str(yr).strip())
                counts[yr_num] = counts.get(yr_num, 0) + 1
            except ValueError:
                pass

    sorted_years = [
        {"year": yr, "sermonCount": count}
        for yr, count in sorted(counts.items(), key=lambda x: x[0], reverse=True)
    ]
    return sorted_years


@router.get("/series")
async def list_series_summary(language: Optional[str] = None):
    """Return summary of published series grouped by name in alphabetical order."""
    filt: dict = {"status": "published", "is_archived": {"$ne": True}}
    if language:
        l_lower = language.lower()
        if l_lower in ["en", "english"]:
            filt["language"] = {"$in": ["en", "English", "english", "EN"]}
        elif l_lower in ["te", "telugu"]:
            filt["language"] = {"$in": ["te", "Telugu", "telugu", "TE"]}
        else:
            filt["language"] = language

    repo = sermons_repo()
    raw_items = await repo.find(filt)
    counts: dict[str, int] = {}
    for s in raw_items:
        ser = s.get("series") or s.get("category") or "General"
        ser_clean = str(ser).strip() or "General"
        counts[ser_clean] = counts.get(ser_clean, 0) + 1

    sorted_series = [
        {"name": name, "sermonCount": count}
        for name, count in sorted(counts.items(), key=lambda x: (1 if x[0] == "General" else 0, x[0].lower()))
    ]
    return sorted_series


@router.get("/states")
async def list_states_summary(language: Optional[str] = None):
    """Return summary of published sermons grouped by state/location in alphabetical order."""
    filt: dict = {"status": "published", "is_archived": {"$ne": True}}
    if language:
        l_lower = language.lower()
        if l_lower in ["en", "english"]:
            filt["language"] = {"$in": ["en", "English", "english", "EN"]}
        elif l_lower in ["te", "telugu"]:
            filt["language"] = {"$in": ["te", "Telugu", "telugu", "TE"]}
        else:
            filt["language"] = language

    repo = sermons_repo()
    raw_items = await repo.find(filt)
    counts: dict[str, int] = {}
    for s in raw_items:
        st = s.get("state") or s.get("location")
        if st and str(st).strip():
            st_clean = str(st).strip()
            counts[st_clean] = counts.get(st_clean, 0) + 1

    sorted_states = [
        {"state": st, "sermonCount": count}
        for st, count in sorted(counts.items(), key=lambda x: x[0].lower())
    ]
    return sorted_states


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
            doc = await sermons_repo().find_one({"sermon_code": sermon_id, "status": "published"})
        except Exception:
            doc = None
    if not doc:
        try:
            doc = await sermons_repo().find_one({"audio_url": sermon_id, "status": "published"})
        except Exception:
            doc = None
    if not doc:
        items = await sermons_repo().find({"status": "published"})
        for s in items:
            if s.get("id") == sermon_id or s.get("sermon_code") == sermon_id or (s.get("title") and sermon_id.lower() in s.get("title").lower()):
                doc = s
                break

    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _project_sermon(doc, include_transcripts=True)


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
        if (status == "upcoming" or not status) and is_meeting_expired(m):
            continue
        projected.append(_project_meeting(m))
    return {"items": projected, "total": len(projected)}


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    doc = await meetings_repo().find_one({"id": meeting_id})
    if not doc or doc.get("is_archived"):
        raise HTTPException(status_code=404, detail="Not found")
    return _project_meeting(doc)


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
        if language.lower() == "en":
            filt["$or"] = [{"audience": "all"}, {"audience": "language", "language": {"$regex": "^(en|english)$", "$options": "i"}}]
        elif language.lower() == "te":
            filt["$or"] = [{"audience": "all"}, {"audience": "language", "language": {"$regex": "^(te|telugu)$", "$options": "i"}}]
        else:
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
        if language.lower() == "en":
            lang_filt["language"] = {"$regex": "^(en|english)$", "$options": "i"}
        elif language.lower() == "te":
            lang_filt["language"] = {"$regex": "^(te|telugu)$", "$options": "i"}
        else:
            lang_filt["language"] = {"$regex": f"^{language}$", "$options": "i"}

    featured_ids = home.get("featured_sermon_ids", []) or []
    featured = []
    if featured_ids:
        filt = {"id": {"$in": featured_ids}, "status": "published", **lang_filt}
        featured_docs = await sermons.find(filt)
        doc_map = {d.get("id"): d for d in featured_docs if d.get("id")}
        for sid in featured_ids:
            if sid in doc_map:
                featured.append(_project_sermon(doc_map[sid]))

    recent = []
    if home.get("show_recently_added", True):
        recent_filt = {"status": "published", "is_archived": {"$ne": True}, **lang_filt}
        rows = await sermons.find(
            recent_filt,
            sort=[("created_at", -1)],
            limit=home.get("recently_added_count") or 6,
        )
        for s in rows:
            recent.append(_project_sermon(s))

    # Meetings are ALWAYS shown regardless of language
    upcoming = []
    if home.get("show_upcoming_meetings", True):
        selected = home.get("upcoming_meeting_ids", []) or []
        if selected:
            m_docs = await meetings.find({"id": {"$in": selected}})
            m_map = {m.get("id"): m for m in m_docs if m.get("id")}
            for mid in selected:
                if mid in m_map and not is_meeting_expired(m_map[mid]):
                    upcoming.append(_project_meeting(m_map[mid]))
        else:
            rows = await meetings.find(
                {"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}},
                sort=[("start_date", 1)],
                limit=10,
            )
            for m in rows:
                if not is_meeting_expired(m):
                    upcoming.append(_project_meeting(m))
                    if len(upcoming) >= (home.get("upcoming_meetings_count") or 5):
                        break

    cats = []
    cat_ids = home.get("category_ids", []) or []
    if cat_ids:
        c_docs = await categories.find({"id": {"$in": cat_ids}})
        c_map = {c.get("id"): c for c in c_docs if c.get("id")}
        for cid in cat_ids:
            if cid in c_map:
                cats.append(c_map[cid])

    banner_sermon_doc = await sermons.find_one({"id": home.get("featured_banner_sermon_id")}) if home.get("featured_banner_sermon_id") else None
    banner_meeting_doc = await meetings.find_one({"id": home.get("featured_banner_meeting_id")}) if home.get("featured_banner_meeting_id") else None
    banner_image_url = _resolve_media_url(
        home.get("featured_banner_image_storage_path"),
        home.get("featured_banner_image_url"),
    )
    banner = {
        "title": home.get("featured_banner_title"),
        "subtitle": home.get("featured_banner_subtitle"),
        "image_url": banner_image_url,
        "sermon": _project_sermon(banner_sermon_doc) if banner_sermon_doc else None,
        "meeting": _project_meeting(banner_meeting_doc) if banner_meeting_doc else None,
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
