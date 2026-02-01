from __future__ import annotations

import datetime


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def dt_to_ms(dt: datetime.datetime | None) -> int | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Treat naive as UTC.
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return int(dt.timestamp() * 1000)
