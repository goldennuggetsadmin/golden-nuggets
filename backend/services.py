"""Service layer — business logic. NEVER touches Mongo directly. DB-agnostic."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile

import pdfplumber

from repositories import (
    CategoryRepository,
    EventRepository,
    HighlightRepository,
    HistoryRepository,
    NoteRepository,
    TestimonyRepository,
)
from schemas import (
    AnalyticsEvent,
    AnalyticsEventCreate,
    Category,
    Highlight,
    HighlightCreate,
    HistoryEntry,
    HistoryReport,
    HomeFeed,
    Note,
    NoteCreate,
    NoteUpdate,
    Testimony,
    TestimonyCreate,
    TestimonyUpdate,
    Transcript,
)
from storage_provider import StorageProvider


class TestimonyService:
    def __init__(
        self,
        testimony_repo: TestimonyRepository,
        category_repo: CategoryRepository,
        history_repo: HistoryRepository,
        event_repo: EventRepository,
        storage: StorageProvider,
        max_upload_bytes: int,
        allowed_image_mimes: list[str],
        allowed_audio_mimes: list[str],
        allowed_pdf_mimes: list[str],
    ):
        self.repo = testimony_repo
        self.category_repo = category_repo
        self.history_repo = history_repo
        self.event_repo = event_repo
        self.storage = storage
        self.max_upload_bytes = max_upload_bytes
        self.allowed_image_mimes = set(allowed_image_mimes)
        self.allowed_audio_mimes = set(allowed_audio_mimes)
        self.allowed_pdf_mimes = set(allowed_pdf_mimes)

    async def list(self, **kwargs) -> List[Testimony]:
        return await self.repo.list(**kwargs)

    async def get(self, testimony_id: str) -> Optional[Testimony]:
        return await self.repo.get(testimony_id)

    async def create(self, payload: TestimonyCreate) -> Testimony:
        t = Testimony(**payload.model_dump())
        return await self.repo.insert(t)

    async def update(self, testimony_id: str, payload: TestimonyUpdate) -> Optional[Testimony]:
        fields = {k: v for k, v in payload.model_dump().items() if v is not None}
        fields["updated_at"] = datetime.now(timezone.utc)
        return await self.repo.patch(testimony_id, fields)

    async def delete(self, testimony_id: str) -> bool:
        return await self.repo.delete(testimony_id)

    async def search(self, q: str, field: str = "all") -> List[Testimony]:
        return await self.repo.search(q, field)

    async def home_feed(self, device_id: Optional[str] = None) -> HomeFeed:
        all_items = await self.repo.list(limit=200, sort_field="created_at", sort_dir=-1)
        categories = await self.category_repo.list()

        # continue_listening: latest history entry for device with matching testimony
        continue_listening: Optional[Testimony] = None
        if device_id:
            history = await self.history_repo.list(device_id, limit=5)
            for h in history:
                if h.completed:
                    continue
                t = await self.repo.get(h.testimony_id)
                if t:
                    t.position = h.position
                    if t.duration:
                        t.progress = min(1.0, max(0.0, h.position / t.duration))
                    continue_listening = t
                    break
        if not continue_listening:
            with_progress = [t for t in all_items if 0 < t.progress < 1]
            continue_listening = with_progress[0] if with_progress else None

        # trending from events, fallback to first items
        trending_ids = [c["testimony_id"] for c in await self.event_repo.counts_by_testimony("play_start", 6)]
        popular: List[Testimony] = []
        if trending_ids:
            id_to = {t.id: t for t in all_items}
            popular = [id_to[i] for i in trending_ids if i in id_to]
        if len(popular) < 4:
            for t in all_items:
                if t not in popular:
                    popular.append(t)
                if len(popular) >= 4:
                    break

        featured = all_items[0] if all_items else None
        recently_added = all_items[:8]

        return HomeFeed(
            continue_listening=continue_listening,
            recently_added=recently_added,
            featured=featured,
            popular=popular,
            categories=categories,
        )

    def _guard_upload(self, file: UploadFile, allowed: set[str]) -> None:
        ct = (file.content_type or "").lower()
        if ct and allowed and ct not in allowed:
            raise HTTPException(400, f"content-type {ct} not allowed")

    async def _read_capped(self, file: UploadFile) -> bytes:
        data = await file.read()
        if len(data) > self.max_upload_bytes:
            raise HTTPException(413, "file too large")
        return data

    async def attach_audio(self, testimony_id: str, file: UploadFile) -> Optional[Testimony]:
        self._guard_upload(file, self.allowed_audio_mimes)
        content = await self._read_capped(file)
        key = f"audio/{testimony_id}/{uuid4().hex[:8]}-{file.filename}"
        url = await self.storage.save(key, content, content_type=file.content_type)
        return await self.repo.patch(
            testimony_id, {"audio_url": url, "audio_key": key, "audio_bytes": len(content)}
        )

    async def attach_artwork(self, testimony_id: str, file: UploadFile) -> Optional[Testimony]:
        self._guard_upload(file, self.allowed_image_mimes)
        content = await self._read_capped(file)
        key = f"artwork/{testimony_id}/{uuid4().hex[:8]}-{file.filename}"
        url = await self.storage.save(key, content, content_type=file.content_type)

        # Optional resize to a thumbnail — Pillow may not be installed on all envs; guard.
        thumb_url = None
        thumb_key = None
        try:
            from PIL import Image  # type: ignore
            im = Image.open(io.BytesIO(content))
            im.thumbnail((256, 256))
            out = io.BytesIO()
            fmt = "JPEG" if im.mode == "RGB" else "PNG"
            im.convert("RGB").save(out, format="JPEG", quality=82)
            thumb_bytes = out.getvalue()
            thumb_key = f"artwork/{testimony_id}/thumb-{uuid4().hex[:6]}.jpg"
            thumb_url = await self.storage.save(thumb_key, thumb_bytes, content_type="image/jpeg")
        except Exception:
            pass

        return await self.repo.patch(
            testimony_id,
            {"art_url": url, "art_key": key, "art_thumb_url": thumb_url, "art_thumb_key": thumb_key},
        )

    async def attach_transcript(
        self, testimony_id: str, file: UploadFile, language: str
    ) -> Optional[Testimony]:
        self._guard_upload(file, self.allowed_pdf_mimes)
        content = await self._read_capped(file)

        key = f"pdf/{testimony_id}/{language.lower()}-{uuid4().hex[:8]}-{file.filename}"
        url = await self.storage.save(key, content, content_type="application/pdf")

        text_parts: list[str] = []
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                if getattr(pdf, "is_encrypted", False):
                    raise HTTPException(400, "encrypted PDF not supported")
                for page in pdf.pages:
                    t = page.extract_text() or ""
                    if t:
                        text_parts.append(t)
        except HTTPException:
            raise
        except Exception:
            text_parts = []

        text = "\n\n".join(text_parts).strip()
        transcript = Transcript(language=language, pdf_url=url, pdf_key=key, text=text).model_dump()
        return await self.repo.upsert_transcript(testimony_id, transcript)

    async def report_progress(self, device_id: str, report: HistoryReport) -> HistoryEntry:
        t = await self.repo.get(report.testimony_id)
        if not t:
            raise HTTPException(404, "testimony not found")
        progress = min(1.0, max(0.0, report.position / t.duration)) if t.duration else 0.0
        await self.repo.patch(
            report.testimony_id,
            {"progress": progress, "position": report.position, "updated_at": datetime.now(timezone.utc)},
        )
        entry = HistoryEntry(
            device_id=device_id,
            testimony_id=report.testimony_id,
            position=report.position,
            completed=report.completed or progress >= 0.98,
        )
        return await self.history_repo.upsert(entry)


class CategoryService:
    DEFAULTS: List[dict] = [
        {"name": "Healing", "tone": "emerald", "order": 0},
        {"name": "Faith", "tone": "gold", "order": 1},
        {"name": "Prayer", "tone": "slate", "order": 2},
        {"name": "Marriage", "tone": "slate", "order": 3},
        {"name": "Youth", "tone": "emerald", "order": 4},
        {"name": "Salvation", "tone": "gold", "order": 5},
        {"name": "Prophecy", "tone": "slate", "order": 6},
        {"name": "Bible Study", "tone": "slate", "order": 7},
        {"name": "Q & A", "tone": "emerald", "order": 8},
        {"name": "Special Meetings", "tone": "gold", "order": 9},
    ]

    def __init__(self, repo: CategoryRepository):
        self.repo = repo

    async def list(self) -> List[Category]:
        return await self.repo.list()

    async def seed_defaults_if_empty(self) -> None:
        if await self.repo.count() == 0:
            await self.repo.insert_many([Category(**c) for c in self.DEFAULTS])


class NoteService:
    def __init__(self, repo: NoteRepository):
        self.repo = repo

    async def list(self, device_id: str, testimony_id: Optional[str] = None) -> List[Note]:
        return await self.repo.list(device_id, testimony_id)

    async def create(self, device_id: str, payload: NoteCreate) -> Note:
        n = Note(device_id=device_id, testimony_id=payload.testimony_id, body=payload.body, position=payload.position)
        return await self.repo.insert(n)

    async def update(self, device_id: str, note_id: str, payload: NoteUpdate) -> Note:
        fields = {k: v for k, v in payload.model_dump().items() if v is not None}
        fields["updated_at"] = datetime.now(timezone.utc)
        n = await self.repo.patch(device_id, note_id, fields)
        if not n:
            raise HTTPException(404, "note not found")
        return n

    async def delete(self, device_id: str, note_id: str) -> None:
        if not await self.repo.delete(device_id, note_id):
            raise HTTPException(404, "note not found")


class HighlightService:
    def __init__(self, repo: HighlightRepository):
        self.repo = repo

    async def list(self, device_id: str, testimony_id: Optional[str] = None) -> List[Highlight]:
        return await self.repo.list(device_id, testimony_id)

    async def create(self, device_id: str, payload: HighlightCreate) -> Highlight:
        h = Highlight(
            device_id=device_id,
            testimony_id=payload.testimony_id,
            quote=payload.quote.strip(),
            language=payload.language,
            position=payload.position,
        )
        if not h.quote:
            raise HTTPException(400, "quote required")
        return await self.repo.insert(h)

    async def delete(self, device_id: str, highlight_id: str) -> None:
        if not await self.repo.delete(device_id, highlight_id):
            raise HTTPException(404, "highlight not found")


class HistoryService:
    def __init__(
        self,
        history_repo: HistoryRepository,
        testimony_repo: TestimonyRepository,
    ):
        self.history_repo = history_repo
        self.testimony_repo = testimony_repo

    async def list(self, device_id: str) -> List[dict]:
        entries = await self.history_repo.list(device_id, limit=100)
        rows: list[dict] = []
        for e in entries:
            t = await self.testimony_repo.get(e.testimony_id)
            if not t: continue
            rows.append({
                "id": e.id, "testimony": t.model_dump(),
                "position": e.position, "completed": e.completed, "at": e.at,
            })
        return rows

    async def clear(self, device_id: str) -> int:
        return await self.history_repo.delete_all(device_id)


class AnalyticsService:
    def __init__(self, repo: EventRepository, testimony_repo: TestimonyRepository):
        self.repo = repo
        self.testimony_repo = testimony_repo

    async def track(self, device_id: str, payload: AnalyticsEventCreate) -> AnalyticsEvent:
        e = AnalyticsEvent(
            device_id=device_id, kind=payload.kind,
            testimony_id=payload.testimony_id, payload=payload.payload,
        )
        await self.repo.insert(e)
        if payload.kind == "play_start" and payload.testimony_id:
            await self.testimony_repo.increment_play_count(payload.testimony_id)
        return e
