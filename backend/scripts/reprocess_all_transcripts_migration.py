"""Idempotent Migration Script: Re-extracts and repairs all sermon transcripts in the database.
Can safely be executed multiple times without duplicating data or altering metadata.
"""
import asyncio
import logging
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import connect
from services.transcript_service import process_sermon_transcripts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def run_migration():
    logger.info("Starting Sermon Transcript Repair Migration...")
    pool = await connect()
    if not pool:
        logger.error("Could not connect to database.")
        sys.exit(1)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, title, sermon_code, pdf_english_storage_path, pdf_english_url, pdf_telugu_storage_path, pdf_telugu_url "
            "FROM sermons ORDER BY created_at ASC;"
        )
        logger.info(f"Found {len(rows)} total sermons in database.")

        success_count = 0
        skipped_count = 0
        failed_count = 0

        for r in rows:
            s_id = str(r["id"])
            code = r["sermon_code"] or "N/A"
            title = r["title"] or "Untitled"

            has_pdf = bool(
                r["pdf_english_storage_path"]
                or r["pdf_english_url"]
                or r["pdf_telugu_storage_path"]
                or r["pdf_telugu_url"]
            )

            if not has_pdf:
                logger.info(f"[-] Skipping sermon '{title}' ({code}) — No PDF source found.")
                skipped_count += 1
                continue

            logger.info(f"[+] Processing sermon '{title}' ({code}) [{s_id}]...")
            try:
                res = await process_sermon_transcripts(s_id)
                if res.get("ok"):
                    logger.info(
                        f"    ✓ Reprocessed successfully. Paragraphs extracted: {res.get('paragraphs_extracted')}"
                    )
                    success_count += 1
                else:
                    logger.warning(f"    ⚠️ Reprocessing returned notice: {res.get('message')}")
                    failed_count += 1
            except Exception as e:
                logger.error(f"    ❌ Error reprocessing sermon {s_id}: {e}")
                failed_count += 1

        logger.info("==================================================")
        logger.info("MIGRATION COMPLETE:")
        logger.info(f"  Total Sermons Processed: {len(rows)}")
        logger.info(f"  Successfully Reprocessed: {success_count}")
        logger.info(f"  Skipped (No PDF Source):  {skipped_count}")
        logger.info(f"  Failures:                {failed_count}")
        logger.info("==================================================")


if __name__ == "__main__":
    asyncio.run(run_migration())
