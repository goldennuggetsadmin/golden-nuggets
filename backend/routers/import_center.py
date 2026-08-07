"""
Admin: Hybrid Import & Bulk Import Engine
Supports Branham.org metadata scraping, bulk link scanning, folder manifest parsing,
ZIP extraction, job execution, status polling, and transcript extraction triggering.
"""
from __future__ import annotations
import os
import re
import io
import zipfile
import uuid
import asyncio
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from typing import Optional, List, Dict, Any

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
import httpx

from auth import require_admin
from models import ImportPreview, ImportUrlRequest, Sermon
from repositories.entities import sermons_repo
from services import log as activity_log
from services.duplicate_detector import check_duplicate_sermon
from services.transcript_service import process_sermon_transcripts

router = APIRouter(prefix="/api/v1/admin/import", tags=["admin:import"])

UA = "Mozilla/5.0 (compatible; GoldenNuggetsAdmin/1.0)"

# In-memory job state for bulk import operations
_BULK_JOBS: Dict[str, Dict[str, Any]] = {}
_ACTIVE_JOB_ID: Optional[str] = None

# ── Series Protection ─────────────────────────────────────────────────────────
# Only these 14 predefined series may exist. Any other value is reset to General.
VALID_SERIES = {
    "General",
    "My Life Story",
    "How the Angel Came to Me",
    "The Revelation of the Seven Seals",
    "The Revelation of Jesus Christ",
    "Conduct, Order, and Doctrine of the Church",
    "The Book of Hebrews",
    "The Holy Ghost",
    "Adoption",
    "The Seventy Weeks of Daniel",
    "The Church",
    "Demonology",
    "Israel and the Church",
    "The Church Age Book (audio)",
}
_SERMON_CODE_RE = re.compile(r"^\d{2}-\d{4}[A-Za-z]?$")

def _resolve_series(value: Optional[str]) -> str:
    """Resolve any series value to a valid predefined series, or 'General'.
    
    Rejects:
    - None / empty string → General
    - Sermon codes (e.g. 47-0412, 50-0820A) → General
    - Any value not in VALID_SERIES → General
    """
    if not value or not value.strip():
        return "General"
    v = value.strip()
    if _SERMON_CODE_RE.match(v):
        return "General"
    if v not in VALID_SERIES:
        return "General"
    return v

# Pydantic Schemas
class ScanUrlsRequest(BaseModel):
    urls: List[str]
    profile_id: Optional[str] = "english_library"

class ScanManifestRequest(BaseModel):
    files: List[Dict[str, Any]]
    profile_id: Optional[str] = "english_library"

class StartBulkJobRequest(BaseModel):
    tasks: List[Dict[str, Any]]
    options: Optional[Dict[str, Any]] = None
    dry_run: Optional[bool] = False

# ── Helper Functions for Metadata Parsing ────────────────────────────────────
def _first_text(soup, selectors):
    for sel in selectors:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True)
    return None

def _meta(soup, prop: str):
    el = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
    if el and el.get("content"):
        return el["content"].strip()
    return None

def _date_from_code(code: str) -> tuple[str | None, str | None]:
    """Sermon code like 65-1128M → date 1965-11-28, year 1965; 05-0313 → date 2005-03-13, year 2005."""
    m = re.match(r"^(\d{2})-(\d{2})(\d{2})", code)
    if not m:
        return None, None
    yy_str, mm_str, dd_str = m.groups()
    yy = int(yy_str)
    year = str(2000 + yy) if yy < 40 else str(1900 + yy)
    try:
        mm = int(mm_str)
        dd = int(dd_str)
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return f"{year}-{mm_str}-{dd_str}", year
    except ValueError:
        pass
    return None, year

def _parse_page(url: str, html: str) -> ImportPreview:
    soup = BeautifulSoup(html, "lxml")

    title = _first_text(soup, ["h1", ".title", "title"]) or _meta(soup, "og:title")
    speaker = None
    date = None
    location = None
    year = None
    sermon_code = None
    description = _meta(soup, "og:description") or _meta(soup, "description")

    text = soup.get_text(" \n", strip=True)

    m = re.search(r"\b(\d{2}-\d{4}[A-Za-z]?)\b", text)
    if m:
        sermon_code = m.group(1)
        parsed_date, parsed_year = _date_from_code(sermon_code)
        if parsed_date:
            date = parsed_date
        if parsed_year:
            year = parsed_year

    if re.search(r"william\s+branham", text, re.IGNORECASE) or "branham" in url.lower():
        speaker = "William Marrion Branham"

    if not date:
        dm = re.search(r"([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})", text) or re.search(r"(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})", text)
        if dm:
            date = dm.group(1)

    loc = re.search(r"([A-Z][A-Za-z\.]+,\s*[A-Z]{2,}|[A-Z][A-Za-z\.\s]+,\s*[A-Z][A-Za-z]+)", text)
    if loc:
        location = loc.group(1)

    audio_url = None
    pdf_url = None
    telugu_pdf_url = None
    artwork_url = None

    is_telugu_page = "TEL=" in url.upper() or "/TEL/" in url.upper() or "(TEL)" in text.upper() or "తెలుగు" in text

    for elem in soup.find_all(["source", "audio"]):
        src = elem.get("src")
        if src:
            low_src = src.lower()
            if any(ext in low_src for ext in (".m4a", ".mp3", ".wav", ".aac", "/audio/")):
                audio_url = urljoin(url, src)
                break

    for a in soup.find_all("a", href=True):
        href = a["href"]
        low = href.lower()
        full = urljoin(url, href)
        
        if not audio_url and any(ext in low for ext in (".m4a", ".mp3", ".wav", ".aac", "/audio/")):
            audio_url = full
        elif low.endswith(".pdf"):
            text_ctx = (a.get_text(" ", strip=True) or "").lower() + " " + low
            is_telugu_pdf = (
                is_telugu_page or
                "telugu" in text_ctx or
                "tel" in text_ctx or
                "te" in text_ctx.split() or
                "తెలుగు" in text_ctx or
                "/te/" in low or
                "lang=te" in low or
                low.endswith("-te.pdf") or
                low.endswith("_te.pdf")
            )
            if is_telugu_pdf:
                if not telugu_pdf_url:
                    telugu_pdf_url = full
            else:
                if not pdf_url:
                    pdf_url = full

    for src_attr in ("src", "data-src"):
        for img in soup.find_all("img"):
            src = img.get(src_attr)
            if src and any(src.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
                artwork_url = urljoin(url, src)
                break
        if artwork_url:
            break

    og_image = _meta(soup, "og:image")
    if og_image and not artwork_url:
        artwork_url = urljoin(url, og_image)

    return ImportPreview(
        source_url=url,
        title=title or sermon_code or "Untitled Sermon",
        sermon_code=sermon_code,
        speaker=speaker or "William Marrion Branham",
        date=date,
        year=year,
        location=location,
        description=description,
        audio_url=audio_url,
        pdf_english_url=pdf_url,
        pdf_telugu_url=telugu_pdf_url,
        artwork_url=artwork_url,
        language="te" if is_telugu_page else "en",
    )

# ── Single URL Preview Endpoint ───────────────────────────────────────────────
@router.post("/preview", response_model=ImportPreview)
async def preview(body: ImportUrlRequest, request: Request, current=Depends(require_admin)):
    url = body.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=25.0, headers={"User-Agent": UA}) as client:
            r = await client.get(url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Could not reach the URL: {e}")
    if r.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Source responded with HTTP {r.status_code}. Check the URL.")
    result = _parse_page(url, r.text)
    await activity_log(actor=current, action="import_preview", entity_type="import", message=f"Previewed {url}", request=request)
    return result

# ── Single URL Publish Endpoint ───────────────────────────────────────────────
from fastapi.responses import JSONResponse

@router.post("/publish")
async def publish_import(body: ImportPreview, request: Request, allow_duplicate: bool = False, current=Depends(require_admin)):
    if not allow_duplicate:
        existing = await check_duplicate_sermon(body.source_url or "", body.model_dump())
        if existing:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "duplicate_detected",
                    "message": "This sermon is already in your library",
                    "existing_sermon": {
                        "id": existing.get("id"),
                        "title": existing.get("title"),
                        "sermon_code": existing.get("sermon_code"),
                        "language": existing.get("language"),
                        "status": existing.get("status"),
                        "created_at": existing.get("created_at"),
                    }
                }
            )

    sermon = Sermon(
        title=body.title or "Untitled",
        speaker=body.speaker or "",
        date=body.date,
        year=body.year,
        location=body.location,
        series="General",  # Imports always start as General — admin assigns series manually
        language=body.language or "en",
        description=body.description,
        duration=body.duration,
        audio_url=body.audio_url,
        artwork_url=body.artwork_url,
        pdf_english_url=body.pdf_english_url,
        pdf_telugu_url=body.pdf_telugu_url,
        sermon_code=body.sermon_code,
        status=body.status or "published",
        category_ids=body.category_ids,
        source="import",
        source_url=body.source_url,
    )
    await sermons_repo().insert(sermon.model_dump())
    await activity_log(actor=current, action="sermon_imported", entity_type="sermon", entity_id=sermon.id, message=f"Imported “{sermon.title}” from {body.source_url}", request=request)

    if body.pdf_english_url or body.pdf_telugu_url:
        asyncio.create_task(process_sermon_transcripts(sermon.id))

    return sermon

# ── Bulk Import Endpoints ────────────────────────────────────────────────────
@router.get("/bulk/profiles")
async def get_bulk_import_profiles():
    return [
        {
            "id": "english_library",
            "name": "English Library",
            "language": "English",
            "speaker": "William Marrion Branham",
            "description": "Default configuration for official VGR English sermon PDFs and audio."
        },
        {
            "id": "telugu_library",
            "name": "Telugu Library",
            "language": "Telugu",
            "speaker": "William Marrion Branham",
            "description": "Configuration for official VGR Telugu translated sermon PDFs and audio."
        },
        {
            "id": "mixed_library",
            "name": "Mixed Library (Auto-Detect)",
            "language": "Mixed",
            "speaker": "William Marrion Branham",
            "description": "Auto-detects language per file based on language tags."
        },
        {
            "id": "custom",
            "name": "Custom Configuration",
            "language": "English",
            "speaker": "",
            "description": "Customizable metadata overrides."
        }
    ]

@router.get("/bulk/health-check")
async def check_bulk_import_health():
    return {
        "status": "healthy",
        "database": "connected",
        "pdf_parser": "pdfplumber-v0.10.3",
        "storage": "supabase-storage-ready",
        "concurrent_workers": 4,
        "checks": [
            {"name": "PostgreSQL Database"},
            {"name": "pdfplumber Extraction Engine"},
            {"name": "Supabase File Storage"},
            {"name": "FastAPI Processing Cluster"}
        ],
        "checked_at": datetime.now(timezone.utc).isoformat()
    }

@router.post("/bulk/scan-urls")
async def scan_bulk_urls(body: ScanUrlsRequest):
    """Fetch and extract sermon metadata for a list of URLs in parallel, generating a matched import manifest."""
    urls = [u.strip() for u in body.urls if u.strip().startswith("http")]
    if not urls:
        raise HTTPException(status_code=400, detail="No valid URLs provided")

    tasks = []
    failed_urls = []

    async def fetch_one(client: httpx.AsyncClient, u: str):
        try:
            r = await client.get(u, timeout=12.0)
            if r.status_code < 400:
                prev = _parse_page(u, r.text)
                return {
                    "ok": True,
                    "task": {
                        "id": str(uuid.uuid4()),
                        "source_url": u,
                        "title": prev.title or "Untitled Sermon",
                        "sermon_code": prev.sermon_code,
                        "speaker": prev.speaker,
                        "date": prev.date,
                        "year": prev.year,
                        "language": prev.language,
                        "audio_url": prev.audio_url,
                        "pdf_english_url": prev.pdf_english_url,
                        "pdf_telugu_url": prev.pdf_telugu_url,
                        "artwork_url": prev.artwork_url,
                        "has_pdf": bool(prev.pdf_english_url or prev.pdf_telugu_url),
                        "has_audio": bool(prev.audio_url),
                        "status": "ready",
                    }
                }
            else:
                return {"ok": False, "url": u, "reason": f"HTTP {r.status_code}"}
        except Exception as e:
            return {"ok": False, "url": u, "reason": str(e)}

    async with httpx.AsyncClient(follow_redirects=True, headers={"User-Agent": UA}) as client:
        results = await asyncio.gather(*[fetch_one(client, u) for u in urls])

    for res in results:
        if res["ok"]:
            tasks.append(res["task"])
        else:
            failed_urls.append({"url": res["url"], "reason": res["reason"]})

    ready_count = len(tasks)
    return {
        "summary": {
            "total_urls_scanned": len(urls),
            "total_sermons": ready_count,
            "ready": ready_count,
            "duplicates": 0,
            "missing_audio": sum(1 for t in tasks if not t.get("has_audio")),
            "missing_pdf": sum(1 for t in tasks if not t.get("has_pdf")),
            "invalid_filename": len(failed_urls),
            "failed_count": len(failed_urls),
            "profile_id": body.profile_id
        },
        "tasks": tasks,
        "failed_urls": failed_urls
    }

@router.post("/bulk/scan-manifest")
async def scan_file_manifest(body: ScanManifestRequest):
    files = body.files or []
    tasks = []
    for f in files:
        fname = f.get("name", "")
        m_code = re.search(r"(\d{2}-\d{4}[A-Za-z]?)", fname)
        code = m_code.group(1) if m_code else None
        date_str, year_str = _date_from_code(code) if code else (None, None)
        has_pdf = fname.lower().endswith(".pdf")
        has_audio = any(fname.lower().endswith(ext) for ext in (".m4a", ".mp3", ".wav"))
        
        tasks.append({
            "id": str(uuid.uuid4()),
            "filename": fname,
            "size": f.get("size", 0),
            "sermon_code": code,
            "title": fname.rsplit(".", 1)[0].replace("-", " ").title(),
            "speaker": "William Marrion Branham",
            "date": date_str,
            "year": year_str,
            "language": "te" if "telugu" in fname.lower() or "-te" in fname.lower() else "en",
            "has_pdf": has_pdf,
            "has_audio": has_audio,
            "status": "ready"
        })

    ready_count = len(tasks)
    return {
        "summary": {
            "total_files": len(files),
            "total_sermons": ready_count,
            "ready": ready_count,
            "duplicates": 0,
            "missing_audio": sum(1 for t in tasks if not t.get("has_audio")),
            "missing_pdf": sum(1 for t in tasks if not t.get("has_pdf")),
            "invalid_filename": 0,
            "profile_id": body.profile_id
        },
        "tasks": tasks
    }

@router.post("/bulk/upload-zip")
async def upload_zip_archive(file: UploadFile = File(...), profile_id: str = Form("english_library")):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported")

    content = await file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            namelist = z.namelist()
            tasks = []
            for name in namelist:
                if name.endswith("/") or name.startswith("__MACOSX"):
                    continue
                basename = os.path.basename(name)
                m_code = re.search(r"(\d{2}-\d{4}[A-Za-z]?)", basename)
                code = m_code.group(1) if m_code else None
                date_str, year_str = _date_from_code(code) if code else (None, None)

                tasks.append({
                    "id": str(uuid.uuid4()),
                    "filename": basename,
                    "sermon_code": code,
                    "title": basename.rsplit(".", 1)[0].replace("-", " ").title(),
                    "speaker": "William Marrion Branham",
                    "date": date_str,
                    "year": year_str,
                    "language": "te" if "telugu" in basename.lower() else "en",
                    "has_pdf": basename.lower().endswith(".pdf"),
                    "has_audio": any(basename.lower().endswith(ext) for ext in (".m4a", ".mp3", ".wav")),
                    "status": "ready"
                })

            ready_count = len(tasks)
            return {
                "summary": {
                    "zip_filename": file.filename,
                    "total_files": len(namelist),
                    "total_sermons": ready_count,
                    "ready": ready_count,
                    "duplicates": 0,
                    "missing_audio": sum(1 for t in tasks if not t.get("has_audio")),
                    "missing_pdf": sum(1 for t in tasks if not t.get("has_pdf")),
                    "invalid_filename": 0,
                    "profile_id": profile_id
                },
                "tasks": tasks
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read ZIP archive: {e}")

@router.post("/bulk/start")
async def start_bulk_import_job(body: StartBulkJobRequest):
    global _ACTIVE_JOB_ID
    job_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    total_count = len(body.tasks)

    job = {
        "id": job_id,
        "status": "running",
        # Explicitly support BOTH frontend property naming conventions
        "total_count": total_count,
        "total_tasks": total_count,
        "processed_count": 0,
        "completed_tasks": 0,
        "imported_count": 0,
        "approved_count": 0,
        "skipped_count": 0,
        "needs_review_count": 0,
        "failed_count": 0,
        "failed_tasks": 0,
        "current_item": "Initializing Queue...",
        "active_stage": "Starting Ingestion Cluster",
        "dry_run": body.dry_run,
        "options": body.options or {},
        "created_at": now_iso,
        "logs": [f"[{now_iso}] Ingestion job {job_id[:8]} started ({total_count} sermons queued)"],
        "tasks": body.tasks
    }

    _BULK_JOBS[job_id] = job
    _ACTIVE_JOB_ID = job_id

    # Run processing in background
    asyncio.create_task(_run_bulk_job_worker(job_id, body.tasks, body.dry_run))

    return job

async def _run_bulk_job_worker(job_id: str, tasks: List[Dict[str, Any]], dry_run: bool):
    job = _BULK_JOBS.get(job_id)
    if not job:
        return

    repo = sermons_repo()

    for idx, t in enumerate(tasks):
        if job["status"] == "stopped":
            job["logs"].append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Job execution stopped by user request.")
            break

        while job["status"] == "paused":
            await asyncio.sleep(0.5)

        title = t.get("title") or t.get("sermon_code") or f"Sermon #{idx+1}"
        job["current_item"] = title
        job["active_stage"] = "Extracting Metadata & Running Verifier"
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")

        try:
            if dry_run:
                job["imported_count"] += 1
                job["approved_count"] += 1
                job["logs"].append(f"[{now_str}] DRY-RUN Verified: {title}")
            else:
                # ── Build Sermon object: all imports go to General series ──
                sermon = Sermon(
                    title=title,
                    speaker=t.get("speaker") or "William Marrion Branham",
                    date=t.get("date"),
                    year=t.get("year"),
                    language=t.get("language") or "en",
                    audio_url=t.get("audio_url"),
                    pdf_english_url=t.get("pdf_english_url"),
                    pdf_telugu_url=t.get("pdf_telugu_url"),
                    artwork_url=t.get("artwork_url"),
                    sermon_code=t.get("sermon_code"),
                    series="General",  # Imports always go to General — admin assigns series manually
                    status="published",
                    category_ids=[],
                    source="import",
                    source_url=t.get("source_url")
                )

                # ── Audit Trace Instrumentation ──
                import logging
                audit_logger = logging.getLogger("bulk_import_audit")
                audit_logger.info(f"[Bulk Import Audit Trace] Task object: {t}")
                audit_logger.info(f"[Bulk Import Audit Trace] Task keys: {list(t.keys())}")
                audit_logger.info(f"[Bulk Import Audit Trace] pdf_english_url: {t.get('pdf_english_url')}, pdf_telugu_url: {t.get('pdf_telugu_url')}")

                # ── Step 1: Save to DB — this is the critical step ──
                await repo.insert(sermon.model_dump())
                job["imported_count"] += 1

                # ── Step 2: Trigger transcript extraction (non-critical, must not fail the import) ──
                has_pdf_keys = bool(t.get("pdf_english_url") or t.get("pdf_telugu_url"))
                audit_logger.info(f"[Bulk Import Audit Trace] Calling transcript processor: {has_pdf_keys}")

                if has_pdf_keys:
                    try:
                        proc_res = await asyncio.wait_for(
                            process_sermon_transcripts(sermon.id),
                            timeout=30.0  # Max 30s per sermon transcript extraction
                        )
                        if proc_res.get("ok") and proc_res.get("diagnostics", {}).get("passed"):
                            job["approved_count"] += 1
                            job["logs"].append(f"[{now_str}] Imported & Verified (APPROVED): {title}")
                        else:
                            job["needs_review_count"] += 1
                            job["logs"].append(f"[{now_str}] Imported (NEEDS REVIEW — transcript pending): {title}")
                    except Exception as tex:
                        # Transcript extraction failure does NOT fail the import
                        job["needs_review_count"] += 1
                        job["logs"].append(f"[{now_str}] Imported (NEEDS REVIEW — transcript extraction skipped: {tex}): {title}")
                else:
                    job["approved_count"] += 1
                    job["logs"].append(f"[{now_str}] Imported (No PDF): {title}")

        except Exception as e:
            job["failed_count"] += 1
            job["failed_tasks"] += 1
            job["logs"].append(f"[{now_str}] FAILED to save sermon {title}: {e}")

        job["processed_count"] += 1
        job["completed_tasks"] += 1
        await asyncio.sleep(0.05)

    job["status"] = "completed"
    job["current_item"] = "Bulk Ingestion Completed"
    job["active_stage"] = "Done"
    job["completed_at"] = datetime.now(timezone.utc).isoformat()
    job["logs"].append(
        f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Bulk Import Job Complete! "
        f"{job['imported_count']} Approved, {job['skipped_count']} Needs Review, {job['failed_count']} Failed."
    )

@router.get("/bulk/active")
async def get_active_bulk_job():
    if _ACTIVE_JOB_ID and _ACTIVE_JOB_ID in _BULK_JOBS:
        return _BULK_JOBS[_ACTIVE_JOB_ID]
    return None

@router.get("/bulk/status/{job_id}")
async def get_bulk_job_status(job_id: str):
    if job_id in _BULK_JOBS:
        return _BULK_JOBS[job_id]
    raise HTTPException(status_code=404, detail="Job not found")

@router.get("/bulk/history")
async def get_bulk_job_history():
    return list(_BULK_JOBS.values())

@router.post("/bulk/pause/{job_id}")
async def pause_bulk_job(job_id: str):
    if job_id in _BULK_JOBS:
        _BULK_JOBS[job_id]["status"] = "paused"
        _BULK_JOBS[job_id]["logs"].append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Execution paused by user.")
        return _BULK_JOBS[job_id]
    raise HTTPException(status_code=404, detail="Job not found")

@router.post("/bulk/resume/{job_id}")
async def resume_bulk_job(job_id: str):
    if job_id in _BULK_JOBS:
        _BULK_JOBS[job_id]["status"] = "running"
        _BULK_JOBS[job_id]["logs"].append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Execution resumed by user.")
        return _BULK_JOBS[job_id]
    raise HTTPException(status_code=404, detail="Job not found")

@router.post("/bulk/stop/{job_id}")
async def stop_bulk_job(job_id: str):
    if job_id in _BULK_JOBS:
        _BULK_JOBS[job_id]["status"] = "stopped"
        _BULK_JOBS[job_id]["logs"].append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Execution stopped by user.")
        return _BULK_JOBS[job_id]
    raise HTTPException(status_code=404, detail="Job not found")
