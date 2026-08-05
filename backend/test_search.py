import asyncio
from repositories.entities import sermons_repo

async def main():
    repo = sermons_repo()
    q = "47"
    filt = {"status": "published"}
    filt["$or"] = [
        {"title": {"$regex": q, "$options": "i"}},
        {"sermon_code": {"$regex": q, "$options": "i"}},
        {"speaker": {"$regex": q, "$options": "i"}},
        {"series": {"$regex": q, "$options": "i"}},
    ]
    filt["language"] = {"$in": ["en", "English", "english", "EN"]}
    
    items = await repo.find(filt)
    print(f"Total found: {len(items)}")

asyncio.run(main())
