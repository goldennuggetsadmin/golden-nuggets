from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
from core.exceptions import NotFoundError, BadRequestError
from repositories.sermon_repository import SermonRepository
from repositories.entities import categories_repo
from services import log as activity_log

# Dependency injection method
def get_sermon_repository():
    return SermonRepository()

class SermonService:
    def __init__(self, repo=None):
        self.repo = repo or get_sermon_repository()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    async def search_sermons(self, query: Optional[str] = None, status: Optional[str] = None, series: Optional[str] = None, year: Optional[str] = None, language: Optional[str] = None, category_id: Optional[str] = None, source: Optional[str] = None, featured: Optional[bool] = None, include_archived: bool = False, sort: str = "created_at", order: str = "desc", page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        filters = {}
        if not include_archived:
            filters["is_archived"] = {"$ne": True}
        if status:
            filters["status"] = status
        if series:
            filters["series"] = series
        if year:
            filters["year"] = year
        if language:
            filters["language"] = language
        if source:
            filters["source"] = source
        if featured is not None:
            filters["featured"] = featured
        if category_id:
            filters["category_ids"] = category_id
        
        skip = max(0, (page - 1) * page_size)
        items, total = await self.repo.search_sermons(query, filters, sort, order, skip, page_size)
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_distinct_years(self) -> List[str]:
        return await self.repo.get_distinct_years()

    async def get_sermon(self, sermon_id: str) -> Dict[str, Any]:
        doc = await self.repo.get_sermon(sermon_id)
        if not doc:
            raise NotFoundError("Sermon not found")
        return doc

    async def create_sermon(self, data: Dict[str, Any], actor: Any, request: Any = None) -> Dict[str, Any]:
        sermon = await self.repo.create_sermon(data)
        await activity_log(actor=actor, action="sermon_created", entity_type="sermon", entity_id=data["id"], message=f"Created “{data.get('title')}”", request=request)
        return sermon

    async def update_sermon(self, sermon_id: str, data: Dict[str, Any], actor: Any, request: Any = None) -> Dict[str, Any]:
        existing = await self.repo.get_sermon(sermon_id)
        if not existing:
            raise NotFoundError("Sermon not found")
        updates = {k: v for k, v in data.items() if v is not None}
        updates["updated_at"] = self._now()
        await self.repo.update_sermon(sermon_id, updates)
        doc = await self.repo.get_sermon(sermon_id)
        await activity_log(actor=actor, action="sermon_updated", entity_type="sermon", entity_id=sermon_id, message=f"Updated “{doc.get('title')}”", request=request)
        return doc

    async def delete_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        doc = await self.repo.get_sermon(sermon_id)
        if not doc:
            raise NotFoundError("Sermon not found")
        await self.repo.delete_sermon(sermon_id)
        await activity_log(actor=actor, action="sermon_deleted", entity_type="sermon", entity_id=sermon_id, message=f"Deleted “{doc.get('title')}”", request=request)
        return True

    async def publish_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        n = await self.repo.publish_sermon(sermon_id, self._now())
        if n == 0:
            raise NotFoundError("Sermon not found")
        await activity_log(actor=actor, action="sermon_published", entity_type="sermon", entity_id=sermon_id, request=request)
        return True

    async def unpublish_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        n = await self.repo.unpublish_sermon(sermon_id, self._now())
        if n == 0:
            raise NotFoundError("Sermon not found")
        await activity_log(actor=actor, action="sermon_unpublished", entity_type="sermon", entity_id=sermon_id, request=request)
        return True

    async def toggle_featured(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        doc = await self.repo.get_sermon(sermon_id)
        if not doc:
            raise NotFoundError("Sermon not found")
        new_val = not bool(doc.get("featured", False))
        await self.repo.toggle_featured(sermon_id, new_val, self._now())
        await activity_log(actor=actor, action="sermon_featured_toggled", entity_type="sermon", entity_id=sermon_id, message=f"featured={new_val}", request=request)
        return new_val

    async def archive_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        n = await self.repo.archive_sermon(sermon_id, self._now())
        if n == 0:
            raise NotFoundError("Sermon not found")
        await activity_log(actor=actor, action="sermon_archived", entity_type="sermon", entity_id=sermon_id, request=request)
        return True

    async def restore_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> bool:
        n = await self.repo.restore_sermon(sermon_id, self._now())
        if n == 0:
            raise NotFoundError("Sermon not found")
        await activity_log(actor=actor, action="sermon_restored", entity_type="sermon", entity_id=sermon_id, request=request)
        return True

    async def duplicate_sermon(self, sermon_id: str, actor: Any, request: Any = None) -> Dict[str, Any]:
        doc = await self.repo.get_sermon(sermon_id)
        if not doc:
            raise NotFoundError("Sermon not found")
        copy = {**doc}
        copy["id"] = str(uuid.uuid4())
        copy["title"] = f"{doc.get('title', 'Untitled')} (Copy)"
        copy["status"] = "draft"
        copy["is_archived"] = False
        copy["featured"] = False
        copy["created_at"] = self._now()
        copy["updated_at"] = self._now()
        copy["play_count"] = 0
        copy["download_count"] = 0
        copy["favorite_count"] = 0
        await self.repo.create_sermon(copy)
        await activity_log(actor=actor, action="sermon_duplicated", entity_type="sermon", entity_id=copy["id"], message=f"Duplicated “{doc.get('title')}”", request=request)
        return copy

    async def bulk_action(self, action: str, ids: List[str], category_id: Optional[str], actor: Any, request: Any = None) -> int:
        if not ids:
            return 0
        ts = self._now()
        n = 0
        if action == "publish":
            n = await self.repo.bulk_action(ids, {"status": "published", "updated_at": ts})
        elif action == "unpublish":
            n = await self.repo.bulk_action(ids, {"status": "draft", "updated_at": ts})
        elif action == "feature":
            n = await self.repo.bulk_action(ids, {"featured": True, "updated_at": ts})
        elif action == "unfeature":
            n = await self.repo.bulk_action(ids, {"featured": False, "updated_at": ts})
        elif action == "archive":
            n = await self.repo.bulk_action(ids, {"is_archived": True, "status": "archived", "updated_at": ts})
        elif action == "restore":
            n = await self.repo.bulk_action(ids, {"is_archived": False, "status": "draft", "updated_at": ts})
        elif action == "delete":
            n = await self.repo.bulk_delete(ids)
        elif action == "assign-category":
            if not category_id:
                raise BadRequestError("category_id required for assign-category")
            cat = await categories_repo().find_one({"id": category_id})
            if not cat:
                raise NotFoundError("Category not found")
            n = await self.repo.assign_category(ids, category_id, ts)
        else:
            raise BadRequestError("Unknown action")
        
        await activity_log(actor=actor, action=f"sermon_bulk_{action}", entity_type="sermon", message=f"Bulk {action} on {len(ids)} sermons", request=request, metadata={"ids": ids})
        return n

