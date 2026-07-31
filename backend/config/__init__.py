from dotenv import load_dotenv
from pathlib import Path

# Load .env before anything reads os.environ
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .settings import settings  # noqa: E402

__all__ = ["settings"]
