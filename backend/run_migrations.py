import asyncio
import asyncpg
from dotenv import load_dotenv
load_dotenv()

from config.settings import settings

async def apply_migrations():
    conn = await asyncpg.connect(settings.DATABASE_URL)
    print("Executing migrations...")
    
    with open("migrations/2024_01_move_urls.sql", "r") as f:
        sql1 = f.read()
    
    with open("migrations/2024_02_add_transcripts.sql", "r") as f:
        sql2 = f.read()
        
    try:
        await conn.execute(sql1)
        print("✓ Applied 2024_01_move_urls.sql")
    except Exception as e:
        print("Note on 2024_01_move_urls.sql:", e)
        
    try:
        await conn.execute(sql2)
        print("✓ Applied 2024_02_add_transcripts.sql")
    except Exception as e:
        print("Error on 2024_02_add_transcripts.sql:", e)
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(apply_migrations())
