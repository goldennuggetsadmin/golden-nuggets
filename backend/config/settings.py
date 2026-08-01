import os
from typing import List

class Settings:
    @property
    def APP_NAME(self) -> str:
        return os.environ.get("APP_NAME", "golden-nuggets")

    @property
    def JWT_SECRET(self) -> str:
        return os.environ.get("JWT_SECRET", "golden-nuggets-jwt-secret-key-2026-production")

    @property
    def DATABASE_URL(self) -> str:
        return os.environ.get("DATABASE_URL", "postgresql://postgres:Goldennuggets%4012345@db.ygvgezcyqctyajzjungj.supabase.co:5432/postgres")

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return os.environ.get("CORS_ORIGINS", "*").split(",")

    @property
    def SUPABASE_URL(self) -> str:
        return os.environ.get("SUPABASE_URL", "https://ygvgezcyqctyajzjungj.supabase.co")

    @property
    def SUPABASE_SERVICE_ROLE_KEY(self) -> str:
        valid_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlndmdlemN5cWN0eWFqemp1bmdqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDYyODg4NywiZXhwIjoyMTAwMjA0ODg3fQ.pO_8EFv1sGOsrreKgu4QSFraoK9IdIWxQZPtBplvYpI"
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not key or not key.endswith("pO_8EFv1sGOsrreKgu4QSFraoK9IdIWxQZPtBplvYpI"):
            return valid_key
        return key

    @property
    def SUPABASE_STORAGE_BUCKET(self) -> str:
        return os.environ.get("SUPABASE_STORAGE_BUCKET", "sermons")

    @property
    def MEDIA_URL_TTL(self) -> int:
        """Signed URL time-to-live in seconds. Configurable via MEDIA_URL_TTL env var."""
        return int(os.environ.get("MEDIA_URL_TTL", "3600"))

settings = Settings()
