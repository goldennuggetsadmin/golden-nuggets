"""
Deep-inspect what is stored in DB and what the API returns.
"""
import asyncio
import json
import httpx
import os
from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo

async def main():
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({})
    s = sermons[0]

    print("=" * 80)
    print("DATABASE STORED TRANSCRIPT RAW JSONB SAMPLE")
    print("=" * 80)
    stored = s.get("transcripts") or []
    print(f"Total stored entries: {len(stored)}")
    print(f"\nFirst 5 stored entries (RAW):")
    for i, p in enumerate(stored[:5]):
        print(f"  [{i}] {json.dumps(p, ensure_ascii=False, indent=4)}")

    print(f"\nLast 5 stored entries (RAW):")
    for i, p in enumerate(stored[-5:]):
        idx = len(stored) - 5 + i
        print(f"  [{idx}] {json.dumps(p, ensure_ascii=False, indent=4)}")

    print(f"\nAll para numbers in DB:")
    para_nums = [p.get('paragraph_number') for p in stored]
    print(f"  {para_nums}")

    print("\n" + "=" * 80)
    print("RAW API RESPONSE SAMPLE")
    print("=" * 80)
    sermon_id = s.get("id")
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        r = await client.get(f"{backend_url}/api/v1/mobile/sermons/{sermon_id}")
    print(f"HTTP Status: {r.status_code}")
    api_data = r.json()
    
    # Print the structure
    print("Top-level keys:", list(api_data.keys()))
    transcripts_field = api_data.get("transcripts", [])
    print(f"transcripts field type: {type(transcripts_field)}")
    print(f"transcripts count: {len(transcripts_field)}")
    
    print(f"\nFirst 3 API transcript entries (RAW):")
    for i, t in enumerate(transcripts_field[:3]):
        print(f"  [{i}] {json.dumps(t, ensure_ascii=False, indent=4)}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
