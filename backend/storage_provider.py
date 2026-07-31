"""
Storage abstraction. Backend logic depends ONLY on this interface.
To go to Cloudflare R2 / AWS S3 / Supabase Storage in production:
  1. Create an S3StorageProvider(StorageProvider) using aioboto3 (S3-compatible).
  2. Add a builder branch below that returns it when STORAGE_PROVIDER=r2|s3|supabase.
  3. Env: STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY,
     STORAGE_PUBLIC_URL.
No service or controller needs to change.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO


class StorageProvider(ABC):
    @abstractmethod
    async def save(self, key: str, data: bytes | BinaryIO, content_type: str | None = None) -> str: ...
    @abstractmethod
    async def delete(self, key: str) -> None: ...
    @abstractmethod
    def url_for(self, key: str) -> str: ...
    @abstractmethod
    def local_path(self, key: str) -> Path | None: ...


class LocalStorageProvider(StorageProvider):
    def __init__(self, root: str | Path, public_base: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.public_base = public_base.rstrip("/")

    def _full(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError("invalid key")
        return p

    async def save(self, key: str, data, content_type: str | None = None) -> str:
        p = self._full(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, (bytes, bytearray)):
            p.write_bytes(bytes(data))
        else:
            content = data.read()
            if isinstance(content, str):
                content = content.encode()
            p.write_bytes(content)
        return self.url_for(key)

    async def delete(self, key: str) -> None:
        p = self._full(key)
        if p.exists():
            p.unlink()

    def url_for(self, key: str) -> str:
        return f"{self.public_base}/api/media/{key.lstrip('/')}"

    def local_path(self, key: str) -> Path:
        return self._full(key)


def build_storage() -> StorageProvider:
    provider = os.environ.get("STORAGE_PROVIDER", "local").lower()
    if provider != "local":
        # Placeholder for future providers; require operators to set STORAGE_PROVIDER=local
        # until the S3/R2 provider is added in production.
        raise RuntimeError(
            f"STORAGE_PROVIDER={provider} not implemented in this build. Set STORAGE_PROVIDER=local."
        )
    root = os.environ.get("STORAGE_ROOT", str(Path(__file__).parent / "storage"))
    public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    return LocalStorageProvider(root=root, public_base=public_base)
