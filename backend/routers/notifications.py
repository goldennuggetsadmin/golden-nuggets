"""Admin: Notifications — draft/schedule/publish. Ready for Firebase later."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import require_admin
from models import Notification, NotificationCreate, NotificationUpdate
from repositories.entities import notifications_repo
from services import log as activity_log
from services.serialization import clean, clean_list

router = APIRouter(prefix="/api/v1/admin/notifications", tags=["admin:notifications"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_notifications(status: Optional[str] = Query(None), _=Depends(require_admin)):
    filt = {}
    if status:
        filt["status"] = status
    items = await notifications_repo().find(filt, sort=[("created_at", -1)], limit=200)
    return {"items": clean_list(items), "total": len(items)}


@router.get("/{notification_id}")
async def get_notification(notification_id: str, _=Depends(require_admin)):
    doc = await notifications_repo().find_one({"id": notification_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Notification not found")
    return clean(doc)


@router.post("", response_model=Notification)
async def create_notification(body: NotificationCreate, request: Request, current=Depends(require_admin)):
    n = Notification(**body.model_dump())
    await notifications_repo().insert(n.model_dump())
    await activity_log(actor=current, action="notification_created", entity_type="notification", entity_id=n.id, message=f"Drafted “{n.title}”", request=request)
    return n


@router.patch("/{notification_id}", response_model=Notification)
async def update_notification(notification_id: str, body: NotificationUpdate, request: Request, current=Depends(require_admin)):
    repo = notifications_repo()
    existing = await repo.find_one({"id": notification_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Notification not found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = _now()
    await repo.update_one({"id": notification_id}, updates)
    doc = await repo.find_one({"id": notification_id})
    await activity_log(actor=current, action="notification_updated", entity_type="notification", entity_id=notification_id, request=request)
    return doc


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, request: Request, current=Depends(require_admin)):
    n = await notifications_repo().delete_one({"id": notification_id})
    if n == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    await activity_log(actor=current, action="notification_deleted", entity_type="notification", entity_id=notification_id, request=request)
    return {"ok": True}


@router.post("/{notification_id}/publish")
async def publish(notification_id: str, request: Request, current=Depends(require_admin)):
    """Marks a notification as published."""
    import traceback
    repo = notifications_repo()
    try:
        doc = await repo.find_one({"id": notification_id})
        if not doc:
            print(f"[NOTIF PUBLISH ERR] Notification '{notification_id}' not found")
            raise HTTPException(status_code=404, detail=f"Notification '{notification_id}' not found")

        curr_status = doc.get("status")
        print(f"[NOTIF PUBLISH] Target ID={notification_id}, Current Status={curr_status} -> Target Status=published")

        now_ts = _now()
        patch_data = {"status": "published", "delivered_at": now_ts, "updated_at": now_ts}
        print(f"[NOTIF PUBLISH] Executing update_one on table='{repo.table}' with patch={patch_data}")

        n = await repo.update_one({"id": notification_id}, patch_data)
        print(f"[NOTIF PUBLISH SUCCESS] Rows updated={n}")

        await activity_log(
            actor=current,
            action="notification_published",
            entity_type="notification",
            entity_id=notification_id,
            message=f"Published “{doc.get('title')}”",
            request=request,
        )
        return {"ok": True, "rows_updated": n}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[NOTIF PUBLISH EXCEPTION] Failed to publish notification '{notification_id}': {exc}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to publish notification: {str(exc)}")


@router.post("/{notification_id}/schedule")
async def schedule(notification_id: str, request: Request, current=Depends(require_admin)):
    repo = notifications_repo()
    doc = await repo.find_one({"id": notification_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not doc.get("schedule_at"):
        raise HTTPException(status_code=400, detail="Set schedule_at first")
    await repo.update_one({"id": notification_id}, {"status": "scheduled", "updated_at": _now()})
    await activity_log(actor=current, action="notification_scheduled", entity_type="notification", entity_id=notification_id, request=request)
    return {"ok": True}


@router.post("/{notification_id}/cancel")
async def cancel(notification_id: str, request: Request, current=Depends(require_admin)):
    n = await notifications_repo().update_one({"id": notification_id}, {"status": "cancelled", "updated_at": _now()})
    if n == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    await activity_log(actor=current, action="notification_cancelled", entity_type="notification", entity_id=notification_id, request=request)
    return {"ok": True}
