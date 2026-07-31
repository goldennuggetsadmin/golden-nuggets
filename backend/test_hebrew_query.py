import asyncio
from db import connect, disconnect
from routers.mobile import list_sermons
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    res = await list_sermons(category="book of hebrew")
    print("Total sermons returned for category='book of hebrew':", res['total'])
    for item in res['items']:
        print("  - Title:", item['title'], "| Series:", repr(item['series']))
    await disconnect()

asyncio.run(main())
