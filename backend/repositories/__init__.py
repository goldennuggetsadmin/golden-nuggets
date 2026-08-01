"""Repository layer — PostgreSQL implementation.
"""
from .base import BaseRepository
from .postgres import PostgreSQLRepository

# The rest of the codebase imports concrete repositories from below.
Repository = PostgreSQLRepository  # ← migrated to PostgreSQLRepository

def make_repo(collection: str) -> BaseRepository:
    return Repository(collection)

__all__ = ["BaseRepository", "PostgreSQLRepository", "Repository", "make_repo"]
