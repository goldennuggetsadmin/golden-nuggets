"""
Test db.connect with increased pool timeout
"""
import asyncio, time
from dotenv import load_dotenv
load_dotenv()

import db

async def main():
    t0 = time.time()
    print("Connecting to DB...")
    pool = await db.connect()
    t1 = time.time()
    print("Connected in:", round((t1-t0)*1000, 1), "ms")
    if pool:
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT COUNT(*) FROM sermons")
            print("Sermons count in DB:", val)
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
