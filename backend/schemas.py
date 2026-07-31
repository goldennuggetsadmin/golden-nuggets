"""Domain models — kept database-agnostic. Repositories translate to storage."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def _uid() -> str:
    return uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------- Category -------------------------------


class Category(BaseModel):
    id: str = Field(default_factory=_uid)
    name: str
    tone: str = "slate"
    order: int = 0


# ------------------------------- Transcript / Testimony -----------------


class Transcript(BaseModel):
    language: str
    pdf_url: Optional[str] = None
    pdf_key: Optional[str] = None
    text: str = ""
    updated_at: datetime = Field(default_factory=_now)


class Testimony(BaseModel):
    id: str = Field(default_factory=_uid)
    title: str
    speaker: str
    category: str
    year: int
    language: str = "English"
    duration: int = 0
    verse: Optional[str] = None

    art_url: Optional[str] = None
    art_key: Optional[str] = None
    art_thumb_url: Optional[str] = None
    art_thumb_key: Optional[str] = None

    audio_url: Optional[str] = None
    audio_key: Optional[str] = None
    audio_bytes: int = 0

    favorite: bool = False
    downloaded: bool = False
    progress: float = 0.0
    position: int = 0  # seconds
    play_count: int = 0

    transcripts: List[Transcript] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class TestimonyCreate(BaseModel):
    title: str
    speaker: str
    category: str
    year: int
    language: str = "English"
    duration: int = 0
    verse: Optional[str] = None


class TestimonyUpdate(BaseModel):
    title: Optional[str] = None
    speaker: Optional[str] = None
    category: Optional[str] = None
    year: Optional[int] = None
    language: Optional[str] = None
    duration: Optional[int] = None
    verse: Optional[str] = None
    favorite: Optional[bool] = None
    downloaded: Optional[bool] = None
    progress: Optional[float] = None
    position: Optional[int] = None


class HomeFeed(BaseModel):
    continue_listening: Optional[Testimony] = None
    recently_added: List[Testimony] = Field(default_factory=list)
    featured: Optional[Testimony] = None
    popular: List[Testimony] = Field(default_factory=list)
    categories: List[Category] = Field(default_factory=list)


# ------------------------------- Notes ----------------------------------


class Note(BaseModel):
    id: str = Field(default_factory=_uid)
    device_id: str
    testimony_id: str
    body: str
    position: Optional[int] = None  # seconds inside the audio, optional anchor
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class NoteCreate(BaseModel):
    testimony_id: str
    body: str
    position: Optional[int] = None


class NoteUpdate(BaseModel):
    body: Optional[str] = None
    position: Optional[int] = None


# ------------------------------- Highlights -----------------------------


class Highlight(BaseModel):
    id: str = Field(default_factory=_uid)
    device_id: str
    testimony_id: str
    quote: str
    language: str = "English"
    position: Optional[int] = None
    created_at: datetime = Field(default_factory=_now)


class HighlightCreate(BaseModel):
    testimony_id: str
    quote: str
    language: str = "English"
    position: Optional[int] = None


# ------------------------------- History --------------------------------


class HistoryEntry(BaseModel):
    id: str = Field(default_factory=_uid)
    device_id: str
    testimony_id: str
    position: int = 0
    completed: bool = False
    at: datetime = Field(default_factory=_now)


class HistoryReport(BaseModel):
    testimony_id: str
    position: int
    completed: bool = False


# ------------------------------- Analytics ------------------------------


class AnalyticsEvent(BaseModel):
    id: str = Field(default_factory=_uid)
    device_id: str
    kind: str  # play_start | play_pause | play_complete | download_start | download_finish | search | share
    testimony_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    at: datetime = Field(default_factory=_now)


class AnalyticsEventCreate(BaseModel):
    kind: str
    testimony_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)
