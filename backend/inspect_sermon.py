import asyncio
import sys
import logging
from repositories.postgres import get_pool
from db import connect, disconnect
from repositories.entities import sermons_repo
from services.transcript_service import extract_transcript_from_pdf_bytes

logging.basicConfig(level=logging.INFO)

async def run():
    await connect()
    doc = await sermons_repo().find_one({"sermon_code": "47-0412"})
    if not doc:
        print("Sermon not found")
        await disconnect()
        return
    
    import httpx
    pdf_url = doc.get("pdf_english_url")
    if not pdf_url:
        print("No URL")
        await disconnect()
        return
    
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(pdf_url)
    
    res = extract_transcript_from_pdf_bytes(resp.content)
    paragraphs = res.get("transcripts", [])
    for p in paragraphs[:30]:
        print(f"Page: {p.get('page')}, ParaNum: {p.get('paragraph_number')}")
        print(p.get("text"))
        print("-" * 40)
    await disconnect()

if __name__ == "__main__":
    asyncio.run(run())
