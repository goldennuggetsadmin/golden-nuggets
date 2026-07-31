import asyncio
from db import connect, disconnect
from repositories.postgres import get_pool

async def run():
    await connect()
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_start_page integer;")
        await conn.execute("ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_start_paragraph integer;")
        await conn.execute("ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_end_page integer;")
        await conn.execute("ALTER TABLE sermons ADD COLUMN IF NOT EXISTS manual_canonical_end_paragraph integer;")
        print("Database schema updated successfully!")
    await disconnect()

if __name__ == "__main__":
    asyncio.run(run())
