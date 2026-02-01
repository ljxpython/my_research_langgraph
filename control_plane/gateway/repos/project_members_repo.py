from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import ProjectMember


def get_project_member(db, *, tenant_id: str, project_id: str, user_id: str) -> ProjectMember | None:
    stmt = select(ProjectMember).where(
        ProjectMember.tenant_id == tenant_id,
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_project_members(db, *, tenant_id: str, project_id: str) -> list[ProjectMember]:
    stmt = select(ProjectMember).where(
        ProjectMember.tenant_id == tenant_id,
        ProjectMember.project_id == project_id,
    )
    return list(db.execute(stmt).scalars().all())
