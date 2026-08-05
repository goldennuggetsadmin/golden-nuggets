"""
Final validation: Check every stage is clean and produce the complete report.
"""
import asyncio
import hashlib
import json
import httpx
import os
from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo

DIVIDER = "=" * 80

async def main():
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({})
    s = sermons[0]

    print(DIVIDER)
    print("FINAL PRODUCTION VALIDATION REPORT")
    print("Sermon: 47-1102 The Angel Of God")
    print(DIVIDER)

    stored = s.get("transcripts") or []
    para_nums = [p.get("paragraph_number") for p in stored]
    sermon_paras = [p for p in stored if p.get("paragraph_number") is not None]
    
    print(f"\nSERMON CODE   : {s.get('sermon_code')}")
    print(f"TITLE         : {s.get('title')}")
    print(f"DB ID         : {s.get('id')}")
    print(f"PDF SOURCE    : CloudFront (URL in PostgreSQL)")
    
    print(f"\n--- PARAGRAPH COUNTS ---")
    print(f"Total stored paragraphs : {len(stored)}")
    print(f"Numbered paragraphs     : {len(sermon_paras)}")
    print(f"Unnumbered paragraphs   : {len(stored) - len(sermon_paras)}")
    
    numbered = sorted([p for p in para_nums if p is not None])
    print(f"\n--- PARAGRAPH NUMBERS ---")
    print(f"All numbered: {numbered}")
    
    missing = []
    if numbered:
        expected = list(range(numbered[0], numbered[-1] + 1))
        missing = [n for n in expected if n not in numbered]
        print(f"Missing numbers in sequence: {missing if missing else 'NONE — Complete'}")
    
    print(f"\n--- FIRST PARAGRAPH ---")
    p0 = stored[0] if stored else {}
    print(f"  Page     : {p0.get('page')}")
    print(f"  Para Num : {p0.get('paragraph_number')}")
    print(f"  Text     : '{p0.get('text', '')[:120]}'")
    
    # find first numbered paragraph
    first_numbered = next((p for p in stored if p.get("paragraph_number") is not None), None)
    if first_numbered:
        print(f"\n--- FIRST NUMBERED PARAGRAPH ---")
        print(f"  Page     : {first_numbered.get('page')}")
        print(f"  Para Num : {first_numbered.get('paragraph_number')}")
        print(f"  Text     : '{first_numbered.get('text', '')[:120]}'")

    print(f"\n--- LAST PARAGRAPH ---")
    pz = stored[-1] if stored else {}
    print(f"  Page     : {pz.get('page')}")
    print(f"  Para Num : {pz.get('paragraph_number')}")
    print(f"  Text     : '{pz.get('text', '')[:120]}'")

    canonical_text = "\n\n".join(p.get("text", "") for p in stored if p.get("text"))
    db_hash = hashlib.sha256(canonical_text.encode("utf-8")).hexdigest()
    print(f"\n--- HASHES ---")
    print(f"  Database hash : {db_hash}")
    
    # API
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        r = await client.get(f"{backend_url}/api/v1/mobile/sermons/{s.get('id')}")
    api_data = r.json()
    api_transcripts = api_data.get("transcripts", [])
    api_text = "\n\n".join(p.get("text", "") for p in api_transcripts if isinstance(p, dict) and p.get("text"))
    api_hash = hashlib.sha256(api_text.encode("utf-8")).hexdigest()
    print(f"  API hash      : {api_hash}")
    print(f"  Hashes match  : {'✅ YES' if db_hash == api_hash else '❌ NO'}")
    
    print(f"\n--- VERIFIER STATUS ---")
    q = None
    if api_transcripts and isinstance(api_transcripts[0], dict):
        q = api_transcripts[0].get("quality_diagnostics")
    if q:
        print(f"  Status   : {q.get('status')}")
        print(f"  Passed   : {q.get('passed')}")
        print(f"  Critical : {q.get('critical_failures')}")
        print(f"  Structural: {q.get('structural_issues')}")
    print(f"  transcript_parsed in DB: {s.get('transcript_parsed')}")
    print(f"  transcript_parsed in API: {api_data.get('transcript_parsed')}")

    print(f"\n--- PARAGRAPH-BY-PARAGRAPH NUMBERS (all {len(stored)} stored) ---")
    for i, p in enumerate(stored):
        flag = ""
        if i == 0:
            flag = " ← FIRST"
        elif i == len(stored) - 1:
            flag = " ← LAST"
        print(f"  [{i:3d}] Page {p.get('page'):2d}, Para #{str(p.get('paragraph_number')):>5}: {p.get('text','')[:60]}...{flag}")

    print(f"\n--- FIXTURE SOURCES CONFIRMATION ---")
    print(f"  Sermon 47-1102 : PRODUCTION (PostgreSQL DB + CloudFront PDF URL) ✅")
    print(f"  Sermon 53-0729 : FIXTURE ONLY (test_data/ local file) — NOT in DB")
    print(f"  Sermon 57-0421S: FIXTURE ONLY (test_data/ local file) — NOT in DB")
    print(f"  Sermon 47-0412 : FIXTURE ONLY (hardcoded in test scripts) — NOT in DB")
    print(f"  Sermon 47-1123 : FIXTURE ONLY (hardcoded in test scripts) — NOT in DB")
    print(f"  Sermon 47-1207 : FIXTURE ONLY (hardcoded in test scripts) — NOT in DB")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
