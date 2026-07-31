"""
Environment-driven configuration.
Nothing operational is hardcoded — every value can be overridden via .env.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / ".env")


class Settings(BaseModel):
    app_env: str = Field(default_factory=lambda: os.environ.get("APP_ENV", "development"))
    log_level: str = Field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO"))

    mongo_url: str = Field(default_factory=lambda: os.environ["MONGO_URL"])
    db_name: str = Field(default_factory=lambda: os.environ["DB_NAME"])

    storage_provider: str = Field(default_factory=lambda: os.environ.get("STORAGE_PROVIDER", "local"))
    storage_root: str = Field(
        default_factory=lambda: os.environ.get("STORAGE_ROOT", str(Path(__file__).parent / "storage"))
    )
    public_base_url: str = Field(default_factory=lambda: os.environ.get("PUBLIC_BASE_URL", "").rstrip("/"))

    max_upload_bytes: int = Field(default_factory=lambda: int(os.environ.get("MAX_UPLOAD_BYTES", 500 * 1024 * 1024)))
    allowed_image_mimes: List[str] = Field(
        default_factory=lambda: os.environ.get("ALLOWED_IMAGE_MIMES", "image/jpeg,image/png,image/webp").split(",")
    )
    allowed_audio_mimes: List[str] = Field(
        default_factory=lambda: os.environ.get(
            "ALLOWED_AUDIO_MIMES", "audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg"
        ).split(",")
    )
    allowed_pdf_mimes: List[str] = Field(
        default_factory=lambda: os.environ.get(
            "ALLOWED_PDF_MIMES", "application/pdf,application/octet-stream"
        ).split(",")
    )

    allowed_origins: List[str] = Field(
        default_factory=lambda: [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
    )

    sample_audio_url: str = Field(
        default_factory=lambda: os.environ.get(
            "SAMPLE_AUDIO_URL", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        )
    )
    request_timeout_seconds: int = Field(default_factory=lambda: int(os.environ.get("HTTP_TIMEOUT_SECONDS", 30)))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
