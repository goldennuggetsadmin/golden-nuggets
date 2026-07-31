import asyncio
from db import connect, disconnect, get_pool
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, title, series FROM sermons;")
        print(f"Total sermons in DB: {len(rows)}")
        for r in rows:
            print(f"  ID: {r['id']} | Title: {r['title']} | Series: {repr(r['series'])}")
    await disconnect()

asyncio.run(main())
