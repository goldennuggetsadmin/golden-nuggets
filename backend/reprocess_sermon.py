"""
Re-process sermon 47-1102 through the production pipeline.
This updates the database with the newly corrected extraction.
"""
import asyncio
from dotenv import load_dotenv
load_dotenv()

import db
from services.transcript_service import process_sermon_transcripts

SERMON_ID = "ea50f836-7642-48b8-aa31-bad51fc0e705"

async def main():
    await db.connect()
    print(f"Re-processing sermon {SERMON_ID}...")
    result = await process_sermon_transcripts(SERMON_ID)
    print(f"\nResult:")
    print(f"  ok                  : {result.get('ok')}")
    print(f"  paragraphs_extracted: {result.get('paragraphs_extracted')}")
    print(f"  page_count          : {result.get('page_count')}")
    diagnostics = result.get('diagnostics', {})
    print(f"  verifier status     : {diagnostics.get('status')}")
    print(f"  verifier passed     : {diagnostics.get('passed')}")
    print(f"  critical_failures   : {diagnostics.get('critical_failures')}")
    print(f"  structural_issues   : {diagnostics.get('structural_issues')}")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
