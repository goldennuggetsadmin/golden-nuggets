"""Pydantic models for Golden Nuggets — production."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Literal, Any, Dict
import uuid

from pydantic import BaseModel, Field, EmailStr, ConfigDict


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    access_token: Optional[str] = None


# ---------- Sermon ----------
SermonStatus = Literal["draft", "published", "scheduled", "archived"]
SermonSource = Literal["manual", "import", "bulk_import"]


class SermonBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    speaker: str = ""
    date: Optional[str] = None
    year: Optional[str] = None
    location: Optional[str] = None
    state: Optional[str] = None
    series: Optional[str] = None
    language: str = "en"
    description: Optional[str] = None
    duration: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    category_ids: List[str] = Field(default_factory=list)
    featured: bool = False
    status: SermonStatus = "draft"
    source: SermonSource = "manual"
    source_url: Optional[str] = None
    sermon_code: Optional[str] = None
    audio_url: Optional[str] = None
    audio_storage_path: Optional[str] = None
    artwork_url: Optional[str] = None
    artwork_storage_path: Optional[str] = None
    pdf_english_url: Optional[str] = None
    pdf_english_storage_path: Optional[str] = None
    english_pdf_storage_path: Optional[str] = None
    english_pdf_hash: Optional[str] = None
    english_pdf_size: Optional[int] = None
    english_pdf_filename: Optional[str] = None
    english_pdf_page_count: Optional[int] = None

    pdf_telugu_url: Optional[str] = None
    pdf_telugu_storage_path: Optional[str] = None
    telugu_pdf_storage_path: Optional[str] = None
    telugu_pdf_hash: Optional[str] = None
    telugu_pdf_size: Optional[int] = None
    telugu_pdf_filename: Optional[str] = None
    telugu_pdf_page_count: Optional[int] = None

    official_pdf_hash: Optional[str] = None
    canonical_text: Optional[str] = None
    canonical_text_hash: Optional[str] = None
    
    # Manual Boundary Overrides
    manual_canonical_start_page: Optional[int] = None
    manual_canonical_start_paragraph: Optional[int] = None
    manual_canonical_end_page: Optional[int] = None
    manual_canonical_end_paragraph: Optional[int] = None
    import_engine: Dict[str, str] = Field(default_factory=lambda: {
        "name": "publisher-aware-pdfplumber",
        "version": "2.1.0"
    })
    import_report: Optional[Dict[str, Any]] = None
    current_version: int = 1
    versions: List[Dict[str, Any]] = Field(default_factory=list)
    audit_timeline: List[Dict[str, Any]] = Field(default_factory=list)
    transcript: Optional[str] = None
    transcripts: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    transcript_page_count: Optional[int] = 0
    transcript_paragraph_count: Optional[int] = 0
    transcript_parsed: bool = False
    transcript_parser_version: Optional[str] = "5.0-canonical-preservation"


class SermonCreate(SermonBase):
    pass


class SermonUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    speaker: Optional[str] = None
    date: Optional[str] = None
    year: Optional[str] = None
    location: Optional[str] = None
    state: Optional[str] = None
    series: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[str] = None
    tags: Optional[List[str]] = None
    category_ids: Optional[List[str]] = None
    featured: Optional[bool] = None
    status: Optional[SermonStatus] = None
    sermon_code: Optional[str] = None
    audio_url: Optional[str] = None
    audio_storage_path: Optional[str] = None
    artwork_url: Optional[str] = None
    artwork_storage_path: Optional[str] = None
    pdf_english_url: Optional[str] = None
    pdf_english_storage_path: Optional[str] = None
    english_pdf_storage_path: Optional[str] = None
    english_pdf_hash: Optional[str] = None
    english_pdf_size: Optional[int] = None
    english_pdf_filename: Optional[str] = None
    english_pdf_page_count: Optional[int] = None
    pdf_telugu_url: Optional[str] = None
    pdf_telugu_storage_path: Optional[str] = None
    telugu_pdf_storage_path: Optional[str] = None
    telugu_pdf_hash: Optional[str] = None
    telugu_pdf_size: Optional[int] = None
    telugu_pdf_filename: Optional[str] = None
    telugu_pdf_page_count: Optional[int] = None
    official_pdf_hash: Optional[str] = None
    canonical_text: Optional[str] = None
    canonical_text_hash: Optional[str] = None
    import_engine: Optional[Dict[str, str]] = None
    import_report: Optional[Dict[str, Any]] = None
    transcript: Optional[str] = None
    transcripts: Optional[List[Dict[str, Any]]] = None
    transcript_page_count: Optional[int] = None
    transcript_paragraph_count: Optional[int] = None
    transcript_parsed: Optional[bool] = None
    transcript_parser_version: Optional[str] = None


class Sermon(SermonBase):
    id: str = Field(default_factory=_new_id)
    is_archived: bool = False
    play_count: int = 0
    download_count: int = 0
    favorite_count: int = 0
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ---------- Meeting ----------
MeetingStatus = Literal["draft", "upcoming", "live", "completed", "archived"]


class MeetingBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    speaker: str = ""
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    google_maps_url: Optional[str] = None
    youtube_url: Optional[str] = None
    registration_link: Optional[str] = None
    banner_url: Optional[str] = None
    banner_storage_path: Optional[str] = None
    featured: bool = False
    notify_users: bool = False
    status: MeetingStatus = "draft"


class MeetingCreate(MeetingBase):
    pass


class MeetingUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    speaker: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    google_maps_url: Optional[str] = None
    youtube_url: Optional[str] = None
    registration_link: Optional[str] = None
    banner_url: Optional[str] = None
    banner_storage_path: Optional[str] = None
    featured: Optional[bool] = None
    notify_users: Optional[bool] = None
    status: Optional[MeetingStatus] = None


class Meeting(MeetingBase):
    id: str = Field(default_factory=_new_id)
    is_archived: bool = False
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ---------- Category ----------
class CategoryBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    slug: str
    description: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None


class Category(CategoryBase):
    id: str = Field(default_factory=_new_id)
    created_at: str = Field(default_factory=_now)


# ---------- Media asset ----------
class MediaAsset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    kind: Literal["audio", "pdf", "artwork", "banner", "other"]
    original_filename: str
    content_type: str
    size: int
    storage_path: str
    provider: str = "supabase"
    public_url: Optional[str] = None
    linked_type: Optional[str] = None
    linked_id: Optional[str] = None
    is_deleted: bool = False
    created_at: str = Field(default_factory=_now)


# ---------- Import ----------
class ImportPreview(BaseModel):
    source_url: str
    title: Optional[str] = None
    sermon_code: Optional[str] = None
    speaker: Optional[str] = None
    date: Optional[str] = None
    year: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    audio_url: Optional[str] = None
    pdf_english_url: Optional[str] = None
    pdf_telugu_url: Optional[str] = None
    artwork_url: Optional[str] = None
    duration: Optional[str] = None
    language: Optional[str] = None
    category_ids: List[str] = Field(default_factory=list)
    status: Optional[str] = "published"


class ImportUrlRequest(BaseModel):
    url: str


# ---------- Home Management ----------
class HomeConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global"
    featured_banner_sermon_id: Optional[str] = None
    featured_banner_meeting_id: Optional[str] = None
    featured_banner_title: Optional[str] = None
    featured_banner_subtitle: Optional[str] = None
    featured_banner_image_url: Optional[str] = None
    featured_banner_image_storage_path: Optional[str] = None
    featured_sermon_ids: List[str] = Field(default_factory=list)
    recently_added_count: int = 6
    category_ids: List[str] = Field(default_factory=list)
    upcoming_meeting_ids: List[str] = Field(default_factory=list)
    show_recently_added: bool = True
    show_upcoming_meetings: bool = True
    updated_at: str = Field(default_factory=_now)


class HomeConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    featured_banner_sermon_id: Optional[str] = None
    featured_banner_meeting_id: Optional[str] = None
    featured_banner_title: Optional[str] = None
    featured_banner_subtitle: Optional[str] = None
    featured_banner_image_url: Optional[str] = None
    featured_banner_image_storage_path: Optional[str] = None
    featured_sermon_ids: Optional[List[str]] = None
    recently_added_count: Optional[int] = None
    category_ids: Optional[List[str]] = None
    upcoming_meeting_ids: Optional[List[str]] = None
    show_recently_added: Optional[bool] = None
    show_upcoming_meetings: Optional[bool] = None


# ---------- Notifications ----------
NotificationStatus = Literal["draft", "scheduled", "published", "cancelled"]


class NotificationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    body: str
    deep_link: Optional[str] = None
    audience: Literal["all", "language"] = "all"
    language: Optional[str] = None
    schedule_at: Optional[str] = None
    status: NotificationStatus = "draft"


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    body: Optional[str] = None
    deep_link: Optional[str] = None
    audience: Optional[Literal["all", "language"]] = None
    language: Optional[str] = None
    schedule_at: Optional[str] = None
    status: Optional[NotificationStatus] = None


class Notification(NotificationBase):
    id: str = Field(default_factory=_new_id)
    delivered_at: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ---------- Mobile analytics ----------
MobileEventType = Literal["play", "pause", "completed", "download", "favorite", "unfavorite", "search", "share"]


class MobileEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    event: MobileEventType
    sermon_id: Optional[str] = None
    meeting_id: Optional[str] = None
    query: Optional[str] = None
    position_seconds: Optional[float] = None
    device_id: Optional[str] = None
    platform: Optional[Literal["ios", "android", "web"]] = None
    app_version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------- Bulk ----------
class BulkActionRequest(BaseModel):
    ids: List[str]
    action: Literal["publish", "unpublish", "feature", "unfeature", "delete", "archive", "restore", "assign-category"]
    category_id: Optional[str] = None


# ---------- Settings ----------
class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ministry_name: Optional[str] = None
    support_email: Optional[str] = None
    default_language: Optional[str] = None
    weekly_banner: Optional[bool] = None
    storage_plan: Optional[str] = None
    backup_schedule: Optional[str] = None
    media_quality: Optional[str] = None
    keep_originals: Optional[bool] = None
    app_name: Optional[str] = None
    home_banner: Optional[str] = None
    default_sort: Optional[str] = None
    offline_downloads: Optional[bool] = None
    notify_new_sermon: Optional[bool] = None
    notify_before_meeting: Optional[str] = None
    quiet_hours: Optional[str] = None
    auto_meeting_reminders: Optional[bool] = None
    default_import_status: Optional[str] = None
    auto_download_pdfs: Optional[bool] = None
    auto_download_artwork: Optional[bool] = None
    auto_publish_trusted: Optional[bool] = None
