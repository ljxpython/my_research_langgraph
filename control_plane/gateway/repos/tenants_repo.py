from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Tenant


def get_tenant_by_id(db, *, tenant_id: str) -> Tenant | None:
    stmt = select(Tenant).where(Tenant.id == tenant_id)
    return db.execute(stmt).scalar_one_or_none()
