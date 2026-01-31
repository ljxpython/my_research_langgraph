"""SQLAlchemy engine/session (sync).

Phase-1 uses sync SQLAlchemy for simplicity.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from contextlib import contextmanager
from typing import Iterator

from gateway.settings import settings


engine = create_engine(settings.control_plane_database_uri, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@contextmanager
def session_scope() -> Iterator:
    """Provide a transactional scope around a series of operations."""

    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
