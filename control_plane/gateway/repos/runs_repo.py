from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Run


def get_run(db, *, tenant_id: str, thread_id: str, run_id: str) -> Run | None:
    stmt = select(Run).where(Run.tenant_id == tenant_id, Run.thread_id == thread_id, Run.run_id == run_id)
    return db.execute(stmt).scalar_one_or_none()
