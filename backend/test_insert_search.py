import asyncio
import uuid
import sys

sys.path.append("/Users/selvi.none/Desktop/ministries/ministries-1-main/backend")

from repositories.entities import sermons_repo

async def main():
    repo = sermons_repo()
    test_id = str(uuid.uuid4())
    doc = {
        "id": test_id,
        "title": "My Uploaded Sermon",
        "sermon_code": "99-9999",
        "status": "published",
        "language": "English",
        "speaker": "Brother Test",
        "series": "Test Series"
    }
    await repo.insert(doc)
    print("Inserted doc")
    
    q = "99"
    filt = {"status": "published"}
    filt["$or"] = [
        {"title": {"$regex": q, "$options": "i"}},
        {"sermon_code": {"$regex": q, "$options": "i"}},
        {"speaker": {"$regex": q, "$options": "i"}},
        {"series": {"$regex": q, "$options": "i"}},
    ]
    filt["language"] = {"$in": ["en", "English", "english", "EN"]}
    
    items = await repo.find(filt)
    print(f"Total found from repo: {len(items)}")
    
    # Clean up
    await repo.delete_one({"id": test_id})

asyncio.run(main())
