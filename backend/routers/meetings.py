"""Admin: Meetings CRUD + archive/publish."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import require_admin
from models import Meeting, MeetingCreate, MeetingUpdate
from repositories.entities import meetings_repo
from services import log as activity_log
from services.serialization import clean, clean_list

router = APIRouter(prefix="/api/v1/admin/meetings", tags=["admin:meetings"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_meetings(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    include_archived: bool = False,
    _=Depends(require_admin),
):
    filt: dict = {}
    if not include_archived:
        filt["is_archived"] = {"$ne": True}
    if q:
        filt["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"speaker": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
        ]
    if status:
        filt["status"] = status
    items = await meetings_repo().find(filt, sort=[("start_date", 1)])
    return {"items": clean_list(items), "total": len(items)}


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, _=Depends(require_admin)):
    doc = await meetings_repo().find_one({"id": meeting_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return clean(doc)


@router.post("", response_model=Meeting)
async def create_meeting(body: MeetingCreate, request: Request, current=Depends(require_admin)):
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if not body.start_date:
        raise HTTPException(status_code=422, detail="Start date is required")
    if body.start_date and body.end_date and body.end_date < body.start_date:
        raise HTTPException(status_code=422, detail="End date cannot be earlier than the start date")

    m = Meeting(**body.model_dump())
    await meetings_repo().insert(m.model_dump())
    await activity_log(actor=current, action="meeting_created", entity_type="meeting", entity_id=m.id, message=f"Created “{m.title}”", request=request)
    return m


@router.patch("/{meeting_id}", response_model=Meeting)
async def update_meeting(meeting_id: str, body: MeetingUpdate, request: Request, current=Depends(require_admin)):
    repo = meetings_repo()
    existing = await repo.find_one({"id": meeting_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Meeting not found")

    title = body.title if body.title is not None else existing.get("title")
    start_date = body.start_date if body.start_date is not None else existing.get("start_date")
    end_date = body.end_date if body.end_date is not None else existing.get("end_date")

    if title is not None and not title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if not start_date:
        raise HTTPException(status_code=422, detail="Start date is required")
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail="End date cannot be earlier than the start date")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = _now()
    await repo.update_one({"id": meeting_id}, updates)
    doc = await repo.find_one({"id": meeting_id})
    await activity_log(actor=current, action="meeting_updated", entity_type="meeting", entity_id=meeting_id, message=f"Updated “{doc.get('title')}”", request=request)
    return doc


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, request: Request, current=Depends(require_admin)):
    repo = meetings_repo()
    doc = await repo.find_one({"id": meeting_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await repo.delete_one({"id": meeting_id})
    await activity_log(actor=current, action="meeting_deleted", entity_type="meeting", entity_id=meeting_id, message=f"Deleted “{doc.get('title')}”", request=request)
    return {"ok": True}


@router.post("/{meeting_id}/publish")
async def publish(meeting_id: str, request: Request, current=Depends(require_admin)):
    n = await meetings_repo().update_one({"id": meeting_id}, {"status": "upcoming", "updated_at": _now()})
    if n == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await activity_log(actor=current, action="meeting_published", entity_type="meeting", entity_id=meeting_id, request=request)
    return {"ok": True}


@router.post("/{meeting_id}/archive")
async def archive(meeting_id: str, request: Request, current=Depends(require_admin)):
    n = await meetings_repo().update_one({"id": meeting_id}, {"is_archived": True, "status": "archived", "updated_at": _now()})
    if n == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await activity_log(actor=current, action="meeting_archived", entity_type="meeting", entity_id=meeting_id, request=request)
    return {"ok": True}


@router.post("/{meeting_id}/restore")
async def restore(meeting_id: str, request: Request, current=Depends(require_admin)):
    n = await meetings_repo().update_one({"id": meeting_id}, {"is_archived": False, "status": "draft", "updated_at": _now()})
    if n == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await activity_log(actor=current, action="meeting_restored", entity_type="meeting", entity_id=meeting_id, request=request)
    return {"ok": True}
