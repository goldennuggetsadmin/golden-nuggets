import asyncpg
from config.settings import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool = None

async def connect():
    global _pool
    if _pool is not None:
        return
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    dsn = settings.DATABASE_URL
    if not dsn:
        logger.error("DATABASE_URL environment variable is not set!")
        return
    try:
        _pool = await asyncio.wait_for(
            asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10, ssl=ctx, command_timeout=10),
            timeout=5.0
        )
        logger.info("asyncpg pool created successfully")
    except Exception as e:
        logger.error(f"asyncpg pool creation error/timeout: {e}")

async def disconnect():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")

def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool is not initialized. Please check DATABASE_URL or network connection.")
    return _pool
