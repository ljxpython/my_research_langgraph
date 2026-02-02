from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import FlowChatThread
from gateway.services.threads_service import create_thread
from gateway.utils.ids import make_id


class FlowChatThreadConflict(Exception):
    def __init__(self, *, existing_agent_id: str, requested_agent_id: str):
        super().__init__(
            f"flow section already bound to agent {existing_agent_id} (requested {requested_agent_id})"
        )
        self.existing_agent_id = existing_agent_id
        self.requested_agent_id = requested_agent_id


def ensure_flow_chat_thread(
    db,
    *,
    tenant_id: str,
    actor_user_id: str,
    actor_is_admin: bool,
    flow_instance_id: str,
    section_key: str,
    agent_id: str,
    execution_target_id: str = "local-dev",
) -> FlowChatThread | None:
    """Idempotently bind (flow_instance_id, section_key) -> (agent_id, thread_id).

    Non-admin users are scoped to their own records to avoid accidental IDOR within a tenant
    before we have a full flow RBAC model.
    """

    created_by_filter = None if actor_is_admin else actor_user_id

    # 先锁定该分区映射，避免并发创建出两个 thread。
    stmt = (
        select(FlowChatThread)
        .where(
            FlowChatThread.tenant_id == tenant_id,
            FlowChatThread.flow_instance_id == flow_instance_id,
            FlowChatThread.section_key == section_key,
        )
        .with_for_update()
    )
    if created_by_filter:
        stmt = stmt.where(FlowChatThread.created_by == created_by_filter)

    existing = db.execute(stmt).scalar_one_or_none()
    if existing is not None:
        if existing.agent_id != agent_id:
            raise FlowChatThreadConflict(existing_agent_id=existing.agent_id, requested_agent_id=agent_id)
        return existing

    # 新建 thread（同时会 ensure EP thread 存在）。
    thread = create_thread(
        db,
        tenant_id=tenant_id,
        created_by=actor_user_id,
        agent_id=agent_id,
        execution_target_id=execution_target_id,
    )
    if thread is None:
        return None

    mapping = FlowChatThread(
        id=make_id("fct"),
        tenant_id=tenant_id,
        flow_instance_id=flow_instance_id,
        section_key=section_key,
        agent_id=agent_id,
        thread_id=thread.thread_id,
        created_by=actor_user_id,
    )
    db.add(mapping)
    db.flush()
    return mapping
