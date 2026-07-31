"""Import Idempotency Cache & Active Sermon Lock Manager."""
import time
import asyncio
from typing import Dict, Any, Optional

_IDEMPOTENCY_CACHE: Dict[str, Dict[str, Any]] = {}
_ACTIVE_IMPORT_LOCKS: Dict[str, float] = {}

LOCK_TIMEOUT_SECONDS = 60.0


def acquire_import_lock(sermon_key: str) -> bool:
    """Acquires lock for sermon_key (e.g. 'branham:59-0329S:te'). Returns True if lock acquired, False if locked."""
    now = time.time()
    # Clean expired locks
    for key, lock_time in list(_ACTIVE_IMPORT_LOCKS.items()):
        if now - lock_time > LOCK_TIMEOUT_SECONDS:
            _ACTIVE_IMPORT_LOCKS.pop(key, None)

    if sermon_key in _ACTIVE_IMPORT_LOCKS:
        return False

    _ACTIVE_IMPORT_LOCKS[sermon_key] = now
    return True


def release_import_lock(sermon_key: str):
    """Releases import lock for sermon_key."""
    _ACTIVE_IMPORT_LOCKS.pop(sermon_key, None)


def get_idempotent_response(idempotency_key: str) -> Optional[Dict[str, Any]]:
    """Returns cached response for idempotency key if available."""
    if not idempotency_key:
        return None
    cached = _IDEMPOTENCY_CACHE.get(idempotency_key)
    if cached and (time.time() - cached["time"] < 3600):  # 1 hour TTL
        return cached["result"]
    return None


def store_idempotent_response(idempotency_key: str, result: Dict[str, Any]):
    """Stores response in idempotency cache."""
    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = {
            "time": time.time(),
            "result": result
        }
