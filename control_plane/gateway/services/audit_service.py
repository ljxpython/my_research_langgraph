from __future__ import annotations

from gateway.db.models import AuditEvent
from gateway.utils.ids import make_id


def try_write_audit_event(
    db,
    *,
    tenant_id: str,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    request_id: str | None,
    details: dict,
) -> None:
    """Best-effort audit write.

    Audit must not block the business operation in Phase A, but failures should be visible in logs.
    """

    try:
        evt = AuditEvent(
            id=make_id("aud"),
            tenant_id=tenant_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            details_json=details or {},
        )
        db.add(evt)
    except Exception:
        # Swallow; caller decides whether to log.
        return
