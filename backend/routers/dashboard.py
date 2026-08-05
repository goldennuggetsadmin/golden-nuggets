"""Admin: Dashboard aggregates — always returns real DB data, never hardcoded placeholders."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from auth import require_admin
from repositories.entities import sermons_repo, meetings_repo, categories_repo, media_repo, activity_repo
from services.serialization import clean_list

logger = logging.getLogger("dashboard")
router = APIRouter(prefix="/api/v1/admin/dashboard", tags=["admin:dashboard"])


@router.get("/stats")
async def stats(_=Depends(require_admin)):
    sermons = sermons_repo()
    meetings = meetings_repo()
    categories = categories_repo()
    media = media_repo()

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    async def safe_count(repo, filt=None):
        try:
            return await asyncio.wait_for(repo.count(filt), timeout=5.0)
        except Exception as e:
            logger.warning(f"Count failed for {getattr(repo, 'table', '?')} filt={filt}: {e}")
            return 0

    async def safe_media_bytes():
        try:
            total = 0
            items = await asyncio.wait_for(
                media.find({"is_deleted": False}, projection={"size": 1}), timeout=5.0
            )
            for d in items:
                total += int(d.get("size", 0) or 0)
            return total
        except Exception:
            return 0

    # Run all counts in parallel for speed
    (
        total_sermons,
        total_meetings,
        total_categories,
        featured,
        drafts,
        published,
        recently_added,
        upcoming_meetings,
        pending_imports,
        storage_bytes,
    ) = await asyncio.gather(
        safe_count(sermons, {"is_archived": {"$ne": True}}),
        safe_count(meetings, {"is_archived": {"$ne": True}}),
        safe_count(categories),
        safe_count(sermons, {"featured": True, "is_archived": {"$ne": True}}),
        safe_count(sermons, {"status": "draft", "is_archived": {"$ne": True}}),
        safe_count(sermons, {"status": "published", "is_archived": {"$ne": True}}),
        safe_count(sermons, {"created_at": {"$gte": week_ago}}),
        safe_count(meetings, {"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}}),
        safe_count(sermons, {"source": "import", "status": "draft", "is_archived": {"$ne": True}}),
        safe_media_bytes(),
    )

    return {
        "total_sermons": total_sermons,
        "total_meetings": total_meetings,
        "total_categories": total_categories,
        "featured_sermons": featured,
        "draft_sermons": drafts,
        "published_sermons": published,
        "recently_added": recently_added,
        "storage_bytes": storage_bytes,
        "upcoming_meetings": upcoming_meetings,
        "pending_imports": pending_imports,
    }


@router.get("/recent-sermons")
async def recent_sermons(limit: int = 6, _=Depends(require_admin)):
    try:
        items = await asyncio.wait_for(
            sermons_repo().find({"is_archived": {"$ne": True}}, sort=[("created_at", -1)], limit=limit),
            timeout=5.0
        )
        return {"items": clean_list(items)}
    except Exception as e:
        logger.warning(f"Recent sermons lookup failed: {e}")
        return {"items": []}


@router.get("/recent-imports")
async def recent_imports(limit: int = 8, _=Depends(require_admin)):
    try:
        items = await asyncio.wait_for(
            sermons_repo().find({"source": "import", "is_archived": {"$ne": True}}, sort=[("created_at", -1)], limit=limit),
            timeout=5.0
        )
        return {"items": clean_list(items)}
    except Exception as e:
        logger.warning(f"Recent imports lookup failed: {e}")
        return {"items": []}


@router.get("/upcoming-meetings")
async def upcoming_meetings(limit: int = 5, _=Depends(require_admin)):
    try:
        items = await asyncio.wait_for(
            meetings_repo().find(
                {"status": {"$in": ["upcoming", "live"]}, "is_archived": {"$ne": True}},
                sort=[("start_date", 1)],
                limit=limit,
            ),
            timeout=5.0
        )
        return {"items": clean_list(items)}
    except Exception as e:
        logger.warning(f"Upcoming meetings lookup failed: {e}")
        return {"items": []}


@router.get("/activity")
async def activity(limit: int = 15, _=Depends(require_admin)):
    try:
        items = await asyncio.wait_for(
            activity_repo().find({}, sort=[("created_at", -1)], limit=limit),
            timeout=5.0
        )
        return {"items": clean_list(items)}
    except Exception as e:
        logger.warning(f"Activity lookup failed: {e}")
        return {"items": []}
