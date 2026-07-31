"""Admin: Activity log — searchable, filterable."""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import require_admin
from repositories.entities import activity_repo
from services.serialization import clean_list

router = APIRouter(prefix="/api/v1/admin/activity", tags=["admin:activity"])


@router.get("")
async def list_activity(
    q: Optional[str] = Query(None),
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    actor_email: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
    _=Depends(require_admin),
):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"message": {"$regex": q, "$options": "i"}},
            {"action": {"$regex": q, "$options": "i"}},
            {"actor_email": {"$regex": q, "$options": "i"}},
        ]
    if action:
        filt["action"] = action
    if entity_type:
        filt["entity_type"] = entity_type
    if actor_email:
        filt["actor_email"] = actor_email
    if status:
        filt["status"] = status

    repo = activity_repo()
    total = await repo.count(filt)
    items = await repo.find(filt, sort=[("timestamp", -1)], skip=(page - 1) * page_size, limit=page_size)
    return {"items": clean_list(items), "total": total, "page": page, "page_size": page_size}
