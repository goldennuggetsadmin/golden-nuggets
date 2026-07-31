import os
from typing import List

class Settings:
    @property
    def APP_NAME(self) -> str:
        return os.environ.get("APP_NAME", "golden-nuggets")

    @property
    def JWT_SECRET(self) -> str:
        return os.environ["JWT_SECRET"]

    @property
    def DATABASE_URL(self) -> str:
        return os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return os.environ.get("CORS_ORIGINS", "*").split(",")

    @property
    def SUPABASE_URL(self) -> str:
        return os.environ.get("SUPABASE_URL", "")

    @property
    def SUPABASE_SERVICE_ROLE_KEY(self) -> str:
        return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def SUPABASE_STORAGE_BUCKET(self) -> str:
        return os.environ.get("SUPABASE_STORAGE_BUCKET", "sermons")

    @property
    def MEDIA_URL_TTL(self) -> int:
        """Signed URL time-to-live in seconds. Configurable via MEDIA_URL_TTL env var."""
        return int(os.environ.get("MEDIA_URL_TTL", "3600"))

settings = Settings()
