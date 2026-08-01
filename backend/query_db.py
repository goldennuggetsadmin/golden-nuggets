import asyncio
import os
import db
from repositories.entities import sermons_repo
from dotenv import load_dotenv

async def main():
    load_dotenv()
    await db.connect()
    repo = sermons_repo()
    doc = await repo.find_one({"sermon_code": "65-0117"})
    if doc:
        print("Sermon found:", doc.get("title"))
        transcripts = doc.get("transcripts", [])
        if transcripts:
            for t in transcripts[:5]:
                print(f"paragraph_number: {t.get('paragraph_number')}, text: {t.get('text')}")
    else:
        print("Sermon not found.")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
