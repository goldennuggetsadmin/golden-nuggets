import asyncpg
from config.settings import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool = None

async def connect():
    global _pool
    if _pool is not None:
        return _pool
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    dsn = settings.DATABASE_URL
    if not dsn:
        logger.error("DATABASE_URL environment variable is not set!")
        return None
    
    if "?" in dsn:
        dsn = dsn.split("?")[0]

    for attempt in range(3):
        try:
            logger.info(f"Connecting to database (attempt {attempt + 1})...")
            _pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=1,
                max_size=10,
                ssl=ctx,
                command_timeout=15,
                timeout=10
            )
            logger.info("asyncpg pool created successfully!")
            return _pool
        except Exception as e:
            logger.error(f"asyncpg pool creation attempt {attempt + 1} failed: {e}")
            await asyncio.sleep(1)
    return None

async def disconnect():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")

def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool is initializing or connection failed. Please check DATABASE_URL.")
    return _pool
