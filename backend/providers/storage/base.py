"""Storage provider interface."""
from abc import ABC, abstractmethod
from typing import Tuple, Optional, Dict

class StorageProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def upload(self, path: str, data: bytes, content_type: str) -> Dict[str, any]:
        """Upload a payload and return metadata."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Remove the object at `path`."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if an object exists."""

    @abstractmethod
    def get_public_url(self, path: str) -> Optional[str]:
        """Return a public URL if the provider supports direct public access."""

    @abstractmethod
    def create_signed_url(self, path: str, expires_in: int = 3600) -> Optional[str]:
        """Return a time-limited signed URL for the given storage path."""

    @abstractmethod
    def stream(self, path: str) -> Tuple[bytes, str]:
        """Stream the bytes and return (data, content_type)."""

    @abstractmethod
    def metadata(self, path: str) -> Dict[str, any]:
        """Return metadata about the object."""

    def build_upload_path(self, kind: str, filename: str, app_name: str) -> str:
        """Utility — subclasses may override to change layout."""
        import uuid
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        return f"{app_name}/{kind}/{uuid.uuid4().hex}.{ext}"
