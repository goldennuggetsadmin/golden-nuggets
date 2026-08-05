"""
PRODUCTION PIPELINE FULL AUDIT SCRIPT
Audits 47-1102 The Angel Of God through every stage.
NO assumptions. All output is evidence-based.
"""
import asyncio
import hashlib
import json
import httpx
import os
import sys

from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo
from services.transcript_service import extract_transcript_from_pdf_bytes, InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

DIVIDER = "=" * 80

def section(title):
    print(f"\n{DIVIDER}")
    print(f"STAGE: {title}")
    print(DIVIDER)


# ── STAGE 0: Identify what's in the database ──────────────────────────────────
async def stage0_database_records():
    section("0 — DATABASE CONTENTS (What is actually stored)")
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({})
    print(f"Total sermons in PostgreSQL: {len(sermons)}")
    print()

    for s in sermons:
        print(f"  Sermon Code : {s.get('sermon_code')}")
        print(f"  Title       : {s.get('title')}")
        print(f"  DB ID       : {s.get('id')}")
        print(f"  Language    : {s.get('language')}")
        print(f"  PDF Eng URL : {s.get('pdf_english_url')}")
        print(f"  PDF Tel URL : {s.get('pdf_telugu_url')}")
        print(f"  Eng Storage : {s.get('pdf_english_storage_path')}")
        print(f"  Tel Storage : {s.get('pdf_telugu_storage_path')}")
        print(f"  transcript_parsed : {s.get('transcript_parsed')}")
        print(f"  paragraph_count   : {s.get('transcript_paragraph_count')}")
        print()
        # print first 5 stored paragraphs
        stored_transcripts = s.get('transcripts') or []
        print(f"  Stored paragraphs in JSONB: {len(stored_transcripts)}")
        if stored_transcripts:
            para_nums = [p.get('paragraph_number') for p in stored_transcripts]
            print(f"  Paragraph numbers: {para_nums[:20]}...")
            print(f"  First stored paragraph:")
            p0 = stored_transcripts[0]
            print(f"    Page: {p0.get('page')}, Num: {p0.get('paragraph_number')}, Text: '{p0.get('text','')[:100]}...'")
            print(f"  Last stored paragraph:")
            pz = stored_transcripts[-1]
            print(f"    Page: {pz.get('page')}, Num: {pz.get('paragraph_number')}, Text: '{pz.get('text','')[:100]}...'")
            full_stored_text = "\n\n".join(p.get('text','') for p in stored_transcripts if p.get('text'))
            db_hash = hashlib.sha256(full_stored_text.encode('utf-8')).hexdigest()
            print(f"  Database canonical hash : {db_hash}")

    return sermons


# ── STAGE 1 & 2: PDF Fetch + pdfplumber extraction ───────────────────────────
async def stage12_extract(pdf_url, title):
    section(f"1 & 2 — PDF FETCH + pdfplumber EXTRACTION for: {title}")
    print(f"  Fetching PDF from: {pdf_url}")

    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0) as client:
        try:
            resp = await client.get(pdf_url)
            if resp.status_code >= 400:
                print(f"  HTTP ERROR: {resp.status_code}")
                return None, None, None
            pdf_bytes = resp.content
            print(f"  PDF fetched OK. Size: {len(pdf_bytes)} bytes")
        except Exception as e:
            print(f"  FETCH ERROR: {e}")
            return None, None, None

    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    print(f"  PDF SHA-256: {pdf_hash}")

    dom_builder = InMemoryDOMBuilder(pdf_bytes)
    raw_paragraphs, total_pages, stats = dom_builder.build_dom_paragraphs()
    print(f"  Total pages: {total_pages}")
    print(f"  Raw paragraphs extracted (pre-boundary): {len(raw_paragraphs)}")
    print(f"  Word count: {stats.get('word_count')}")

    print(f"\n  First 5 raw paragraphs:")
    for i, p in enumerate(raw_paragraphs[:5]):
        print(f"    [{i}] Page {p.get('page')}, Para #{p.get('paragraph_number')}: '{p.get('text','')[:80]}...'")

    print(f"\n  Last 5 raw paragraphs:")
    for i, p in enumerate(raw_paragraphs[-5:]):
        idx = len(raw_paragraphs) - 5 + i
        print(f"    [{idx}] Page {p.get('page')}, Para #{p.get('paragraph_number')}: '{p.get('text','')[:80]}...'")

    return pdf_bytes, raw_paragraphs, stats


# ── STAGE 3: Boundary Detector ────────────────────────────────────────────────
def stage3_boundary(raw_paragraphs):
    section("3 — BOUNDARY DETECTOR")
    detector = BranhamBoundaryDetector()

    print("  State transitions during boundary classification:")
    state = "FRONT_MATTER"
    total_paras = len(raw_paragraphs)
    seen_numbered_body = False
    for idx, p in enumerate(raw_paragraphs):
        text = p.get("text", "").lower()
        p_num = p.get("paragraph_number")
        if p_num is not None and p_num >= 1:
            seen_numbered_body = True
        has_front = any(k in text for k in detector.VGR_FRONT_KEYWORDS)
        has_back = any(k in text for k in detector.VGR_BACK_KEYWORDS)

        old_state = state
        matched = []

        if state == "FRONT_MATTER":
            if has_front:
                matched = [k for k in detector.VGR_FRONT_KEYWORDS if k in text]
            else:
                state = "BODY"
        elif state == "BODY":
            is_latter_half = idx > total_paras * 0.50
            is_explicit_catalog = any(k in text for k in ["audio tapes", "publications", "catalog", "appreciation", "permission"])
            if has_back and (is_latter_half or is_explicit_catalog) and seen_numbered_body:
                matched = [k for k in detector.VGR_BACK_KEYWORDS if k in text]
                state = "BACK_MATTER"
            elif has_front and not seen_numbered_body:
                matched = [k for k in detector.VGR_FRONT_KEYWORDS if k in text]

        if old_state != state or matched:
            print(f"    Para [{idx}] Page {p.get('page')} | Num={p.get('paragraph_number')} | {old_state} → {state} | Matched: {matched}")
            print(f"      Snippet: '{p.get('text','')[:70]}...'")

    boundary_meta = detector.detect_boundaries(raw_paragraphs)
    start_idx = boundary_meta.get("start_index", 0)
    end_idx = boundary_meta.get("end_index", len(raw_paragraphs) - 1)

    print(f"\n  Boundary result:")
    print(f"    start_index : {start_idx}")
    print(f"    end_index   : {end_idx}")
    print(f"    confidence  : {boundary_meta.get('confidence')}")
    print(f"    reason      : {boundary_meta.get('reason')}")

    sliced = raw_paragraphs[start_idx : end_idx + 1] if raw_paragraphs else []
    print(f"\n  SLICED paragraph count : {len(sliced)} (out of {len(raw_paragraphs)} raw)")

    if sliced:
        print(f"\n  FIRST sliced paragraph:")
        p = sliced[0]
        print(f"    Page {p.get('page')}, Para #{p.get('paragraph_number')}, start_page={p.get('start_page')}, end_page={p.get('end_page')}")
        print(f"    Text: '{p.get('text','')[:120]}...'")

        print(f"\n  LAST sliced paragraph:")
        p = sliced[-1]
        print(f"    Page {p.get('page')}, Para #{p.get('paragraph_number')}, start_page={p.get('start_page')}, end_page={p.get('end_page')}")
        print(f"    Text: '{p.get('text','')[:120]}...'")

        para_nums = [p.get('paragraph_number') for p in sliced]
        print(f"\n  All paragraph numbers: {para_nums}")

    return sliced


# ── STAGE 4: Verifier ─────────────────────────────────────────────────────────
def stage4_verifier(pdf_bytes, sliced_paragraphs, stats):
    section("4 — VERIFIER")
    diagnostics = verify_transcript(pdf_bytes, sliced_paragraphs, pdf_stats=stats)
    print(f"  Status  : {diagnostics.get('status')}")
    print(f"  Passed  : {diagnostics.get('passed')}")
    print(f"  Critical Failures   : {diagnostics.get('critical_failures')}")
    print(f"  Structural Issues   : {diagnostics.get('structural_issues')}")
    print(f"  Cosmetic Warnings   : {diagnostics.get('cosmetic_warnings')}")
    return diagnostics


# ── STAGE 5: Database comparison ─────────────────────────────────────────────
async def stage5_database_compare(sliced_paragraphs, db_record):
    section("5 — DATABASE COMPARISON")
    stored = db_record.get("transcripts") or []
    print(f"  Extracted (post-boundary) : {len(sliced_paragraphs)} paragraphs")
    print(f"  Stored in DB JSONB        : {len(stored)} paragraphs")

    if sliced_paragraphs:
        ext_text = "\n\n".join(p.get("text", "") for p in sliced_paragraphs if p.get("text"))
        ext_hash = hashlib.sha256(ext_text.encode("utf-8")).hexdigest()
        print(f"  Extraction hash : {ext_hash}")
    else:
        ext_hash = None

    if stored:
        db_text = "\n\n".join(p.get("text", "") for p in stored if p.get("text"))
        db_hash = hashlib.sha256(db_text.encode("utf-8")).hexdigest()
        print(f"  Database hash   : {db_hash}")
    else:
        db_hash = None

    if ext_hash and db_hash:
        if ext_hash == db_hash:
            print("  ✅ Extraction matches database (hashes identical)")
        else:
            print("  ❌ MISMATCH: Extraction hash ≠ Database hash")
            print("     This means the pipeline was modified AFTER the sermon was stored.")
            print("     The database still contains the OLD extracted paragraphs.")
            print("     Run re-extraction to update the database.")

    return ext_hash, db_hash


# ── STAGE 6: FastAPI output comparison ───────────────────────────────────────
async def stage6_fastapi(sermon_id):
    section("6 — FastAPI RESPONSE")
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    print(f"  Querying: {backend_url}/api/v1/mobile/sermons/{sermon_id}")
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            r = await client.get(f"{backend_url}/api/v1/mobile/sermons/{sermon_id}")
        if r.status_code == 200:
            data = r.json()
            api_transcripts = data.get("transcripts", [])
            print(f"  API returned transcripts type : {type(api_transcripts)}")
            if isinstance(api_transcripts, list):
                total_api_paras = sum(len(t.get("paragraphs", [])) if isinstance(t, dict) else 0 for t in api_transcripts)
                print(f"  API total transcript groups   : {len(api_transcripts)}")
                print(f"  API total paragraphs          : {total_api_paras}")
                for t in api_transcripts[:2]:
                    if isinstance(t, dict):
                        paras = t.get("paragraphs", [])
                        print(f"  Group language={t.get('language')}, paragraphs={len(paras)}")
                        if paras:
                            print(f"  First API para: '{str(paras[0])[:100]}...'")
            else:
                print(f"  API transcripts raw snippet: {str(api_transcripts)[:200]}")
        else:
            print(f"  HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"  FastAPI call failed: {e} (Is the backend running?)")


# ── MAIN ──────────────────────────────────────────────────────────────────────
async def main():
    print(DIVIDER)
    print("GOLDEN NUGGETS — PRODUCTION PIPELINE FULL AUDIT")
    print("Evidence-Based. No Assumptions. Production Data Only.")
    print(DIVIDER)

    # Stage 0: What's in DB?
    sermons = await stage0_database_records()

    if not sermons:
        print("\n❌ No sermons found in database. Nothing to audit.")
        await db.disconnect()
        return

    # For each production sermon, audit the full pipeline
    repo = sermons_repo()
    for s in sermons:
        sermon_code = s.get("sermon_code", "unknown")
        title = s.get("title", "")
        db_id = s.get("id", "")
        pdf_url = s.get("pdf_english_url") or s.get("pdf_telugu_url")

        print(f"\n\n{'#' * 80}")
        print(f"PRODUCTION SERMON: {sermon_code} — {title}")
        print(f"DB ID: {db_id}")
        print(f"PDF URL: {pdf_url}")
        print(f"{'#' * 80}")

        if not pdf_url:
            print("❌ No PDF URL found in database. Skipping.")
            continue

        pdf_bytes, raw_paragraphs, stats = await stage12_extract(pdf_url, title)
        if pdf_bytes is None:
            continue

        sliced = stage3_boundary(raw_paragraphs)
        stage4_verifier(pdf_bytes, sliced, stats)
        await stage5_database_compare(sliced, s)
        await stage6_fastapi(db_id)

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
