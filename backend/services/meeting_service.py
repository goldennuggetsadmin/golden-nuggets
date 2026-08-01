from datetime import datetime, timezone
from typing import Optional
import dateutil.parser


def get_meeting_end_datetime(meeting: dict) -> datetime:
    """Calculate exact UTC expiration datetime for a meeting document.
    
    1. Uses end_date if present, otherwise start_date.
    2. Combines with time if specified (e.g. '10:00' or '10:00 AM').
    3. If no time is specified, defaults to 23:59:59.999999 on the end date.
    4. Ensures comparison is timezone-aware in UTC.
    """
    raw_date = meeting.get("end_date") or meeting.get("start_date")
    if not raw_date:
        return datetime.min.replace(tzinfo=timezone.utc)

    # Parse date string or datetime
    if isinstance(raw_date, str):
        try:
            parsed_date = dateutil.parser.parse(raw_date).date()
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)
    elif hasattr(raw_date, "date"):
        parsed_date = raw_date.date()
    else:
        parsed_date = raw_date

    # Handle time if specified
    raw_time = (meeting.get("time") or "").strip()
    if raw_time:
        try:
            t = dateutil.parser.parse(raw_time).time()
            dt = datetime.combine(parsed_date, t)
        except Exception:
            dt = datetime.combine(parsed_date, datetime.max.time())
    else:
        # Default to end of day (23:59:59.999999) if no time specified
        dt = datetime.combine(parsed_date, datetime.max.time())

    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def is_meeting_expired(meeting: dict, now: Optional[datetime] = None) -> bool:
    """Return True if the meeting's end date/time is earlier than the current UTC time."""
    current = now or datetime.now(timezone.utc)
    end_dt = get_meeting_end_datetime(meeting)
    return current > end_dt
