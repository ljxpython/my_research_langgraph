from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Artifact


def get_artifact(db, *, tenant_id: str, artifact_id: str) -> Artifact | None:
    stmt = select(Artifact).where(Artifact.tenant_id == tenant_id, Artifact.artifact_id == artifact_id)
    return db.execute(stmt).scalar_one_or_none()


def list_artifacts_for_run(db, *, tenant_id: str, run_id: str) -> list[Artifact]:
    stmt = select(Artifact).where(Artifact.tenant_id == tenant_id, Artifact.run_id == run_id).order_by(Artifact.created_at.asc())
    return list(db.execute(stmt).scalars().all())
