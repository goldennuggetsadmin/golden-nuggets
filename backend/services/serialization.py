"""JSON-safe document helpers — belt-and-suspenders against ObjectId leaks."""
from typing import Iterable


def clean(doc: dict | None) -> dict | None:
    """Return a shallow copy of `doc` with '_id' removed and datetime objects formatted to ISO strings."""
    if doc is None:
        return None
    d = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d


def clean_list(docs: Iterable[dict]) -> list[dict]:
    """Return a list with each doc's '_id' key removed."""
    return [clean(d) for d in docs]
