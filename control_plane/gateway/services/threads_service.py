from __future__ import annotations

from gateway.db.models import Thread
from gateway.repos.agents_repo import get_agent
from gateway.repos.threads_repo import get_thread
from gateway.utils.ids import make_id


def create_thread(
    db,
    *,
    tenant_id: str,
    created_by: str,
    agent_id: str,
    execution_target_id: str,
) -> Thread | None:
    agent = get_agent(db, tenant_id=tenant_id, agent_id=agent_id)
    if agent is None or agent.status != "active":
        return None

    thread = Thread(
        thread_id=make_id("th"),
        tenant_id=tenant_id,
        created_by=created_by,
        agent_id=agent.agent_id,
        execution_target_id=execution_target_id,
        graph_id=agent.graph_id,
        assistant_id=agent.assistant_id,
        active_run_id=None,
    )
    db.add(thread)
    db.flush()
    return thread


def get_thread_for_tenant(db, *, tenant_id: str, thread_id: str) -> Thread | None:
    return get_thread(db, tenant_id=tenant_id, thread_id=thread_id)
