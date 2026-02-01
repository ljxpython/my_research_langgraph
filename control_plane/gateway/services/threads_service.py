from __future__ import annotations

import uuid

from gateway.adapters.langgraph_adapter import ensure_thread_exists
from gateway.db.models import Thread
from gateway.repos.agents_repo import get_agent
from gateway.repos.threads_repo import get_thread


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
        # LangGraph expects thread_id to be a UUID string.
        # We use the same ID for CP and EP to keep the Phase-1 mapping trivial.
        thread_id=str(uuid.uuid4()),
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

    # Create the corresponding thread in the Execution Plane so snapshot restore works
    # even before the first run.
    ensure_thread_exists(
        thread_id=thread.thread_id,
        graph_id=thread.graph_id,
        execution_target_id=thread.execution_target_id,
        metadata={
            "tenant_id": tenant_id,
            "agent_id": thread.agent_id,
            "created_by": created_by,
        },
    )
    return thread


def get_thread_for_tenant(db, *, tenant_id: str, thread_id: str) -> Thread | None:
    return get_thread(db, tenant_id=tenant_id, thread_id=thread_id)
