"""Supabase Storage provider implementation."""
from typing import Tuple, Optional, Dict
import os
from supabase import create_client, Client
from config.settings import settings

from .base import StorageProvider


class SupabaseStorageProvider(StorageProvider):
    name = "supabase"

    def __init__(self, bucket: str = "sermons") -> None:
        self.bucket = settings.SUPABASE_STORAGE_BUCKET or bucket
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_ROLE_KEY
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.")
        self.client: Client = create_client(url, key)

    def upload(self, path: str, data: bytes, content_type: str) -> Dict[str, any]:
        self.client.storage.from_(self.bucket).upload(
            path,
            data,
            file_options={"content-type": content_type, "x-upsert": "true"}
        )
        return {
            "path": path,
            "size": len(data),
            "content_type": content_type,
            "provider": self.name,
        }

    def delete(self, path: str) -> None:
        self.client.storage.from_(self.bucket).remove([path])

    def exists(self, path: str) -> bool:
        # Simplest way in Supabase without downloading is listing the folder
        folder = os.path.dirname(path)
        filename = os.path.basename(path)
        files = self.client.storage.from_(self.bucket).list(folder)
        for f in files:
            if f.get("name") == filename:
                return True
        return False

    def get_public_url(self, path: str) -> Optional[str]:
        return self.client.storage.from_(self.bucket).get_public_url(path)

    def create_signed_url(self, path: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a time-limited signed URL. Used by mobile API on every request."""
        try:
            result = self.client.storage.from_(self.bucket).create_signed_url(path, expires_in)
            if isinstance(result, dict):
                return result.get("signedURL") or result.get("signed_url")
            return None
        except Exception:
            # Fallback to public URL if signing fails
            return self.get_public_url(path)

    def stream(self, path: str) -> Tuple[bytes, str]:
        data = self.client.storage.from_(self.bucket).download(path)
        # Determine basic content type or default
        content_type = "application/octet-stream"
        if path.endswith(".mp3"): content_type = "audio/mpeg"
        elif path.endswith(".pdf"): content_type = "application/pdf"
        elif path.endswith(".png"): content_type = "image/png"
        elif path.endswith(".jpg") or path.endswith(".jpeg"): content_type = "image/jpeg"
        return data, content_type

    def metadata(self, path: str) -> Dict[str, any]:
        # Currently no direct HEAD metadata method in simple supabase-py storage api
        # Provide minimal mock implementation based on list
        folder = os.path.dirname(path)
        filename = os.path.basename(path)
        files = self.client.storage.from_(self.bucket).list(folder)
        for f in files:
            if f.get("name") == filename:
                return f
        return {}
