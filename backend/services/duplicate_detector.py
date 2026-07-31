"""Provider-Aware Duplicate Detection Interface for Golden Nuggets Content Control."""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Tuple
import re
from repositories.entities import sermons_repo


class ProviderDuplicateDetector(ABC):
    @abstractmethod
    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        """Returns provider identity payload."""
        pass


class BranhamProviderDetector(ProviderDuplicateDetector):
    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        sermon_code = metadata.get("sermon_code")
        language = metadata.get("language") or "en"

        if not sermon_code and source_url:
            m = re.search(r"([A-Z]{3}=)?(\d{2}-\d{4}[A-Z]?)", source_url)
            if m:
                sermon_code = m.group(2)

        return {
            "provider": "branham.org",
            "sermon_code": sermon_code,
            "language": language,
            "source_url": source_url,
        }


class GenericProviderDetector(ProviderDuplicateDetector):
    def extract_identity(self, source_url: str, metadata: dict) -> Dict[str, Any]:
        return {
            "provider": "generic",
            "sermon_code": metadata.get("sermon_code"),
            "language": metadata.get("language") or "en",
            "source_url": source_url,
        }


def get_detector(source_url: str) -> ProviderDuplicateDetector:
    if source_url and "branham.org" in source_url.lower():
        return BranhamProviderDetector()
    return GenericProviderDetector()


async def check_duplicate_sermon(source_url: str, metadata: dict, canonical_text_hash: Optional[str] = None) -> Optional[dict]:
    """Layered Duplicate Detection:
    Priority 1: source_url match
    Priority 2: (source, sermon_code, language) match
    Priority 3: canonical_text_hash match
    """
    detector = get_detector(source_url)
    identity = detector.extract_identity(source_url, metadata)

    # Priority 1: source_url match
    if source_url:
        existing = await sermons_repo().find_one({"source_url": source_url})
        if existing:
            return existing

    # Priority 2: (sermon_code, language) match
    code = identity.get("sermon_code")
    lang = identity.get("language")
    if code and lang:
        all_matches = await sermons_repo().find({"sermon_code": code, "language": lang})
        if all_matches:
            return all_matches[0]

    # Priority 3: canonical_text_hash match
    if canonical_text_hash:
        existing_hash = await sermons_repo().find_one({"canonical_text_hash": canonical_text_hash})
        if existing_hash:
            return existing_hash

    return None
