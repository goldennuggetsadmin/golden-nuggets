"""Sermon Service — Shared domain logic for sermon filtering and category matching.
Provides a single source of truth for series and category query filters across mobile and search endpoints.
"""
from typing import Dict, Any, Optional, List

def is_sermon_in_series(sermon: dict, series_or_category: Optional[str]) -> bool:
    """Single source of truth predicate to check if a sermon document belongs to a series or category.
    
    Schema Audit Rules:
    - If series_or_category is 'General' (case-insensitive):
      Sermon belongs to 'General' if its series is explicitly 'General', OR if series is null/empty.
    - For any other series name:
      Sermon belongs if requested series substring matches sermon series (case-insensitive).
    """
    if not series_or_category or not isinstance(series_or_category, str):
        return True

    target = series_or_category.strip().lower()
    if not target:
        return True

    s_series = (sermon.get("series") or "").strip().lower()
    if target == "general":
        return s_series == "general" or s_series == ""
    
    return target in s_series


def filter_sermons_by_series(sermons: List[dict], series_or_category: Optional[str]) -> List[dict]:
    """Filter a list of sermon documents using the single source of truth predicate."""
    if not series_or_category:
        return sermons
    return [s for s in sermons if is_sermon_in_series(s, series_or_category)]
