from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import PlatformRun


def get_platform_run(db, *, tenant_id: str, run_id: str) -> PlatformRun | None:
    stmt = select(PlatformRun).where(PlatformRun.tenant_id == tenant_id, PlatformRun.run_id == run_id)
    return db.execute(stmt).scalar_one_or_none()


def get_platform_run_by_client_id(db, *, tenant_id: str, project_id: str, client_run_id: str) -> PlatformRun | None:
    stmt = select(PlatformRun).where(
        PlatformRun.tenant_id == tenant_id,
        PlatformRun.project_id == project_id,
        PlatformRun.client_run_id == client_run_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_platform_runs(db, *, tenant_id: str, project_id: str) -> list[PlatformRun]:
    stmt = (
        select(PlatformRun)
        .where(PlatformRun.tenant_id == tenant_id, PlatformRun.project_id == project_id)
        .order_by(PlatformRun.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())
