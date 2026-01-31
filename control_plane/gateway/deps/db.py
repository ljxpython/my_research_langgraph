from __future__ import annotations

from typing import Iterator

from gateway.db.engine import SessionLocal


def get_db() -> Iterator:
    """Request-scoped DB session.

    We commit on successful request completion so write endpoints work without
    having to use the session_scope() context manager everywhere.
    """

    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
