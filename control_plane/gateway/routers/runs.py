from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from gateway.adapters.langgraph_adapter import cancel_run as cancel_execution_run
from gateway.adapters.langgraph_adapter import normalize_snapshot, stream_run
from gateway.db.engine import SessionLocal
from gateway.db.models import Run, Thread
from gateway.deps.auth import StreamingCurrentUser, UserContext
from gateway.repos.runs_repo import get_run
from gateway.schemas.agui import RunAgentInput
from gateway.schemas.runs import CancelResponse
from gateway.services.runs_service import mark_run_finished, set_execution_run_id
from gateway.utils.ids import make_id


router = APIRouter(prefix="/v1", tags=["runs"])


def _encode_sse(event: dict[str, Any]) -> str:
    payload = json.dumps(event, ensure_ascii=True, separators=(",", ":"))
    return f"data: {payload}\n\n"


@router.post("/agents/{agent_id}:run")
def run_agent(
    agent_id: str,
    input_data: RunAgentInput,
    request: Request,
    user: UserContext = StreamingCurrentUser,
):
    """Start a run and stream AG-UI SSE events.

    NOTE: This endpoint uses short-lived DB sessions (no yield dependencies)
    so we don't keep DB connections/locks open for the entire SSE stream.
    """

    cp_run_id = input_data.run_id or make_id("run")

    graph_id: str | None = None
    execution_target_id: str | None = None

    db = SessionLocal()
    try:
        thread = (
            db.execute(
                select(Thread)
                .where(Thread.tenant_id == user.tenant_id, Thread.thread_id == input_data.thread_id)
                .with_for_update()
            )
            .scalar_one_or_none()
        )
        if thread is None or thread.agent_id != agent_id:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

        graph_id = thread.graph_id
        execution_target_id = thread.execution_target_id

        if thread.active_run_id is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "THREAD_BUSY",
                    "message": "This thread already has an active run.",
                    "details": {"threadId": thread.thread_id, "activeRunId": thread.active_run_id},
                },
            )

        thread.active_run_id = cp_run_id

        run = Run(
            run_id=cp_run_id,
            tenant_id=user.tenant_id,
            thread_id=thread.thread_id,
            status="running",
            request_id=getattr(request.state, "request_id", None),
            created_by=user.user_id,
            execution_run_id=None,
        )
        db.add(run)
        db.commit()
    finally:
        db.close()

    if graph_id is None:
        raise HTTPException(status_code=500, detail={"code": "ERROR", "message": "missing graph_id"})

    # ---- Stream from Execution Plane and translate into AG-UI events ----
    def event_generator():
        # RUN_STARTED
        yield _encode_sse({"type": "RUN_STARTED", "threadId": input_data.thread_id, "runId": cp_run_id})

        def on_run_created(meta: Any) -> None:
            # Store the execution plane run id for cancel/snapshot reconciliation.
            execution_run_id = (
                getattr(meta, "run_id", None)
                or getattr(meta, "id", None)
                or (meta.get("run_id") if isinstance(meta, dict) else None)
                or (meta.get("id") if isinstance(meta, dict) else None)
            )
            if isinstance(execution_run_id, str) and execution_run_id:
                set_execution_run_id(
                    tenant_id=user.tenant_id,
                    thread_id=input_data.thread_id,
                    run_id=cp_run_id,
                    execution_run_id=execution_run_id,
                )

        try:
            # Execution Plane graphs typically accept {"messages": [...]}.
            ep_input = {
                "messages": [{"role": m.role, "content": m.content} for m in input_data.messages]
            }
            command = None
            if isinstance(input_data.forwarded_props, dict):
                c = input_data.forwarded_props.get("command")
                if isinstance(c, dict):
                    command = c

            for part in stream_run(
                thread_id=input_data.thread_id,
                graph_id=graph_id,
                input=ep_input,
                command=command,
                context=input_data.context,
                metadata={"cp_run_id": cp_run_id},
                on_run_created=on_run_created,
                execution_target_id=execution_target_id,
            ):
                event_name = getattr(part, "event", None)
                data = getattr(part, "data", None)
                if event_name not in {"values", "updates"}:
                    continue
                if not isinstance(data, dict):
                    continue

                messages, state = normalize_snapshot(langgraph_state={"values": data})
                yield _encode_sse({"type": "MESSAGES_SNAPSHOT", "messages": messages})
                yield _encode_sse({"type": "STATE_SNAPSHOT", "snapshot": state})

            # Normal completion: clear busy slot.
            yield _encode_sse({"type": "RUN_FINISHED", "threadId": input_data.thread_id, "runId": cp_run_id})
            mark_run_finished(tenant_id=user.tenant_id, thread_id=input_data.thread_id, run_id=cp_run_id, status="succeeded")
        except GeneratorExit:
            # Client disconnected. server-side continue: do NOT clear busy.
            return
        except Exception as e:
            yield _encode_sse({"type": "RUN_ERROR", "code": "ERROR", "message": str(e)})
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/threads/{thread_id}/runs/{run_id}:cancel", response_model=CancelResponse)
def cancel_run(
    thread_id: str,
    run_id: str,
    request: Request,
    user: UserContext = StreamingCurrentUser,
):
    # NOTE: we intentionally do not rely on get_db() here because we need
    # explicit transaction boundaries (row lock + immediate commit).

    db = SessionLocal()
    try:
        thread = (
            db.execute(
                select(Thread)
                .where(Thread.tenant_id == user.tenant_id, Thread.thread_id == thread_id)
                .with_for_update()
            )
            .scalar_one_or_none()
        )
        if thread is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

        if thread.active_run_id is None:
            return CancelResponse(ok=True, threadId=thread.thread_id, runId=run_id, status="already_finished")

        if thread.active_run_id != run_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "THREAD_BUSY",
                    "message": "This thread already has an active run.",
                    "details": {"threadId": thread.thread_id, "activeRunId": thread.active_run_id},
                },
            )

        # Clear busy slot immediately (best-effort semantics).
        thread.active_run_id = None

        run = get_run(db, tenant_id=user.tenant_id, thread_id=thread.thread_id, run_id=run_id)
        execution_run_id = run.execution_run_id if run is not None else None
        if run is not None:
            run.status = "canceled"

        db.commit()
    finally:
        db.close()

    # Best-effort cancel at Execution Plane.
    if isinstance(execution_run_id, str) and execution_run_id:
        try:
            cancel_execution_run(
                thread_id=thread_id,
                execution_run_id=execution_run_id,
                execution_target_id=getattr(thread, "execution_target_id", None),
            )
        except Exception:
            pass

    _ = request  # reserved for audit/requestId in Phase-2
    return CancelResponse(ok=True, threadId=thread_id, runId=run_id, status="cancel_requested")
