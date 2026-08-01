"""Activity logging service. Every admin action funnels through here."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request

from repositories.entities import activity_repo


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log(
    *,
    actor: Optional[dict] = None,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    message: str = "",
    status: str = "ok",
    request: Optional[Request] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Persist an activity entry. Failures are swallowed — logging must never
    break the primary request.
    """
    ip = None
    user_agent = None
    if request is not None:
        ip = (request.client.host if request.client else None)
        user_agent = request.headers.get("user-agent")
    doc = {
        "id": str(uuid.uuid4()),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "message": message,
        "status": status,
        "actor_id": (actor or {}).get("id"),
        "actor_email": (actor or {}).get("email"),
        "ip": ip,
        "user_agent": user_agent,
        "metadata": metadata or {},
        "created_at": _now(),
    }
    try:
        await activity_repo().insert(doc)
    except Exception:
        # Deliberately swallow — activity log must not disrupt real work.
        pass
