"""
FastAPI application. Controllers only — all logic lives in services.py.
Every route is prefixed with /api to match ingress rules.

DB-agnostic design: services and controllers never import motor. Only
`repositories.py` and this file's DI wiring know the DB is Mongo.
"""
from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient

from config import get_settings
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
    HomeFeed,
    Note,
    NoteCreate,
    NoteUpdate,
    Testimony,
    TestimonyCreate,
    TestimonyUpdate,
    HistoryReport,
)
from services import (
    AnalyticsService,
    CategoryService,
    HighlightService,
    HistoryService,
    NoteService,
    TestimonyService,
)
from storage_provider import build_storage

# ---------------------------------------------------------------- config
settings = get_settings()

class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
)
for _h in logging.getLogger().handlers:
    _h.addFilter(_RequestIdFilter())
log = logging.getLogger("sanctuary")

# ---------------------------------------------------------------- infra
client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]
storage = build_storage()

# ---------------------------------------------------------------- app
app = FastAPI(title="Sanctuary API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

# CORS — env-driven, defaults to '*' in development.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.allowed_origins if settings.allowed_origins else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# ---------------------------------------------------------------- middleware
@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    try:
        response: Response = await call_next(request)
    except Exception as exc:
        log.exception("unhandled error [rid=%s]: %s", rid, exc)
        return JSONResponse(status_code=500, content={"detail": "internal error", "request_id": rid})
    dt = (time.perf_counter() - t0) * 1000
    response.headers["X-Request-Id"] = rid
    log.info("%s %s -> %d in %.1fms [rid=%s]", request.method, request.url.path, response.status_code, dt, rid)
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp: Response = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    return resp


# ---------------------------------------------------------------- DI
def get_device_id(x_device_id: Optional[str] = Header(default=None, alias="X-Device-Id")) -> str:
    return (x_device_id or "").strip() or "anonymous"


def testimony_service() -> TestimonyService:
    return TestimonyService(
        TestimonyRepository(db),
        CategoryRepository(db),
        HistoryRepository(db),
        EventRepository(db),
        storage,
        max_upload_bytes=settings.max_upload_bytes,
        allowed_image_mimes=settings.allowed_image_mimes,
        allowed_audio_mimes=settings.allowed_audio_mimes,
        allowed_pdf_mimes=settings.allowed_pdf_mimes,
    )


def category_service() -> CategoryService:
    return CategoryService(CategoryRepository(db))


def note_service() -> NoteService:
    return NoteService(NoteRepository(db))


def highlight_service() -> HighlightService:
    return HighlightService(HighlightRepository(db))


def history_service() -> HistoryService:
    return HistoryService(HistoryRepository(db), TestimonyRepository(db))


def analytics_service() -> AnalyticsService:
    return AnalyticsService(EventRepository(db), TestimonyRepository(db))


# ---------------------------------------------------------------- lifecycle
@app.on_event("startup")
async def _startup() -> None:
    await category_service().seed_defaults_if_empty()
    log.info("startup ok — env=%s db=%s storage=%s", settings.app_env, settings.db_name, settings.storage_provider)


@app.on_event("shutdown")
async def _shutdown() -> None:
    client.close()


# ---------------------------------------------------------------- health
@app.get("/api/")
async def root(): return {"service": "sanctuary", "status": "ok", "env": settings.app_env}


@app.get("/api/health")
async def health(): return {"status": "ok"}


@app.get("/api/ready")
async def ready():
    # cheap connectivity probe
    try:
        await db.command("ping")
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(503, f"db not ready: {e}")


# ---------------------------------------------------------------- categories
@app.get("/api/categories", response_model=List[Category])
async def list_categories(svc: CategoryService = Depends(category_service)):
    return await svc.list()


# ---------------------------------------------------------------- testimonies
@app.get("/api/testimonies", response_model=List[Testimony])
async def list_testimonies(
    category: Optional[str] = None,
    language: Optional[str] = None,
    favorite: Optional[bool] = None,
    downloaded: Optional[bool] = None,
    limit: int = 100,
    skip: int = 0,
    svc: TestimonyService = Depends(testimony_service),
):
    return await svc.list(category=category, language=language, favorite=favorite,
                          downloaded=downloaded, limit=limit, skip=skip)


@app.get("/api/testimonies/home", response_model=HomeFeed)
async def home_feed(
    device_id: str = Depends(get_device_id),
    svc: TestimonyService = Depends(testimony_service),
):
    return await svc.home_feed(device_id=device_id)


@app.get("/api/testimonies/search", response_model=List[Testimony])
async def search(
    q: str = Query(...),
    field: str = Query("all"),
    svc: TestimonyService = Depends(testimony_service),
):
    return await svc.search(q, field)


@app.get("/api/testimonies/{testimony_id}", response_model=Testimony)
async def get_testimony(testimony_id: str, svc: TestimonyService = Depends(testimony_service)):
    t = await svc.get(testimony_id)
    if not t: raise HTTPException(404, "not found")
    return t


@app.post("/api/testimonies", response_model=Testimony)
async def create_testimony(payload: TestimonyCreate, svc: TestimonyService = Depends(testimony_service)):
    return await svc.create(payload)


@app.patch("/api/testimonies/{testimony_id}", response_model=Testimony)
async def update_testimony(
    testimony_id: str, payload: TestimonyUpdate,
    svc: TestimonyService = Depends(testimony_service),
):
    updated = await svc.update(testimony_id, payload)
    if not updated: raise HTTPException(404, "not found")
    return updated


@app.delete("/api/testimonies/{testimony_id}")
async def delete_testimony(testimony_id: str, svc: TestimonyService = Depends(testimony_service)):
    if not await svc.delete(testimony_id): raise HTTPException(404, "not found")
    return {"deleted": True}


@app.post("/api/testimonies/{testimony_id}/audio", response_model=Testimony)
async def upload_audio(
    testimony_id: str, file: UploadFile = File(...),
    svc: TestimonyService = Depends(testimony_service),
):
    t = await svc.attach_audio(testimony_id, file)
    if not t: raise HTTPException(404, "not found")
    return t


@app.post("/api/testimonies/{testimony_id}/artwork", response_model=Testimony)
async def upload_artwork(
    testimony_id: str, file: UploadFile = File(...),
    svc: TestimonyService = Depends(testimony_service),
):
    t = await svc.attach_artwork(testimony_id, file)
    if not t: raise HTTPException(404, "not found")
    return t


@app.post("/api/testimonies/{testimony_id}/transcript", response_model=Testimony)
async def upload_transcript(
    testimony_id: str, language: str = Form(...), file: UploadFile = File(...),
    svc: TestimonyService = Depends(testimony_service),
):
    if language not in {"English", "Telugu"}:
        raise HTTPException(400, "language must be English or Telugu")
    t = await svc.attach_transcript(testimony_id, file, language)
    if not t: raise HTTPException(404, "not found")
    return t


@app.post("/api/testimonies/{testimony_id}/progress")
async def report_progress(
    testimony_id: str,
    payload: HistoryReport,
    device_id: str = Depends(get_device_id),
    svc: TestimonyService = Depends(testimony_service),
):
    if payload.testimony_id != testimony_id:
        raise HTTPException(400, "testimony id mismatch")
    entry = await svc.report_progress(device_id, payload)
    return entry


# ---------------------------------------------------------------- notes
@app.get("/api/notes", response_model=List[Note])
async def list_notes(
    testimony_id: Optional[str] = None,
    device_id: str = Depends(get_device_id),
    svc: NoteService = Depends(note_service),
):
    return await svc.list(device_id, testimony_id)


@app.post("/api/notes", response_model=Note)
async def create_note(
    payload: NoteCreate,
    device_id: str = Depends(get_device_id),
    svc: NoteService = Depends(note_service),
):
    return await svc.create(device_id, payload)


@app.patch("/api/notes/{note_id}", response_model=Note)
async def update_note(
    note_id: str, payload: NoteUpdate,
    device_id: str = Depends(get_device_id),
    svc: NoteService = Depends(note_service),
):
    return await svc.update(device_id, note_id, payload)


@app.delete("/api/notes/{note_id}")
async def delete_note(
    note_id: str,
    device_id: str = Depends(get_device_id),
    svc: NoteService = Depends(note_service),
):
    await svc.delete(device_id, note_id)
    return {"deleted": True}


# ---------------------------------------------------------------- highlights
@app.get("/api/highlights", response_model=List[Highlight])
async def list_highlights(
    testimony_id: Optional[str] = None,
    device_id: str = Depends(get_device_id),
    svc: HighlightService = Depends(highlight_service),
):
    return await svc.list(device_id, testimony_id)


@app.post("/api/highlights", response_model=Highlight)
async def create_highlight(
    payload: HighlightCreate,
    device_id: str = Depends(get_device_id),
    svc: HighlightService = Depends(highlight_service),
):
    return await svc.create(device_id, payload)


@app.delete("/api/highlights/{highlight_id}")
async def delete_highlight(
    highlight_id: str,
    device_id: str = Depends(get_device_id),
    svc: HighlightService = Depends(highlight_service),
):
    await svc.delete(device_id, highlight_id)
    return {"deleted": True}


# ---------------------------------------------------------------- history
@app.get("/api/history")
async def list_history(
    device_id: str = Depends(get_device_id),
    svc: HistoryService = Depends(history_service),
):
    return await svc.list(device_id)


@app.delete("/api/history")
async def clear_history(
    device_id: str = Depends(get_device_id),
    svc: HistoryService = Depends(history_service),
):
    n = await svc.clear(device_id)
    return {"cleared": n}


# ---------------------------------------------------------------- analytics
@app.post("/api/analytics/events", response_model=AnalyticsEvent)
async def track_event(
    payload: AnalyticsEventCreate,
    device_id: str = Depends(get_device_id),
    svc: AnalyticsService = Depends(analytics_service),
):
    return await svc.track(device_id, payload)


# ---------------------------------------------------------------- media
@app.get("/api/media/{path:path}")
@app.head("/api/media/{path:path}")
async def serve_media(path: str):
    p = storage.local_path(path)
    if p is None or not Path(p).exists():
        raise HTTPException(404, "not found")
    return FileResponse(str(p))


# ---------------------------------------------------------------- errors
@app.exception_handler(ValueError)
async def _value_error_handler(_request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})
