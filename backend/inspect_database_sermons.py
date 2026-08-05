import asyncio
import os
import db
from repositories.entities import sermons_repo
from dotenv import load_dotenv

async def main():
    load_dotenv()
    await db.connect()
    repo = sermons_repo()
    all_sermons = await repo.find({})
    print(f"TOTAL SERMONS IN DATABASE: {len(all_sermons)}")
    print("=" * 80)
    for s in all_sermons:
        print(f"ID: {s.get('id')}")
        print(f"Title: {s.get('title')}")
        print(f"Sermon Code: {s.get('sermon_code')}")
        print(f"Language: {s.get('language')}")
        print(f"PDF Eng URL: {s.get('pdf_english_url')}")
        print(f"PDF Tel URL: {s.get('pdf_telugu_url')}")
        print(f"PDF Eng Path: {s.get('pdf_english_storage_path')}")
        print(f"PDF Tel Path: {s.get('pdf_telugu_storage_path')}")
        print(f"Transcript Parsed: {s.get('transcript_parsed')}")
        print(f"Paragraph Count: {s.get('transcript_paragraph_count')}")
        print("-" * 80)
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
