from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException

from gateway.adapters.langgraph_adapter import fetch_thread_state, get_run as fetch_run, normalize_snapshot
from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.schemas.threads import CreateThreadRequest, CreateThreadResponse, SnapshotResponse
from gateway.services.threads_service import create_thread, get_thread_for_tenant
from gateway.repos.runs_repo import get_run as get_cp_run


router = APIRouter(prefix="/v1", tags=["threads"])


def _is_terminal_run_status(status: str) -> bool:
    s = status.lower().strip()
    if s in {"running", "pending", "in_progress"}:
        return False
    return bool(s)


@router.post("/threads", response_model=CreateThreadResponse, responses={404: {"model": dict}})
def post_threads(
    req: CreateThreadRequest,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    thread = create_thread(
        db,
        tenant_id=user.tenant_id,
        created_by=user.user_id,
        agent_id=req.agentId,
        execution_target_id=req.executionTargetId,
    )
    if thread is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return CreateThreadResponse(threadId=thread.thread_id)


@router.get("/threads/{thread_id}/snapshot", response_model=SnapshotResponse, responses={404: {"model": dict}})
def get_snapshot(
    thread_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    thread = get_thread_for_tenant(db, tenant_id=user.tenant_id, thread_id=thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    # Reconcile busy slot if the execution-plane run already finished.
    if thread.active_run_id:
        cp_run = get_cp_run(db, tenant_id=user.tenant_id, thread_id=thread.thread_id, run_id=thread.active_run_id)
        if cp_run is not None and isinstance(cp_run.execution_run_id, str) and cp_run.execution_run_id:
            try:
                ep_run = fetch_run(
                    thread_id=thread.thread_id,
                    execution_run_id=cp_run.execution_run_id,
                    execution_target_id=thread.execution_target_id,
                )
                ep_status = str(ep_run.get("status", ""))
                if _is_terminal_run_status(ep_status):
                    # Mark finished locally; keep semantics server-side continue.
                    thread.active_run_id = None
                    if ep_status.lower() in {"success", "succeeded", "completed"}:
                        cp_run.status = "succeeded"
                    elif ep_status.lower() in {"canceled", "cancelled", "interrupted"}:
                        cp_run.status = "canceled"
                    else:
                        cp_run.status = "failed"
                    db.commit()
            except Exception:
                pass

    # Pull from Execution Plane and normalize to AG-UI contract.
    try:
        lg_state = fetch_thread_state(thread_id=thread.thread_id, execution_target_id=thread.execution_target_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "ERROR", "message": "failed to fetch thread state", "details": {"reason": str(e)}},
        )

    messages, state = normalize_snapshot(langgraph_state=lg_state)

    updated_at = 0
    dt = getattr(thread, "last_activity_at", None)
    if isinstance(dt, datetime.datetime):
        updated_at = int(dt.timestamp() * 1000)

    return SnapshotResponse(
        threadId=thread.thread_id,
        busy=bool(thread.active_run_id),
        activeRunId=thread.active_run_id,
        updatedAt=updated_at,
        agentId=thread.agent_id,
        graphId=thread.graph_id,
        messages=messages,
        state=state,
    )
