"""
End-to-End Canonical Hash Consistency Verification Test
Ensures zero-loss, zero-corruption data fidelity across:
PDF Stream -> Parser -> PostgreSQL DB -> FastAPI Response -> Adapter Payload
"""
import asyncio
import hashlib
import httpx
import os
from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo
from services.transcript_service import extract_transcript_from_pdf_bytes

def compute_canonical_hash(paragraphs):
    full_text = "\n\n".join(p.get("text", "").strip() for p in paragraphs if p.get("text"))
    return hashlib.sha256(full_text.encode("utf-8")).hexdigest()

async def main():
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({"status": "published"})

    print("=" * 80)
    print("END-TO-END CANONICAL HASH INTEGRITY TEST")
    print("=" * 80)

    all_passed = True
    for s in sermons:
        sermon_id = s.get("id")
        code = s.get("sermon_code", "unknown")
        title = s.get("title", "")
        pdf_url = s.get("pdf_english_url") or s.get("pdf_telugu_url")

        print(f"\nEvaluating Sermon [{code}] '{title}' (ID: {sermon_id})...")

        if not pdf_url:
            print("  ⚠️ Skipping: No PDF URL in database")
            continue

        # 1. Fetch PDF Bytes & Extract Parser Hash
        async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0) as client:
            resp = await client.get(pdf_url)
            pdf_bytes = resp.content

        res = extract_transcript_from_pdf_bytes(pdf_bytes, sermon_title=title)
        parser_paras = res.get("transcripts", [])
        parser_hash = compute_canonical_hash(parser_paras)
        print(f"  [1] Parser Hash   : {parser_hash}")

        # 2. Database Stored JSONB Hash
        db_paras = s.get("transcripts", [])
        db_hash = compute_canonical_hash(db_paras)
        print(f"  [2] Database Hash : {db_hash}")

        # 3. FastAPI Endpoint Output Hash
        backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            api_resp = await client.get(f"{backend_url}/api/v1/mobile/sermons/{sermon_id}")
        api_data = api_resp.json()
        api_paras = api_data.get("transcripts", [])
        api_hash = compute_canonical_hash(api_paras)
        print(f"  [3] FastAPI Hash  : {api_hash}")

        # 4. Compare Hash Alignment
        hashes_match = (db_hash == api_hash) and (db_hash == parser_hash)
        if hashes_match:
            print("  ✅ PASSED: Parser == DB == API (Hashes identical)")
        else:
            print("  ❌ MISMATCH DETECTED!")
            if db_hash != parser_hash:
                print("     - DB Hash != Parser Hash (DB record is stale)")
            if db_hash != api_hash:
                print("     - DB Hash != API Hash (API projection error)")
            all_passed = False

    print("\n" + "=" * 80)
    print(f"OVERALL END-TO-END INTEGRITY: {'✅ ALL PASSED' if all_passed else '❌ ISSUES FOUND'}")
    print("=" * 80)
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
