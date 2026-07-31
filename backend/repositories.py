"""
Repositories — the ONLY layer that talks to the database.
All Mongo-specific syntax lives here. Swap this file (or add a Supabase
implementation next to it) later; nothing else needs to change.
"""
from __future__ import annotations

from typing import Any, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from schemas import (
    AnalyticsEvent,
    Category,
    Highlight,
    HistoryEntry,
    Note,
    Testimony,
)

_PROJECT = {"_id": 0}


class TestimonyRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["testimonies"]

    async def insert(self, t: Testimony) -> Testimony:
        await self.col.insert_one(t.model_dump().copy())
        return t

    async def get(self, testimony_id: str) -> Optional[Testimony]:
        raw = await self.col.find_one({"id": testimony_id}, _PROJECT)
        return Testimony(**raw) if raw else None

    async def list(
        self,
        *,
        category: Optional[str] = None,
        language: Optional[str] = None,
        favorite: Optional[bool] = None,
        downloaded: Optional[bool] = None,
        limit: int = 100,
        skip: int = 0,
        sort_field: str = "created_at",
        sort_dir: int = -1,
    ) -> List[Testimony]:
        q: dict[str, Any] = {}
        if category: q["category"] = category
        if language: q["language"] = language
        if favorite is not None: q["favorite"] = favorite
        if downloaded is not None: q["downloaded"] = downloaded
        cur = self.col.find(q, _PROJECT).sort(sort_field, sort_dir).skip(skip).limit(limit)
        return [Testimony(**doc) async for doc in cur]

    async def search(self, needle: str, field: str = "all", limit: int = 50) -> List[Testimony]:
        needle = needle.strip()
        if not needle:
            return []
        rgx = {"$regex": needle, "$options": "i"}
        by_field: dict[str, dict[str, Any]] = {
            "title": {"title": rgx},
            "speaker": {"speaker": rgx},
            "category": {"category": rgx},
            "language": {"language": rgx},
            "verse": {"verse": rgx},
            "year": {"$expr": {"$regexMatch": {"input": {"$toString": "$year"}, "regex": needle}}},
            "transcript": {"transcripts.text": rgx},
        }
        if field in by_field:
            q = by_field[field]
        else:
            q = {
                "$or": [
                    {"title": rgx}, {"speaker": rgx}, {"category": rgx},
                    {"language": rgx}, {"verse": rgx}, {"transcripts.text": rgx},
                    {"$expr": {"$regexMatch": {"input": {"$toString": "$year"}, "regex": needle}}},
                ]
            }
        cur = self.col.find(q, _PROJECT).limit(limit)
        return [Testimony(**doc) async for doc in cur]

    async def patch(self, testimony_id: str, fields: dict[str, Any]) -> Optional[Testimony]:
        if fields:
            await self.col.update_one({"id": testimony_id}, {"$set": fields})
        return await self.get(testimony_id)

    async def upsert_transcript(self, testimony_id: str, transcript: dict) -> Optional[Testimony]:
        await self.col.update_one(
            {"id": testimony_id},
            {"$pull": {"transcripts": {"language": transcript["language"]}}},
        )
        await self.col.update_one(
            {"id": testimony_id},
            {"$push": {"transcripts": transcript}},
        )
        return await self.get(testimony_id)

    async def increment_play_count(self, testimony_id: str) -> None:
        await self.col.update_one({"id": testimony_id}, {"$inc": {"play_count": 1}})

    async def top_played(self, limit: int = 8) -> List[Testimony]:
        cur = self.col.find({"play_count": {"$gt": 0}}, _PROJECT).sort("play_count", -1).limit(limit)
        return [Testimony(**doc) async for doc in cur]

    async def delete(self, testimony_id: str) -> bool:
        r = await self.col.delete_one({"id": testimony_id})
        return r.deleted_count > 0

    async def count(self) -> int:
        return await self.col.count_documents({})


class CategoryRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["categories"]

    async def list(self) -> List[Category]:
        cur = self.col.find({}, _PROJECT).sort("order", 1)
        return [Category(**doc) async for doc in cur]

    async def insert_many(self, items: List[Category]) -> None:
        if items:
            await self.col.insert_many([c.model_dump() for c in items])

    async def count(self) -> int:
        return await self.col.count_documents({})


class NoteRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["notes"]

    async def insert(self, n: Note) -> Note:
        await self.col.insert_one(n.model_dump().copy())
        return n

    async def list(self, device_id: str, testimony_id: Optional[str] = None) -> List[Note]:
        q: dict[str, Any] = {"device_id": device_id}
        if testimony_id: q["testimony_id"] = testimony_id
        cur = self.col.find(q, _PROJECT).sort("created_at", -1)
        return [Note(**doc) async for doc in cur]

    async def get(self, device_id: str, note_id: str) -> Optional[Note]:
        raw = await self.col.find_one({"device_id": device_id, "id": note_id}, _PROJECT)
        return Note(**raw) if raw else None

    async def patch(self, device_id: str, note_id: str, fields: dict[str, Any]) -> Optional[Note]:
        if fields:
            await self.col.update_one({"device_id": device_id, "id": note_id}, {"$set": fields})
        return await self.get(device_id, note_id)

    async def delete(self, device_id: str, note_id: str) -> bool:
        r = await self.col.delete_one({"device_id": device_id, "id": note_id})
        return r.deleted_count > 0


class HighlightRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["highlights"]

    async def insert(self, h: Highlight) -> Highlight:
        await self.col.insert_one(h.model_dump().copy())
        return h

    async def list(self, device_id: str, testimony_id: Optional[str] = None) -> List[Highlight]:
        q: dict[str, Any] = {"device_id": device_id}
        if testimony_id: q["testimony_id"] = testimony_id
        cur = self.col.find(q, _PROJECT).sort("created_at", -1)
        return [Highlight(**doc) async for doc in cur]

    async def delete(self, device_id: str, highlight_id: str) -> bool:
        r = await self.col.delete_one({"device_id": device_id, "id": highlight_id})
        return r.deleted_count > 0


class HistoryRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["history"]

    async def upsert(self, entry: HistoryEntry) -> HistoryEntry:
        # keep one row per (device_id, testimony_id) with latest position
        await self.col.update_one(
            {"device_id": entry.device_id, "testimony_id": entry.testimony_id},
            {"$set": entry.model_dump()},
            upsert=True,
        )
        return entry

    async def list(self, device_id: str, limit: int = 50) -> List[HistoryEntry]:
        cur = self.col.find({"device_id": device_id}, _PROJECT).sort("at", -1).limit(limit)
        return [HistoryEntry(**doc) async for doc in cur]

    async def delete_all(self, device_id: str) -> int:
        r = await self.col.delete_many({"device_id": device_id})
        return r.deleted_count


class EventRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["events"]

    async def insert(self, e: AnalyticsEvent) -> AnalyticsEvent:
        await self.col.insert_one(e.model_dump().copy())
        return e

    async def counts_by_testimony(self, kind: str, limit: int = 8) -> list[dict]:
        cur = self.col.aggregate([
            {"$match": {"kind": kind, "testimony_id": {"$ne": None}}},
            {"$group": {"_id": "$testimony_id", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": limit},
        ])
        return [{"testimony_id": doc["_id"], "n": doc["n"]} async for doc in cur]
