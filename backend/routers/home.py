"""Admin: Home Management — configures what the mobile home screen shows."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from auth import require_admin
from models import HomeConfig, HomeConfigUpdate
from repositories.entities import home_repo, sermons_repo, meetings_repo, categories_repo
from services import log as activity_log
from services.serialization import clean

router = APIRouter(prefix="/api/v1/admin/home", tags=["admin:home"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _load() -> dict:
    doc = await home_repo().find_one({"id": "global"})
    if doc:
        return clean(doc)
    default = HomeConfig().model_dump()
    await home_repo().insert(default)
    return default


@router.get("")
async def get_home(_=Depends(require_admin)):
    doc = await _load()
    # Enrich with resolved metadata for admin preview
    sermons = sermons_repo()
    meetings = meetings_repo()
    categories = categories_repo()
    doc["featured_sermons_preview"] = [
        s for s in [await sermons.find_one({"id": sid}) for sid in doc.get("featured_sermon_ids", [])] if s
    ]
    doc["upcoming_meetings_preview"] = [
        m for m in [await meetings.find_one({"id": mid}) for mid in doc.get("upcoming_meeting_ids", [])] if m
    ]
    doc["categories_preview"] = [
        c for c in [await categories.find_one({"id": cid}) for cid in doc.get("category_ids", [])] if c
    ]
    if doc.get("featured_banner_sermon_id"):
        doc["featured_banner_sermon"] = await sermons.find_one({"id": doc["featured_banner_sermon_id"]})
    if doc.get("featured_banner_meeting_id"):
        doc["featured_banner_meeting"] = await meetings.find_one({"id": doc["featured_banner_meeting_id"]})
    return doc


@router.patch("")
async def update_home(body: HomeConfigUpdate, request: Request, current=Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = _now()
    await home_repo().raw_update_one({"id": "global"}, {"$set": {"id": "global", **updates}}, upsert=True)
    await activity_log(actor=current, action="home_updated", entity_type="home", message="Updated home configuration", request=request, metadata={"keys": list(updates.keys())})
    return await _load()
