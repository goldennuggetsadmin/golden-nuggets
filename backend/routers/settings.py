"""Admin: Key/value application settings."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from auth import require_admin
from models import SettingsUpdate
from repositories.entities import settings_repo
from services import log as activity_log

router = APIRouter(prefix="/api/v1/admin/settings", tags=["admin:settings"])

DEFAULTS = {
    "ministry_name": "Golden Nuggets Ministry",
    "support_email": "care@goldennuggets.church",
    "default_language": "English",
    "weekly_banner": True,
    "storage_plan": "Ministry · 200 GB",
    "backup_schedule": "Nightly",
    "media_quality": "High",
    "keep_originals": True,
    "app_name": "Golden Nuggets",
    "home_banner": "Latest Sunday Service",
    "default_sort": "Newest first",
    "offline_downloads": True,
    "notify_new_sermon": True,
    "notify_before_meeting": "1 hour",
    "quiet_hours": "10 pm – 7 am",
    "auto_meeting_reminders": True,
    "default_import_status": "Draft",
    "auto_download_pdfs": False,
    "auto_download_artwork": True,
    "auto_publish_trusted": False,
}


@router.get("")
async def get_settings(_=Depends(require_admin)):
    doc = await settings_repo().find_one({"id": "global"}) or {}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k not in ("id",)}}


@router.patch("")
async def update_settings(body: SettingsUpdate, request: Request, current=Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await settings_repo().raw_update_one({"id": "global"}, {"$set": {"id": "global", **updates}}, upsert=True)
    doc = await settings_repo().find_one({"id": "global"}) or {}
    await activity_log(actor=current, action="settings_updated", entity_type="settings", message=f"Updated {len(updates)-1} settings keys", request=request, metadata={"keys": list(updates.keys())})
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k not in ("id",)}}
