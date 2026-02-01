from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import AuditEvent


def list_audit_events(
    db,
    *,
    tenant_id: str,
    limit: int,
) -> list[AuditEvent]:
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == tenant_id).order_by(AuditEvent.created_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())
