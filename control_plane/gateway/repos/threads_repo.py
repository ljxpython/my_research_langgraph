from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Thread


def get_thread(db, *, tenant_id: str, thread_id: str) -> Thread | None:
    stmt = select(Thread).where(Thread.tenant_id == tenant_id, Thread.thread_id == thread_id)
    return db.execute(stmt).scalar_one_or_none()
