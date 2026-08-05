"""
Migrate activity_log table columns in PostgreSQL
"""
import asyncio
from dotenv import load_dotenv
load_dotenv()
import db

async def main():
    pool = await db.connect()
    async with pool.acquire() as conn:
        print("Migrating activity_log table schema...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                action VARCHAR(100),
                entity_type VARCHAR(100),
                entity_id VARCHAR(255),
                actor VARCHAR(255),
                status VARCHAR(50),
                message TEXT,
                metadata JSONB,
                request_path VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            ALTER TABLE activity_log 
            ADD COLUMN IF NOT EXISTS entity_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100),
            ADD COLUMN IF NOT EXISTS action VARCHAR(100),
            ADD COLUMN IF NOT EXISTS status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS request_path VARCHAR(255),
            ADD COLUMN IF NOT EXISTS actor VARCHAR(255),
            ADD COLUMN IF NOT EXISTS message TEXT,
            ADD COLUMN IF NOT EXISTS metadata JSONB;
        """)
        print("activity_log migration completed successfully!")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
