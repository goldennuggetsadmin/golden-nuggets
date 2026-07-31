"""Pluggable Content Provider Architecture for Golden Nuggets Content Control."""
from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional
import re
from services.duplicate_detector import BranhamProviderDetector, GenericProviderDetector, check_duplicate_sermon


class BaseContentProvider(ABC):
    @abstractmethod
    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def detect_duplicate(self, source_url: str, metadata: dict, canonical_hash: Optional[str] = None) -> Optional[dict]:
        pass


class BranhamContentProvider(BaseContentProvider):
    def __init__(self):
        self._detector = BranhamProviderDetector()

    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        return self._detector.extract_identity(source_url, metadata)

    async def detect_duplicate(self, source_url: str, metadata: dict, canonical_hash: Optional[str] = None) -> Optional[dict]:
        return await check_duplicate_sermon(source_url, metadata, canonical_hash)


class GenericContentProvider(BaseContentProvider):
    def __init__(self):
        self._detector = GenericProviderDetector()

    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        return self._detector.extract_identity(source_url, metadata)

    async def detect_duplicate(self, source_url: str, metadata: dict, canonical_hash: Optional[str] = None) -> Optional[dict]:
        return await check_duplicate_sermon(source_url, metadata, canonical_hash)


def get_content_provider(source_url: str) -> BaseContentProvider:
    if source_url and "branham.org" in source_url.lower():
        return BranhamContentProvider()
    return GenericContentProvider()
