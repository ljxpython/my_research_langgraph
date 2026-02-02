from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.repos.flow_chat_threads_repo import list_flow_chat_threads
from gateway.schemas.errors import ErrorResponse
from gateway.schemas.flows import (
    FlowChatThreadBinding,
    FlowChatThreadsResponse,
    UpsertFlowChatThreadRequest,
)
from gateway.services.flow_chat_threads_service import FlowChatThreadConflict, ensure_flow_chat_thread


router = APIRouter(prefix="/v1", tags=["flows"])


@router.get(
    "/flow-instances/{flow_instance_id}/chat-threads",
    response_model=FlowChatThreadsResponse,
)
def get_flow_chat_threads(
    flow_instance_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    created_by = None if user.is_admin else user.user_id
    rows = list_flow_chat_threads(
        db,
        tenant_id=user.tenant_id,
        flow_instance_id=flow_instance_id,
        created_by=created_by,
    )
    threads = {
        r.section_key: FlowChatThreadBinding(agentId=r.agent_id, threadId=r.thread_id)
        for r in rows
    }
    return FlowChatThreadsResponse(flowInstanceId=flow_instance_id, threads=threads)


@router.put(
    "/flow-instances/{flow_instance_id}/chat-threads/{section_key}",
    response_model=FlowChatThreadBinding,
    responses={404: {"model": ErrorResponse}},
)
def put_flow_chat_thread(
    flow_instance_id: str,
    section_key: str,
    req: UpsertFlowChatThreadRequest,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    try:
        mapping = ensure_flow_chat_thread(
            db,
            tenant_id=user.tenant_id,
            actor_user_id=user.user_id,
            actor_is_admin=user.is_admin,
            flow_instance_id=flow_instance_id,
            section_key=section_key,
            agent_id=req.agentId,
            execution_target_id=req.executionTargetId,
        )
    except FlowChatThreadConflict as e:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "FLOW_SECTION_AGENT_MISMATCH",
                "message": "Flow section is already bound to a different agent.",
                "details": {
                    "flowInstanceId": flow_instance_id,
                    "sectionKey": section_key,
                    "agentId": req.agentId,
                    "existingAgentId": e.existing_agent_id,
                },
            },
        )

    if mapping is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    return FlowChatThreadBinding(agentId=mapping.agent_id, threadId=mapping.thread_id)
