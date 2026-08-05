"""
Automatic Stale Sermon Reprocessor Script
Discovers all sermons in PostgreSQL, checks their transcript_parser_version & verification status,
and automatically re-processes any stale or unverified transcripts using the production pipeline.
"""
import asyncio
import logging
from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo
from services.transcript_service import process_sermon_transcripts

logging.basicConfig(level=logging.INFO)
CURRENT_PARSER_VERSION = "geometry-v1.5.0"

async def reprocess_all_stale_sermons(force_all: bool = False):
    await db.connect()
    repo = sermons_repo()
    all_sermons = await repo.find({})
    
    print("=" * 80)
    print(f"STALE SERMON REPROCESSOR (Target Parser Version: {CURRENT_PARSER_VERSION})")
    print(f"Total sermons in database: {len(all_sermons)}")
    print("=" * 80)

    stale_count = 0
    updated_count = 0
    failed_count = 0

    for s in all_sermons:
        sermon_id = s.get("id")
        code = s.get("sermon_code", "unknown")
        title = s.get("title", "")
        p_ver = s.get("transcript_parser_version")
        parsed = s.get("transcript_parsed", False)

        is_stale = force_all or (p_ver != CURRENT_PARSER_VERSION) or (not parsed)
        
        if is_stale:
            stale_count += 1
            print(f"\nProcessing Sermon [{code}] '{title}' (ID: {sermon_id})...")
            print(f"  Old state: transcript_parser_version={p_ver}, parsed={parsed}")

            result = await process_sermon_transcripts(sermon_id)
            diag = result.get("diagnostics", {})
            new_status = diag.get("status")
            new_passed = diag.get("passed", False)

            if new_passed:
                updated_count += 1
                print(f"  ✅ SUCCESS: Status={new_status} | Paras: {result.get('paragraphs_extracted')} | transcript_parsed=True")
            else:
                failed_count += 1
                print(f"  ⚠️ REVIEW NEEDED: Status={new_status} | transcript_parsed=False | Failures: {diag.get('critical_failures')}")
        else:
            print(f"Sermon [{code}] '{title}' is UP TO DATE ({p_ver}, parsed=True). Skipping.")

    print("\n" + "=" * 80)
    print("REPROCESSING SUMMARY")
    print("=" * 80)
    print(f"Total Sermons Examined : {len(all_sermons)}")
    print(f"Stale / Unverified     : {stale_count}")
    print(f"Successfully Updated   : {updated_count}")
    print(f"Needs Review           : {failed_count}")
    
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(reprocess_all_stale_sermons())
