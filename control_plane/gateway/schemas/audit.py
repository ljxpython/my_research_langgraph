from __future__ import annotations

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: str
    tenant_id: str
    actor_id: str
    action: str
    resource_type: str
    resource_id: str
    request_id: str | None
    created_at: int
    details_json: dict
