from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.deps.projects import require_project_role
from gateway.repos.platform_run_events_repo import list_run_events_after_seq
from gateway.repos.platform_runs_repo import get_platform_run, list_platform_runs
from gateway.repos.projects_repo import get_project
from gateway.schemas.errors import ErrorResponse
from gateway.schemas.platform_runs import (
    CancelPlatformRunResponse,
    CreatePlatformRunRequest,
    PlatformRunResponse,
    RunEventResponse,
    RunEventsPageResponse,
)
from gateway.services.audit_service import try_write_audit_event
from gateway.services.platform_runs_service import append_run_event, create_platform_run, request_cancel
from gateway.utils.time import dt_to_ms


router = APIRouter(prefix="/v1", tags=["platform-runs"])


def _run_to_response(r) -> PlatformRunResponse:
    return PlatformRunResponse(
        run_id=r.run_id,
        tenant_id=r.tenant_id,
        project_id=r.project_id,
        environment_id=r.environment_id,
        status=r.status,
        runner=r.runner,
        client_run_id=r.client_run_id,
        params=r.params_json or {},
        created_at=dt_to_ms(getattr(r, "created_at", None)) or 0,
        started_at=dt_to_ms(getattr(r, "started_at", None)),
        finished_at=dt_to_ms(getattr(r, "finished_at", None)),
        summary_json=r.summary_json or {},
    )


@router.get("/projects/{project_id}/runs", response_model=list[PlatformRunResponse])
def get_project_runs(
    project_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
    runs = list_platform_runs(db, tenant_id=user.tenant_id, project_id=project_id)
    return [_run_to_response(r) for r in runs]


@router.post(
    "/projects/{project_id}/runs",
    response_model=PlatformRunResponse,
    responses={409: {"model": ErrorResponse}},
)
def post_project_run(
    project_id: str,
    req: CreatePlatformRunRequest,
    request: Request,
    response: Response,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    # Create run is a write.
    require_project_role(db, user=user, project_id=project_id, min_role="maintainer")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    if str(p.status).lower() == "archived":
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    run, created = create_platform_run(
        db,
        tenant_id=user.tenant_id,
        project_id=project_id,
        triggered_by=user.user_id,
        client_run_id=req.client_run_id,
        environment_id=req.environment_id,
        runner=req.runner,
        params=req.params,
        request_id=getattr(request.state, "request_id", None),
    )
    if created:
        append_run_event(db, run=run, event_type="run.queued", payload={})
        try:
            try_write_audit_event(
                db,
                tenant_id=user.tenant_id,
                actor_id=user.user_id,
                action="run.create",
                resource_type="run",
                resource_id=run.run_id,
                request_id=getattr(request.state, "request_id", None),
                details={
                    "projectId": project_id,
                    "environmentId": run.environment_id,
                    "runId": run.run_id,
                    "clientRunId": run.client_run_id,
                },
            )
        except Exception:
            pass

    if created:
        response.status_code = 201
    return _run_to_response(run)


@router.get("/runs/{run_id}", response_model=PlatformRunResponse)
def get_run_detail(
    run_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    run = get_platform_run(db, tenant_id=user.tenant_id, run_id=run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=run.project_id, min_role="viewer", allow_admin_read=True)
    return _run_to_response(run)


@router.get("/runs/{run_id}/events", response_model=RunEventsPageResponse)
def get_run_events(
    run_id: str,
    cursor: str | None = None,
    limit: int = 100,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    run = get_platform_run(db, tenant_id=user.tenant_id, run_id=run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=run.project_id, min_role="viewer", allow_admin_read=True)

    if limit <= 0:
        limit = 100
    if limit > 1000:
        limit = 1000

    after_seq = 0
    if cursor:
        try:
            after_seq = int(cursor)
        except Exception:
            raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "invalid cursor"})

    events = list_run_events_after_seq(db, tenant_id=user.tenant_id, run_id=run_id, after_seq=after_seq, limit=limit + 1)
    has_more = len(events) > limit
    events_page = events[:limit]
    next_cursor = cursor or "0"
    if events_page:
        next_cursor = str(events_page[-1].seq)

    out_events: list[RunEventResponse] = []
    for e in events_page:
        out_events.append(
            RunEventResponse(
                event_id=e.event_id,
                seq=e.seq,
                ts=dt_to_ms(getattr(e, "ts", None)) or 0,
                type=e.type,
                payload=e.payload_json or {},
            )
        )

    return RunEventsPageResponse(runId=run_id, events=out_events, nextCursor=next_cursor, hasMore=has_more)


@router.post("/runs/{run_id}:cancel", response_model=CancelPlatformRunResponse)
def cancel_run(
    run_id: str,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    run = get_platform_run(db, tenant_id=user.tenant_id, run_id=run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=run.project_id, min_role="maintainer")

    run = request_cancel(db, tenant_id=user.tenant_id, run_id=run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    # If we canceled immediately, also write a terminal event.
    if run.status == "canceled" and run.finished_at is not None:
        append_run_event(db, run=run, event_type="run.finished", payload={"status": "canceled"})

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="run.cancel",
            resource_type="run",
            resource_id=run_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": run.project_id, "runId": run_id},
        )
    except Exception:
        pass

    return CancelPlatformRunResponse(ok=True, run_id=run_id, status=run.status)
