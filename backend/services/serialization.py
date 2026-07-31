"""JSON-safe document helpers — belt-and-suspenders against ObjectId leaks."""
from typing import Iterable


def clean(doc: dict | None) -> dict | None:
    """Return a shallow copy of `doc` with any '_id' key removed."""
    if doc is None:
        return None
    if "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


def clean_list(docs: Iterable[dict]) -> list[dict]:
    """Return a list with each doc's '_id' key removed."""
    return [clean(d) for d in docs]
