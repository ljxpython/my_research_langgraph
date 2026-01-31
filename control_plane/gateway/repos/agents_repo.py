from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import Agent


def list_agents_by_tenant(db, *, tenant_id: str) -> list[Agent]:
    stmt = select(Agent).where(Agent.tenant_id == tenant_id).order_by(Agent.display_name.asc())
    return list(db.execute(stmt).scalars().all())


def get_agent(db, *, tenant_id: str, agent_id: str) -> Agent | None:
    stmt = select(Agent).where(Agent.tenant_id == tenant_id, Agent.agent_id == agent_id)
    return db.execute(stmt).scalar_one_or_none()
