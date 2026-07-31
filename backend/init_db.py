import asyncio
import os
from pathlib import Path
import asyncpg
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

async def init_schema():
    db_url = os.environ.get("DATABASE_URL")
    print(f"Connecting to database: {db_url.split('@')[-1]}")
    conn = await asyncpg.connect(db_url)
    try:
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        for t in tables:
            tname = t['table_name']
            print(f"Dropping existing table: {tname}")
            await conn.execute(f'DROP TABLE IF EXISTS "{tname}" CASCADE;')
        
        schema_path = ROOT_DIR / "schema.sql"
        with open(schema_path, "r") as f:
            sql = f.read()
        await conn.execute(sql)
        print("Schema executed successfully!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(init_schema())
