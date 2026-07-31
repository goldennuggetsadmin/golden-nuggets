import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_pool, connect

async def main():
    await connect()
    pool = get_pool()
    
    async with pool.acquire() as conn:
        print("Migrating English to en...")
        res_en = await conn.execute("UPDATE sermons SET language = 'en' WHERE language ILIKE 'english'")
        print(f"Updated {res_en}")
        
        print("Migrating Telugu to te...")
        res_te = await conn.execute("UPDATE sermons SET language = 'te' WHERE language ILIKE 'telugu'")
        print(f"Updated {res_te}")
        
        print("Migrating Hindi to hi...")
        res_hi = await conn.execute("UPDATE sermons SET language = 'hi' WHERE language ILIKE 'hindi'")
        print(f"Updated {res_hi}")
        
        print("Migrating Tamil to ta...")
        res_ta = await conn.execute("UPDATE sermons SET language = 'ta' WHERE language ILIKE 'tamil'")
        print(f"Updated {res_ta}")
        
    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(main())
