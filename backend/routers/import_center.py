"""Admin: Hybrid Import — Branham.org metadata scraper (metadata only)."""
from __future__ import annotations
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Request
import httpx

from auth import require_admin
from models import ImportPreview, ImportUrlRequest, Sermon
from repositories.entities import sermons_repo
from services import log as activity_log

router = APIRouter(prefix="/api/v1/admin/import", tags=["admin:import"])

UA = "Mozilla/5.0 (compatible; GoldenNuggetsAdmin/1.0)"


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

    # Determine default language and Telugu page indicators
    is_telugu_page = "TEL=" in url.upper() or "/TEL/" in url.upper() or "(TEL)" in text.upper() or "తెలుగు" in text

    # 1. Search for audio elements <source src="..."> and <audio src="...">
    for elem in soup.find_all(["source", "audio"]):
        src = elem.get("src")
        if src:
            low_src = src.lower()
            if any(ext in low_src for ext in (".m4a", ".mp3", ".wav", ".aac", "/audio/")):
                audio_url = urljoin(url, src)
                break

    # 2. Search all links <a> for audio and PDF links
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
        title=title,
        sermon_code=sermon_code,
        speaker=speaker,
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


from fastapi.responses import JSONResponse
from services.duplicate_detector import check_duplicate_sermon

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
        series=None,
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

    # Background: download PDFs and extract transcripts into JSONB
    if body.pdf_english_url or body.pdf_telugu_url:
        import asyncio
        from services.transcript_service import process_sermon_transcripts
        asyncio.create_task(process_sermon_transcripts(sermon.id))

    return sermon
