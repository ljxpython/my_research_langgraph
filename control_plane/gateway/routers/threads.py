from __future__ import annotations

import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from langgraph_sdk.errors import NotFoundError

from gateway.adapters.langgraph_adapter import (
    fetch_thread_history,
    fetch_thread_state,
    get_run as fetch_run,
    normalize_snapshot,
    search_threads,
)
from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.db.models import Thread
from gateway.schemas.threads import CreateThreadRequest, CreateThreadResponse, SnapshotResponse, ThreadSummary
from gateway.repos.agents_repo import get_agent
from gateway.services.threads_service import create_thread, get_thread_for_tenant, import_thread
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


@router.get("/threads", response_model=list[ThreadSummary])
def list_threads(
    agentId: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    """List recent threads for the current tenant.

    Phase-1: minimal listing for UI restore/history.
    - Non-admin users only see their own threads.
    - Admin users see tenant threads.
    """

    # Best-effort: if agentId is provided, also surface threads created directly in the Execution Plane
    # (e.g. via examples/agent-chat-ui) by importing them into CP metadata.
    if isinstance(agentId, str) and agentId:
        agent = get_agent(db, tenant_id=user.tenant_id, agent_id=agentId)
        if agent is not None and agent.status == "active":
            # agent-chat-ui searches EP threads by metadata.
            # In practice, different code paths may set different keys; search a few variants.
            metadata_candidates: list[dict[str, Any]] = [
                {"graph_id": agent.graph_id},
                {"agent_id": agent.agent_id},
            ]
            if isinstance(agent.assistant_id, str) and agent.assistant_id:
                metadata_candidates.append({"assistant_id": agent.assistant_id})

            try:
                seen: set[str] = set()
                for meta in metadata_candidates:
                    for t in search_threads(
                        metadata=meta,
                        limit=limit,
                        execution_target_id=agent.execution_target_id,
                    ):
                        tid = t.get("thread_id")
                        if not isinstance(tid, str) or not tid:
                            continue
                        if tid in seen:
                            continue
                        seen.add(tid)

                        # Prefer EP updated_at for sorting if present.
                        last_activity: datetime.datetime | None = None
                        updated_at = t.get("updated_at")
                        if isinstance(updated_at, datetime.datetime):
                            last_activity = updated_at
                        elif isinstance(updated_at, str) and updated_at:
                            try:
                                # Handle both "...Z" and "+00:00" forms.
                                s = updated_at.replace("Z", "+00:00")
                                last_activity = datetime.datetime.fromisoformat(s)
                            except Exception:
                                last_activity = None

                        import_thread(
                            db,
                            tenant_id=user.tenant_id,
                            created_by=user.user_id,
                            agent_id=agent.agent_id,
                            thread_id=tid,
                            last_activity_at=last_activity,
                        )
            except Exception:
                # Dev UX only; failures should not break listing.
                pass

    stmt = select(Thread).where(Thread.tenant_id == user.tenant_id)
    if not user.is_admin:
        stmt = stmt.where(Thread.created_by == user.user_id)
    if isinstance(agentId, str) and agentId:
        stmt = stmt.where(Thread.agent_id == agentId)

    # Most recent activity first.
    stmt = stmt.order_by(Thread.last_activity_at.desc()).limit(limit)
    rows = list(db.execute(stmt).scalars().all())

    out: list[ThreadSummary] = []
    # For busy status, CP active_run_id is authoritative. If CP doesn't know a thread
    # (imported from EP), it will still show up as idle here.
    for t in rows:
        updated_at = 0
        dt = getattr(t, "last_activity_at", None)
        if isinstance(dt, datetime.datetime):
            updated_at = int(dt.timestamp() * 1000)
        out.append(
            ThreadSummary(
                threadId=t.thread_id,
                agentId=t.agent_id,
                busy=bool(t.active_run_id),
                activeRunId=t.active_run_id,
                updatedAt=updated_at,
            )
        )
    return out


@router.get("/threads/{thread_id}/snapshot", response_model=SnapshotResponse, responses={404: {"model": dict}})
def get_snapshot(
    thread_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    thread = get_thread_for_tenant(db, tenant_id=user.tenant_id, thread_id=thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    # Phase-1: non-admin users can only access their own threads.
    # This prevents IDOR within a tenant (thread_id is user-controllable input).
    if not user.is_admin and thread.created_by != user.user_id:
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
    except NotFoundError:
        # Strict mode (dev usability tradeoff): Execution Plane may be in-memory.
        # If EP restarted, the Control Plane thread metadata can outlive EP state.
        raise HTTPException(
            status_code=404,
            detail={
                "code": "EXECUTION_THREAD_NOT_FOUND",
                "message": "thread not found in execution plane",
                "details": {"threadId": thread.thread_id, "executionTargetId": thread.execution_target_id},
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "ERROR", "message": "failed to fetch thread state", "details": {"reason": str(e)}},
        )

    messages, state = normalize_snapshot(langgraph_state=lg_state)

    def _needs_history_fallback(msgs: list[dict[str, Any]]) -> bool:
        if not msgs:
            return True
        # Heuristic: if snapshot only contains user messages (or only 1 message),
        # the EP `get_state()` likely isn't returning the latest checkpoint with AI/tool outputs.
        if len(msgs) <= 1:
            return True
        for m in msgs:
            role = m.get("role")
            if isinstance(role, str) and role.lower().strip() not in {"user", "human"}:
                return False
        return True

    # Fallback: some graphs don't expose full messages in `get_state()` or return only partial history.
    # Try thread history and pick the snapshot that contains the richest messages.
    if _needs_history_fallback(messages):
        try:
            history = fetch_thread_history(
                thread_id=thread.thread_id,
                execution_target_id=thread.execution_target_id,
                limit=50,
            )
            best_messages: list[dict[str, Any]] = []
            best_state: dict[str, Any] | None = None
            for hs in history:
                hm, hs_state = normalize_snapshot(langgraph_state=hs)
                if len(hm) > len(best_messages):
                    best_messages = hm
                    best_state = hs_state
            if best_messages:
                messages = best_messages
                if isinstance(best_state, dict):
                    state = best_state
        except NotFoundError:
            # Same strict behavior as get_state() path.
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "EXECUTION_THREAD_NOT_FOUND",
                    "message": "thread not found in execution plane",
                    "details": {"threadId": thread.thread_id, "executionTargetId": thread.execution_target_id},
                },
            )
        except Exception:
            # Ignore fallback failures and return the original (possibly empty) snapshot.
            pass

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
