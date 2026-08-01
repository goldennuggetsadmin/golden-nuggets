"""Storage provider factory."""
from .base import StorageProvider
from .supabase import SupabaseStorageProvider

_provider: StorageProvider | None = None


def get_storage_provider() -> StorageProvider:
    global _provider
    if _provider is None:
        _provider = SupabaseStorageProvider()
    return _provider


__all__ = ["StorageProvider", "get_storage_provider", "SupabaseStorageProvider"]
