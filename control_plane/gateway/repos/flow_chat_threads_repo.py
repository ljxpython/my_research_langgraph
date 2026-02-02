from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import FlowChatThread


def list_flow_chat_threads(
    db,
    *,
    tenant_id: str,
    flow_instance_id: str,
    created_by: str | None = None,
) -> list[FlowChatThread]:
    stmt = select(FlowChatThread).where(
        FlowChatThread.tenant_id == tenant_id,
        FlowChatThread.flow_instance_id == flow_instance_id,
    )
    if created_by:
        stmt = stmt.where(FlowChatThread.created_by == created_by)
    stmt = stmt.order_by(FlowChatThread.section_key.asc())
    return list(db.execute(stmt).scalars().all())


def get_flow_chat_thread(
    db,
    *,
    tenant_id: str,
    flow_instance_id: str,
    section_key: str,
    created_by: str | None = None,
) -> FlowChatThread | None:
    stmt = select(FlowChatThread).where(
        FlowChatThread.tenant_id == tenant_id,
        FlowChatThread.flow_instance_id == flow_instance_id,
        FlowChatThread.section_key == section_key,
    )
    if created_by:
        stmt = stmt.where(FlowChatThread.created_by == created_by)
    return db.execute(stmt).scalar_one_or_none()
