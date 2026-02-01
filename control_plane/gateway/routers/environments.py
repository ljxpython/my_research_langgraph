from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.deps.projects import require_project_role
from gateway.db.models import Environment
from gateway.repos.environments_repo import get_environment, list_environments
from gateway.repos.projects_repo import get_project
from gateway.schemas.environments import EnvironmentCreateRequest, EnvironmentResponse, EnvironmentUpdateRequest
from gateway.services.audit_service import try_write_audit_event
from gateway.utils.ids import make_id
from gateway.utils.time import dt_to_ms, utcnow


router = APIRouter(prefix="/v1", tags=["environments"])


def _env_to_response(e: Environment) -> EnvironmentResponse:
    return EnvironmentResponse(
        environment_id=e.environment_id,
        tenant_id=e.tenant_id,
        project_id=e.project_id,
        name=e.name,
        type=e.type,
        status=e.status,
        config_json=e.config_json,
        health_status=e.health_status,
        last_error=e.last_error,
        active_run_id=e.active_run_id,
        lock_expires_at=dt_to_ms(getattr(e, "lock_expires_at", None)),
        created_at=dt_to_ms(getattr(e, "created_at", None)) or 0,
        updated_at=dt_to_ms(getattr(e, "updated_at", None)) or 0,
    )


@router.get("/projects/{project_id}/environments", response_model=list[EnvironmentResponse])
def get_project_environments(
    project_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
    envs = list_environments(db, tenant_id=user.tenant_id, project_id=project_id)
    return [_env_to_response(e) for e in envs]


@router.get("/environments/{environment_id}", response_model=EnvironmentResponse)
def get_environment_detail(
    environment_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    # Look up by tenant+id, then enforce project visibility (avoid IDOR).
    env = (
        db.query(Environment)
        .filter(Environment.tenant_id == user.tenant_id, Environment.environment_id == environment_id)
        .one_or_none()
    )
    if env is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=env.project_id, min_role="viewer", allow_admin_read=True)
    return _env_to_response(env)


@router.post("/projects/{project_id}/environments", response_model=EnvironmentResponse, status_code=201)
def post_project_environment(
    project_id: str,
    req: EnvironmentCreateRequest,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="maintainer")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    if str(p.status).lower() == "archived":
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    now = utcnow()
    env = Environment(
        environment_id=make_id("env"),
        tenant_id=user.tenant_id,
        project_id=project_id,
        name=req.name,
        type=req.type,
        status="active",
        config_json=req.config_json,
        health_status="unknown",
        last_error=None,
        active_run_id=None,
        lock_acquired_at=None,
        lock_expires_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(env)
    db.flush()

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="environment.create",
            resource_type="environment",
            resource_id=env.environment_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id, "environmentId": env.environment_id, "name": env.name},
        )
    except Exception:
        pass

    return _env_to_response(env)


@router.post("/projects/{project_id}/environments/{environment_id}:unlock", response_model=EnvironmentResponse)
def unlock_environment(
    project_id: str,
    environment_id: str,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="owner")
    env = get_environment(db, tenant_id=user.tenant_id, project_id=project_id, environment_id=environment_id)
    if env is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    # Clear lock slot.
    env.active_run_id = None
    env.lock_acquired_at = None
    env.lock_expires_at = None

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="environment.unlock",
            resource_type="environment",
            resource_id=environment_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id, "environmentId": environment_id},
        )
    except Exception:
        pass

    return _env_to_response(env)


@router.patch("/projects/{project_id}/environments/{environment_id}", response_model=EnvironmentResponse)
def patch_environment(
    project_id: str,
    environment_id: str,
    req: EnvironmentUpdateRequest,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="maintainer")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    if str(p.status).lower() == "archived":
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    env = get_environment(db, tenant_id=user.tenant_id, project_id=project_id, environment_id=environment_id)
    if env is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    if req.status is not None:
        status = req.status.strip().lower()
        if status not in {"active", "disabled"}:
            raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "invalid status"})
        env.status = status

    if req.config_json is not None:
        env.config_json = req.config_json

    env.updated_at = utcnow()

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="environment.update",
            resource_type="environment",
            resource_id=env.environment_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id, "environmentId": env.environment_id},
        )
    except Exception:
        pass

    return _env_to_response(env)
