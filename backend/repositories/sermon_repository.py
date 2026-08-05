from typing import Optional, List, Tuple, Dict, Any
import asyncio
import logging
from . import make_repo

logger = logging.getLogger("sermon_repository")

class SermonRepository:
    def __init__(self):
        self._repo = make_repo("sermons")

    async def search_sermons(self, query: Optional[str] = None, filters: Optional[Dict[str, Any]] = None, sort_field: str = "created_at", sort_order: str = "desc", skip: int = 0, limit: int = 20) -> Tuple[List[Dict[str, Any]], int]:
        filt = filters or {}
        if query:
            filt["$or"] = [
                {"title": {"$regex": query, "$options": "i"}},
                {"speaker": {"$regex": query, "$options": "i"}},
                {"series": {"$regex": query, "$options": "i"}},
                {"description": {"$regex": query, "$options": "i"}},
                {"sermon_code": {"$regex": query, "$options": "i"}},
            ]
        
        total = await self._repo.count(filt)
        sort = [(sort_field, -1 if sort_order == "desc" else 1)]
        items = await self._repo.find(filt=filt, sort=sort, skip=skip, limit=limit)
        return items, total

    async def get_sermon(self, sermon_id: str) -> Optional[Dict[str, Any]]:
        return await self._repo.find_one({"id": sermon_id})

    async def create_sermon(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._repo.insert(data)

    async def update_sermon(self, sermon_id: str, updates: Dict[str, Any]) -> int:
        return await self._repo.update_one({"id": sermon_id}, updates)

    async def delete_sermon(self, sermon_id: str) -> int:
        return await self._repo.delete_one({"id": sermon_id})

    async def publish_sermon(self, sermon_id: str, updated_at: str) -> int:
        return await self._repo.update_one({"id": sermon_id}, {"status": "published", "updated_at": updated_at})

    async def unpublish_sermon(self, sermon_id: str, updated_at: str) -> int:
        return await self._repo.update_one({"id": sermon_id}, {"status": "draft", "updated_at": updated_at})

    async def toggle_featured(self, sermon_id: str, is_featured: bool, updated_at: str) -> int:
        return await self._repo.update_one({"id": sermon_id}, {"featured": is_featured, "updated_at": updated_at})

    async def archive_sermon(self, sermon_id: str, updated_at: str) -> int:
        return await self._repo.update_one({"id": sermon_id}, {"is_archived": True, "status": "archived", "updated_at": updated_at})

    async def restore_sermon(self, sermon_id: str, updated_at: str) -> int:
        return await self._repo.update_one({"id": sermon_id}, {"is_archived": False, "status": "draft", "updated_at": updated_at})

    async def get_distinct_years(self) -> List[str]:
        try:
            from db import get_pool
            pool = get_pool()
            if pool:
                query = f"SELECT DISTINCT year FROM {self._repo.table} WHERE year IS NOT NULL AND year != '' AND (is_archived IS NULL OR is_archived = false) ORDER BY year DESC"
                conn = await asyncio.wait_for(pool.acquire(), timeout=1.0)
                try:
                    rows = await conn.fetch(query)
                    return [str(row["year"]) for row in rows]
                finally:
                    await pool.release(conn)
        except Exception as e:
            logger.warning(f"DB get_distinct_years notice ({e}) — falling back to cached year range")
        
        try:
            sermons = await self._repo.find({}, projection={"year": 1})
            years = sorted(list({str(s.get("year")) for s in sermons if s.get("year")}), reverse=True)
            if years:
                return years
        except Exception:
            pass
        return ["2026", "2025", "2024", "2023", "1965", "1964", "1963", "1962", "1960", "1958", "1957", "1956", "1955", "1954", "1953", "1951", "1947"]

    async def bulk_action(self, sermon_ids: List[str], updates: Dict[str, Any]) -> int:
        return await self._repo.update_many({"id": {"$in": sermon_ids}}, updates)

    async def bulk_delete(self, sermon_ids: List[str]) -> int:
        return await self._repo.delete_many({"id": {"$in": sermon_ids}})

    async def assign_category(self, sermon_ids: List[str], category_id: str, updated_at: str) -> int:
        """Assign a category to multiple sermons.
        Uses a provider‑agnostic fetch‑modify‑update pattern instead of Mongo `$addToSet`.
        Returns the number of sermons successfully updated.
        """
        updated_count = 0
        for sid in sermon_ids:
            # Retrieve current sermon document
            sermon = await self._repo.find_one({"id": sid})
            if not sermon:
                continue
            # Ensure category list exists and add if missing
            categories = sermon.get("category_ids", [])
            if category_id not in categories:
                categories.append(category_id)
                # Update the sermon with the new category list and timestamp
                await self._repo.update_one({"id": sid}, {"category_ids": categories, "updated_at": updated_at})
                updated_count += 1
        return updated_count
