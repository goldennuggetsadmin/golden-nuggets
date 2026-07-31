"""Admin: Dashboard aggregates."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from auth import require_admin
from repositories.entities import sermons_repo, meetings_repo, categories_repo, media_repo, activity_repo
from services.serialization import clean_list

router = APIRouter(prefix="/api/v1/admin/dashboard", tags=["admin:dashboard"])


@router.get("/stats")
async def stats(_=Depends(require_admin)):
    sermons = sermons_repo()
    meetings = meetings_repo()
    categories = categories_repo()
    media = media_repo()

    total_sermons = await sermons.count({"is_archived": {"$ne": True}})
    total_meetings = await meetings.count({"is_archived": {"$ne": True}})
    total_categories = await categories.count()
    featured = await sermons.count({"featured": True, "is_archived": {"$ne": True}})
    drafts = await sermons.count({"status": "draft", "is_archived": {"$ne": True}})
    published = await sermons.count({"status": "published", "is_archived": {"$ne": True}})

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recently_added = await sermons.count({"created_at": {"$gte": week_ago}})

    total_bytes = 0
    for d in await media.find({"is_deleted": False}, projection={"size": 1}):
        total_bytes += int(d.get("size", 0) or 0)

    upcoming_meetings = await meetings.count({"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}})
    pending_imports = await sermons.count({"source": "import", "status": "draft", "is_archived": {"$ne": True}})

    return {
        "total_sermons": total_sermons,
        "total_meetings": total_meetings,
        "total_categories": total_categories,
        "featured_sermons": featured,
        "draft_sermons": drafts,
        "published_sermons": published,
        "recently_added": recently_added,
        "storage_bytes": total_bytes,
        "upcoming_meetings": upcoming_meetings,
        "pending_imports": pending_imports,
    }


@router.get("/recent-sermons")
async def recent_sermons(limit: int = 6, _=Depends(require_admin)):
    items = await sermons_repo().find({"is_archived": {"$ne": True}}, sort=[("created_at", -1)], limit=limit)
    return {"items": clean_list(items)}


@router.get("/recent-imports")
async def recent_imports(limit: int = 8, _=Depends(require_admin)):
    items = await sermons_repo().find({"source": "import", "is_archived": {"$ne": True}}, sort=[("created_at", -1)], limit=limit)
    return {"items": clean_list(items)}


@router.get("/upcoming-meetings")
async def upcoming_meetings(limit: int = 5, _=Depends(require_admin)):
    items = await meetings_repo().find(
        {"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}},
        sort=[("start_date", 1)],
        limit=limit,
    )
    return {"items": clean_list(items)}


@router.get("/activity")
async def activity(limit: int = 15, _=Depends(require_admin)):
    items = await activity_repo().find({}, sort=[("created_at", -1)], limit=limit)
    return {"items": clean_list(items)}
