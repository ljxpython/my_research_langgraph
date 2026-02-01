from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.deps.projects import require_project_role
from gateway.db.models import AuditEvent
from gateway.schemas.audit import AuditEventResponse
from gateway.utils.time import dt_to_ms


router = APIRouter(prefix="/v1", tags=["audit"])


def _audit_to_response(e: AuditEvent) -> AuditEventResponse:
    return AuditEventResponse(
        id=e.id,
        tenant_id=e.tenant_id,
        actor_id=e.actor_id,
        action=e.action,
        resource_type=e.resource_type,
        resource_id=e.resource_id,
        request_id=e.request_id,
        created_at=dt_to_ms(getattr(e, "created_at", None)) or 0,
        details_json=e.details_json or {},
    )


@router.get("/audit", response_model=list[AuditEventResponse])
def list_audit(
    limit: int = 100,
    project_id: str | None = None,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    if limit <= 0:
        limit = 100
    if limit > 500:
        limit = 500

    stmt = select(AuditEvent).where(AuditEvent.tenant_id == user.tenant_id)
    if project_id:
        # Require visibility on the project.
        require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
        # We store projectId in details_json for platform operations.
        stmt = stmt.where(AuditEvent.details_json["projectId"].astext == project_id)
    else:
        if not user.is_admin:
            # Non-admin: default to own actions (avoid leaking tenant-wide audit).
            stmt = stmt.where(AuditEvent.actor_id == user.user_id)

    stmt = stmt.order_by(AuditEvent.created_at.desc()).limit(limit)
    events = list(db.execute(stmt).scalars().all())
    return [_audit_to_response(e) for e in events]


@router.get("/projects/{project_id}/audit-events")
def list_project_audit_events(
    project_id: str,
    limit: int = 100,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    """Compat endpoint for the frontend platform module.

    Returns a list of events with {audit_event_id, actor, resource, outcome} shape.
    """

    require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
    if limit <= 0:
        limit = 100
    if limit > 500:
        limit = 500

    stmt = (
        select(AuditEvent)
        .where(AuditEvent.tenant_id == user.tenant_id, AuditEvent.details_json["projectId"].astext == project_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    events = list(db.execute(stmt).scalars().all())

    # Keep fields minimal but stable for UI.
    out = []
    for e in events:
        out.append(
            {
                "audit_event_id": e.id,
                "created_at": dt_to_ms(getattr(e, "created_at", None)) or 0,
                "tenant_id": e.tenant_id,
                "project_id": project_id,
                "actor": {"actor_type": "user", "actor_id": e.actor_id},
                "action": e.action,
                "resource": {"resource_type": e.resource_type, "resource_id": e.resource_id},
                "request_id": e.request_id,
                "outcome": "success",
                "details_json": e.details_json or {},
            }
        )
    return out
