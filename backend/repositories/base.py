"""Repository interface — all persistence goes through this contract."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseRepository(ABC):
    """Abstract async repository. Filters and patches are simple dicts, keeping
    the interface easy to re-implement over Postgres (Supabase) later.
    """

    def __init__(self, collection: str) -> None:
        self.collection = collection

    @abstractmethod
    async def insert(self, doc: dict) -> dict:
        """Insert a single document, returning the stored representation."""

    @abstractmethod
    async def find_one(self, filt: dict) -> Optional[dict]:
        ...

    @abstractmethod
    async def find(
        self,
        filt: Optional[dict] = None,
        sort: Optional[list[tuple[str, int]]] = None,
        skip: int = 0,
        limit: int = 0,
        projection: Optional[dict] = None,
    ) -> list[dict]:
        ...

    @abstractmethod
    async def count(self, filt: Optional[dict] = None) -> int:
        ...

    @abstractmethod
    async def update_one(self, filt: dict, patch: dict) -> int:
        ...

    @abstractmethod
    async def update_many(self, filt: dict, patch: dict) -> int:
        ...

    @abstractmethod
    async def delete_one(self, filt: dict) -> int:
        ...

    @abstractmethod
    async def delete_many(self, filt: dict) -> int:
        ...

