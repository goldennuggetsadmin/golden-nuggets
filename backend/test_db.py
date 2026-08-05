import asyncio
from repositories.entities import sermons_repo
async def main():
    repo = sermons_repo()
    items = await repo.find({"status": "published"}, limit=5)
    for i in items:
        print(f"ID: {i.get('id')} - Language: {repr(i.get('language'))}")

asyncio.run(main())
