from __future__ import annotations

from gateway.repos.agents_repo import list_agents_by_tenant


def list_agents(db, *, tenant_id: str):
    return list_agents_by_tenant(db, tenant_id=tenant_id)
