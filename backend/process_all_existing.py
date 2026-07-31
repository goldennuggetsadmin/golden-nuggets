import asyncio
from db import connect, disconnect, get_pool
from services.transcript_service import process_sermon_transcripts
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, title FROM sermons WHERE (pdf_english_storage_path IS NOT NULL OR pdf_telugu_storage_path IS NOT NULL OR pdf_english_url IS NOT NULL OR pdf_telugu_url IS NOT NULL) AND (transcript_parsed IS NOT TRUE OR transcript_parsed IS NULL);")
        print(f"Found {len(rows)} sermons needing transcript extraction...")
        for r in rows:
            print(f"Processing sermon '{r['title']}' ({r['id']})...")
            res = await process_sermon_transcripts(str(r['id']))
            print("  Result:", res)
            
    await disconnect()

asyncio.run(main())
