import asyncpg
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool = None

async def connect():
    global _pool
    if _pool is None:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        _pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, min_size=1, max_size=10, ssl=ctx)
        logger.info("asyncpg pool created")

async def disconnect():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")

def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool is not initialized. Call connect() first.")
    return _pool
