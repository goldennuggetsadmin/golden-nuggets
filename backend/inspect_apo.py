import asyncio
from db import connect, disconnect, get_pool
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, title, series, language, pdf_english_storage_path, pdf_telugu_storage_path, pdf_english_url, pdf_telugu_url, transcript_parsed, transcript_paragraph_count, length(transcript), transcripts FROM sermons WHERE title = 'apo' OR title ILIKE '%apo%';")
        print("Found matching sermons count:", len(rows))
        for r in rows:
            d = dict(r)
            print("\n--- SERMON RECORD ---")
            print("ID:", d['id'])
            print("Title:", d['title'])
            print("Series:", repr(d['series']))
            print("Language:", d['language'])
            print("PDF Eng Path:", d['pdf_english_storage_path'])
            print("PDF Tel Path:", d['pdf_telugu_storage_path'])
            print("PDF Eng URL:", d['pdf_english_url'])
            print("PDF Tel URL:", d['pdf_telugu_url'])
            print("Transcript Parsed:", d['transcript_parsed'])
            print("Paragraph Count:", d['transcript_paragraph_count'])
            print("Transcript Length:", d['length'])
            print("Transcripts JSONB type/len:", type(d['transcripts']), len(d['transcripts']) if d['transcripts'] else 0)
            if d['transcripts']:
                print("First paragraph:", d['transcripts'][0] if isinstance(d['transcripts'], list) else str(d['transcripts'])[:100])
    await disconnect()

asyncio.run(main())
