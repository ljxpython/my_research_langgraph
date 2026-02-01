from __future__ import annotations

from sqlalchemy.sql import func
from sqlalchemy import update

from gateway.db.engine import SessionLocal
from gateway.db.models import Run, Thread


def set_execution_run_id(*, tenant_id: str, thread_id: str, run_id: str, execution_run_id: str) -> None:
    db = SessionLocal()
    try:
        db.execute(
            update(Run)
            .where(Run.tenant_id == tenant_id, Run.thread_id == thread_id, Run.run_id == run_id)
            .values(execution_run_id=execution_run_id)
        )
        db.commit()
    finally:
        db.close()


def mark_run_finished(*, tenant_id: str, thread_id: str, run_id: str, status: str) -> None:
    db = SessionLocal()
    try:
        db.execute(
            update(Run)
            .where(Run.tenant_id == tenant_id, Run.thread_id == thread_id, Run.run_id == run_id)
            .values(status=status)
        )
        # Clear busy slot if it's still pointing at this run.
        db.execute(
            update(Thread)
            .where(Thread.tenant_id == tenant_id, Thread.thread_id == thread_id, Thread.active_run_id == run_id)
            .values(active_run_id=None, last_activity_at=func.now())
        )
        db.commit()
    finally:
        db.close()
