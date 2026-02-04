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

    # Create a stable system actor for background jobs (audit sweeps/purge summaries).
    system_user_id = os.getenv("BOOTSTRAP_SYSTEM_USER_ID", "u_system")
    system_username = os.getenv("BOOTSTRAP_SYSTEM_USERNAME", "system")
    system_user = db.execute(
        select(User).where(User.tenant_id == tenant.id, User.id == system_user_id)
    ).scalar_one_or_none()
    if system_user is None:
        system_user = User(
            id=system_user_id,
            tenant_id=tenant.id,
            username=system_username,
            password_hash=hash_password(os.getenv("BOOTSTRAP_SYSTEM_PASSWORD", "system")),
            is_admin=True,
            status="active",
        )
        db.add(system_user)

    # Seed minimal agent registry entries so the UI can boot.
    #
    # Phase-1 behavior kept: sql_agent is always present.
    # Phase-2 behavior: optionally seed additional dev agents if enabled.
    base_target = os.getenv("BOOTSTRAP_AGENT_EXECUTION_TARGET_ID", "local-dev")

    def _ensure_agent(*, agent_id: str, display_name: str, graph_id: str) -> None:
        existing = db.execute(select(Agent).where(Agent.agent_id == agent_id)).scalar_one_or_none()
        if existing is not None:
            return
        db.add(
            Agent(
                agent_id=agent_id,
                tenant_id=tenant.id,
                display_name=display_name,
                description="",
                status="active",
                execution_target_id=base_target,
                graph_id=graph_id,
                assistant_id=None,
                config_json={},
            )
        )

    _ensure_agent(agent_id=os.getenv("BOOTSTRAP_AGENT_ID", "sql_agent"), display_name="SQL Agent", graph_id="sql_agent")

    # DEV: enable extra agents for full-checkup workbench.
    if os.getenv("BOOTSTRAP_EXTRA_AGENTS", "").strip().lower() in {"1", "true", "yes", "on"}:
        _ensure_agent(agent_id="deep_agent", display_name="Deep Agent", graph_id="deep_agent")
        _ensure_agent(agent_id="learn_semantic_search", display_name="Learn: Semantic Search", graph_id="learn_semantic_search")
