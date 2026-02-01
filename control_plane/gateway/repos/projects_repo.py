from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import aliased

from gateway.db.models import Project, ProjectMember


def list_projects(db, *, tenant_id: str) -> list[Project]:
    stmt = select(Project).where(Project.tenant_id == tenant_id).order_by(Project.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def list_projects_for_user(db, *, tenant_id: str, user_id: str) -> list[Project]:
    pm = aliased(ProjectMember)
    stmt = (
        select(Project)
        .join(pm, pm.project_id == Project.project_id)
        .where(Project.tenant_id == tenant_id, pm.tenant_id == tenant_id, pm.user_id == user_id)
        .order_by(Project.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_project(db, *, tenant_id: str, project_id: str) -> Project | None:
    stmt = select(Project).where(Project.tenant_id == tenant_id, Project.project_id == project_id)
    return db.execute(stmt).scalar_one_or_none()
