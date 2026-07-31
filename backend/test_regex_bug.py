import asyncio
from db import connect, disconnect, get_pool
from repositories.postgres import _parse_filter
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    pool = get_pool()
    filt = {"status": "published", "is_archived": {"$ne": True}, "series": {"$regex": "^book of hebrew$", "$options": "i"}}
    where, params, _ = _parse_filter(filt)
    print("WHERE clause generated:", where)
    print("PARAMS:", params)
    
    query = f"SELECT id, title, series FROM sermons WHERE {where}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        print(f"\nQuery returned {len(rows)} rows:")
        for r in rows:
            print("  - Title:", r['title'], "| Series:", repr(r['series']))
            
    await disconnect()

asyncio.run(main())
