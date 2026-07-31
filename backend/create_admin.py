import asyncio
import os
from pathlib import Path
import asyncpg
import bcrypt
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

async def create_admin():
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        email = "admin@goldennuggets.com"
        pwd = "Admin@123"
        hashed = hash_password(pwd)
        await conn.execute("""
            INSERT INTO users (email, password_hash, name, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE SET password_hash = $2
        """, email, hashed, "Golden Nuggets Admin", "admin")
        print(f"Admin created successfully: {email} / {pwd}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
