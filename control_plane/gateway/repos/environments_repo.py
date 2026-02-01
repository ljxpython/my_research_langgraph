from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Environment


def get_environment(db, *, tenant_id: str, project_id: str, environment_id: str) -> Environment | None:
    stmt = select(Environment).where(
        Environment.tenant_id == tenant_id,
        Environment.project_id == project_id,
        Environment.environment_id == environment_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_environments(db, *, tenant_id: str, project_id: str) -> list[Environment]:
    stmt = (
        select(Environment)
        .where(Environment.tenant_id == tenant_id, Environment.project_id == project_id)
        .order_by(Environment.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())
