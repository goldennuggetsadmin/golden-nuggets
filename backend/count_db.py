import asyncio
import db
from repositories.entities import sermons_repo
from dotenv import load_dotenv

async def main():
    load_dotenv()
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({})
    print(f"Total sermons: {len(sermons)}")
    has_transcript = 0
    for doc in sermons:
        if doc.get("transcripts"):
            has_transcript += 1
    print(f"Sermons with transcripts: {has_transcript}")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
