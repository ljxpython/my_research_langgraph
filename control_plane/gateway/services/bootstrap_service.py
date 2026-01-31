"""Bootstrap seed data for Phase-1.

We keep the platform usable without building an admin UI first.
"""

from __future__ import annotations

import os

from sqlalchemy import select

from gateway.db.models import Agent, Tenant, User
from gateway.utils.ids import make_id
from gateway.utils.passwords import hash_password


def ensure_seed_data(db) -> None:
    """Create a default tenant and admin user if missing.

Dev defaults: username=test, password=test.
"""

    tenant_name = os.getenv("BOOTSTRAP_TENANT_NAME", "default")
    admin_username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "test")
    admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "test")

    tenant = db.execute(select(Tenant).where(Tenant.name == tenant_name)).scalar_one_or_none()
    if tenant is None:
        tenant = Tenant(id=make_id("t"), name=tenant_name, status="active")
        db.add(tenant)
        db.flush()

    user = (
        db.execute(
            select(User).where(User.tenant_id == tenant.id, User.username == admin_username)
        ).scalar_one_or_none()
    )
    if user is None:
        user = User(
            id=make_id("u"),
            tenant_id=tenant.id,
            username=admin_username,
            password_hash=hash_password(admin_password),
            is_admin=True,
            status="active",
        )
        db.add(user)

    # Seed a minimal agent registry entry so the UI can boot.
    agent_id = os.getenv("BOOTSTRAP_AGENT_ID", "sql_agent")
    agent = db.execute(select(Agent).where(Agent.agent_id == agent_id)).scalar_one_or_none()
    if agent is None:
        agent = Agent(
            agent_id=agent_id,
            tenant_id=tenant.id,
            display_name=os.getenv("BOOTSTRAP_AGENT_DISPLAY_NAME", "SQL Agent"),
            description=os.getenv("BOOTSTRAP_AGENT_DESCRIPTION", ""),
            status=os.getenv("BOOTSTRAP_AGENT_STATUS", "active"),
            execution_target_id=os.getenv("BOOTSTRAP_AGENT_EXECUTION_TARGET_ID", "local-dev"),
            graph_id=os.getenv("BOOTSTRAP_AGENT_GRAPH_ID", "sql_agent"),
            assistant_id=os.getenv("BOOTSTRAP_AGENT_ASSISTANT_ID", None),
            config_json={},
        )
        db.add(agent)
