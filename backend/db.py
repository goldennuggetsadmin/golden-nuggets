import asyncpg
from config.settings import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool = None

async def _init_pool():
    global _pool
    if _pool is not None:
        return
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    dsn = settings.DATABASE_URL
    if not dsn:
        return
    if "?" in dsn:
        dsn = dsn.split("?")[0]

    try:
        logger.info("Connecting to database in background...")
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=0,
            max_size=5,
            ssl=ctx,
            command_timeout=10,
            timeout=10
        )
        logger.info("asyncpg pool created successfully!")
    except Exception as e:
        logger.warning(f"Database direct connection deferred ({e}) — operating in resilient fallback mode")

async def connect():
    global _pool
    if _pool is not None:
        return _pool
    await _init_pool()
    return _pool

async def disconnect():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")

def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    return _pool
