import asyncio
import httpx
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool, get_pool

CODES = ['47-0412', '47-1100X', '50-0820A', '55-0220A', '63-0324M']

async def run():
    await _init_pool()
    pool = get_pool()
    async with pool.acquire() as conn:
        for code in CODES:
            row = await conn.fetchrow(
                "SELECT id, sermon_code, title, transcript_parsed, transcript FROM sermons WHERE sermon_code = $1",
                code
            )
            if not row:
                print(f"=== {code}: NOT IN DB ===")
                continue

            s_id = str(row["id"])
            async with httpx.AsyncClient() as client:
                res = await client.get(f"http://localhost:8000/api/v1/mobile/sermons/{s_id}")
                api_data = res.json()

            t_api = api_data.get("transcripts")
            print(f"=== {code} ({row['title']}) ===")
            print(f"  DB transcript_parsed:       {row['transcript_parsed']}")
            print(f"  API transcript_parsed:      {api_data.get('transcript_parsed')}")
            print(f"  API transcripts count:      {len(t_api) if isinstance(t_api, list) else 0}")
            if isinstance(t_api, list) and len(t_api) > 0:
                print(f"  API first paragraph sample: {repr(t_api[0].get('text', '')[:80])}")
            print()

if __name__ == "__main__":
    asyncio.run(run())
