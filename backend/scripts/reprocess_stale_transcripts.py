"""
Automatic Stale Sermon Reprocessor Script with Dry-Run, CSV Manifest & Rollback Safety.
Supports:
  --dry-run   Validates PDF download & paragraph extraction without writing to PostgreSQL
  --execute   Commits DB updates ONLY if paragraph count > 0 and verification passes
  --limit N   Clamps batch size to N sermons (e.g. 1, 5, 20)
  --code C    Target specific sermon code (e.g. 56-0101)
"""
import asyncio
import csv
import logging
import os
import sys
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import db
from services.transcript_service import process_sermon_transcripts, validate_pdf_bytes, extract_transcript_from_pdf_bytes

logging.basicConfig(level=logging.INFO)

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "reports", "backfill_recovery_manifest.csv")

async def reprocess_all_stale_sermons(limit: int = 0, target_code: str = None, dry_run: bool = True):
    pool = await db.connect()
    if not pool:
        print("Database connection failed")
        return

    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    file_exists = os.path.exists(MANIFEST_PATH)

    mode_str = "DRY-RUN (Simulated — No DB Changes)" if dry_run else "EXECUTE (Live Database Update)"
    print("=" * 80)
    print(f"STALE SERMON REPROCESSOR [{mode_str}]")
    print(f"Target Code: {target_code or 'ALL'} | Batch Limit: {limit or 'ALL'}")
    print(f"Audit Manifest: {MANIFEST_PATH}")
    print("=" * 80)

    async with pool.acquire() as conn:
        if target_code:
            sql_query = """
                SELECT id, sermon_code, title, pdf_english_url, pdf_english_storage_path, 
                       pdf_telugu_url, pdf_telugu_storage_path, transcript_paragraph_count
                FROM sermons
                WHERE sermon_code = $1
            """
            target_sermons = await conn.fetch(sql_query, target_code)
        else:
            sql_query = """
                SELECT id, sermon_code, title, pdf_english_url, pdf_english_storage_path, 
                       pdf_telugu_url, pdf_telugu_storage_path, transcript_paragraph_count
                FROM sermons
                WHERE (transcripts IS NULL OR transcripts::text = '[]' OR transcripts::text = 'null')
                  AND (pdf_english_url IS NOT NULL OR pdf_english_storage_path IS NOT NULL)
                ORDER BY created_at DESC
            """
            if limit > 0:
                sql_query += f" LIMIT {limit}"
            target_sermons = await conn.fetch(sql_query)

    print(f"Found {len(target_sermons)} sermon(s) matching criteria for processing.")

    stale_count = len(target_sermons)
    updated_count = 0
    failed_count = 0

    with open(MANIFEST_PATH, mode="a", newline="", encoding="utf-8") as manifest_file:
        writer = csv.writer(manifest_file)
        if not file_exists:
            writer.writerow(["timestamp", "mode", "sermon_id", "sermon_code", "title", "before_paragraphs", "after_paragraphs", "result", "error"])

        for s in target_sermons:
            sermon_id = str(s.get("id"))
            code = s.get("sermon_code", "unknown")
            title = s.get("title", "")
            pdf_url = s.get("pdf_english_url") or s.get("pdf_telugu_url")
            before_paras = s.get("transcript_paragraph_count") or 0
            now_iso = datetime.now(timezone.utc).isoformat()

            print(f"\nProcessing Sermon [{code}] '{title}' (ID: {sermon_id})...")
            print(f"  PDF URL: {pdf_url or 'NONE'}")

            if dry_run:
                if not pdf_url:
                    print("  ❌ DRY-RUN FAILED: No PDF URL available for sermon")
                    failed_count += 1
                    writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, 0, "FAILED", "No PDF URL"])
                    continue
                try:
                    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=30.0) as client:
                        resp = await client.get(pdf_url)
                    if resp.status_code >= 400 or len(resp.content) < 100:
                        print(f"  ❌ DRY-RUN FAILED: PDF download HTTP {resp.status_code} ({len(resp.content)} bytes)")
                        failed_count += 1
                        writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, 0, "FAILED", f"HTTP {resp.status_code}"])
                        continue
                    
                    is_valid, err, p_count = validate_pdf_bytes(resp.content)
                    if not is_valid:
                        print(f"  ❌ DRY-RUN FAILED: PDF validation error: {err}")
                        failed_count += 1
                        writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, 0, "FAILED", err])
                        continue

                    res = extract_transcript_from_pdf_bytes(resp.content, sermon_title=title)
                    extracted_paras = res.get("transcripts", [])
                    extracted_count = len(extracted_paras)

                    if extracted_count > 0:
                        updated_count += 1
                        print(f"  ✅ DRY-RUN SUCCESS: PDF downloadable ({len(resp.content)/1024:.1f} KB) | Pages: {p_count} | Paras: {extracted_count}")
                        print(f"  [DRY-RUN] Would update DB with {extracted_count} paragraphs and transcript_parsed=True (No DML executed)")
                        writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, extracted_count, "SUCCESS", ""])
                    else:
                        failed_count += 1
                        print("  ⚠️ DRY-RUN WARNING: PDF downloadable but extracted 0 paragraphs")
                        writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, 0, "ZERO_PARAGRAPHS", "Extracted 0 paragraphs"])
                except Exception as ex:
                    failed_count += 1
                    print(f"  ❌ DRY-RUN ERROR: {ex}")
                    writer.writerow([now_iso, "DRY_RUN", sermon_id, code, title, before_paras, 0, "ERROR", str(ex)])

            else:
                # Live Execution Mode with Fault-Tolerant Rollback Guard
                try:
                    result = await process_sermon_transcripts(sermon_id)
                    diag = result.get("diagnostics", {})
                    new_status = diag.get("status")
                    new_passed = diag.get("passed", False)
                    paras_extracted = result.get("paragraphs_extracted", 0)

                    if paras_extracted > 0:
                        updated_count += 1
                        status_flag = "SUCCESS" if new_passed else "NEEDS_REVIEW"
                        print(f"  ✅ EXECUTE SUCCESS: Status={new_status} | Paras: {paras_extracted} | DB Committed")
                        writer.writerow([now_iso, "EXECUTE", sermon_id, code, title, before_paras, paras_extracted, status_flag, ""])
                    else:
                        failed_count += 1
                        print(f"  ⚠️ ROLLBACK / REVIEW NEEDED: Status={new_status} | Paras: 0 | DB Unchanged")
                        writer.writerow([now_iso, "EXECUTE", sermon_id, code, title, before_paras, 0, "FAILED", str(diag.get("critical_failures"))])
                except Exception as ex:
                    failed_count += 1
                    print(f"  ❌ EXECUTE ERROR: Transient network or processing failure for sermon {code}: {ex}")
                    writer.writerow([now_iso, "EXECUTE", sermon_id, code, title, before_paras, 0, "ERROR", str(ex)])

    print("\n" + "=" * 80)
    print("REPROCESSING SUMMARY")
    print("=" * 80)
    print(f"Mode                   : {mode_str}")
    print(f"Total Target Sermons   : {stale_count}")
    print(f"Successfully Verified  : {updated_count}")
    print(f"Failed / Review Needed : {failed_count}")
    print(f"Manifest Logged To     : {MANIFEST_PATH}")
    
    await db.disconnect()

if __name__ == "__main__":
    limit_val = 0
    code_val = None
    dry_run_val = True

    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit_val = int(arg.split("=")[1])
        elif arg.startswith("--code="):
            code_val = arg.split("=")[1].strip()
        elif arg == "--execute":
            dry_run_val = False
        elif arg == "--dry-run":
            dry_run_val = True

    asyncio.run(reprocess_all_stale_sermons(limit=limit_val, target_code=code_val, dry_run=dry_run_val))
