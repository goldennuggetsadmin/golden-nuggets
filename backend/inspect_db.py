import asyncio
import os
from pathlib import Path
import asyncpg
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

async def inspect():
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    for t in tables:
        tname = t['table_name']
        cols = await conn.fetch(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{tname}'")
        print(f"Table {tname}: {[c['column_name'] for c in cols]}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect())
