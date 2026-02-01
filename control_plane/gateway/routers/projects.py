from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.deps.projects import require_project_role
from gateway.db.models import Project, ProjectMember
from gateway.repos.project_members_repo import list_project_members
from gateway.repos.projects_repo import get_project, list_projects, list_projects_for_user
from gateway.schemas.errors import ErrorResponse
from gateway.schemas.projects import (
    ProjectCreateRequest,
    ProjectMemberResponse,
    ProjectMemberUpsertRequest,
    ProjectResponse,
)
from gateway.services.audit_service import try_write_audit_event
from gateway.utils.ids import make_id
from gateway.utils.time import dt_to_ms, utcnow


router = APIRouter(prefix="/v1", tags=["projects"])


def _project_to_response(p: Project) -> ProjectResponse:
    return ProjectResponse(
        project_id=p.project_id,
        tenant_id=p.tenant_id,
        name=p.name,
        description=p.description,
        status=p.status,
        created_by=p.created_by,
        created_at=dt_to_ms(getattr(p, "created_at", None)) or 0,
        updated_at=dt_to_ms(getattr(p, "updated_at", None)) or 0,
    )


@router.get("/projects", response_model=list[ProjectResponse])
def get_projects(db=Depends(get_db), user: UserContext = CurrentUser):
    projects = (
        list_projects(db, tenant_id=user.tenant_id)
        if user.is_admin
        else list_projects_for_user(db, tenant_id=user.tenant_id, user_id=user.user_id)
    )
    return [_project_to_response(p) for p in projects]


@router.post("/projects", response_model=ProjectResponse, status_code=201)
def post_projects(
    req: ProjectCreateRequest,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    now = utcnow()
    p = Project(
        project_id=make_id("proj"),
        tenant_id=user.tenant_id,
        name=req.name,
        description=req.description,
        status="active",
        created_by=user.user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(p)
    db.add(
        ProjectMember(
            tenant_id=user.tenant_id,
            project_id=p.project_id,
            user_id=user.user_id,
            role="owner",
        )
    )
    db.flush()

    # Best-effort audit.
    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="project.create",
            resource_type="project",
            resource_id=p.project_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": p.project_id, "name": p.name},
        )
    except Exception:
        pass

    return _project_to_response(p)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_project_detail(
    project_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return _project_to_response(p)


@router.get(
    "/projects/{project_id}/members",
    response_model=list[ProjectMemberResponse],
)
def get_project_members(
    project_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="viewer", allow_admin_read=True)
    members = list_project_members(db, tenant_id=user.tenant_id, project_id=project_id)
    return [ProjectMemberResponse(user_id=m.user_id, role=m.role) for m in members]


@router.put(
    "/projects/{project_id}/members/{member_user_id}",
    response_model=ProjectMemberResponse,
)
def put_project_member(
    project_id: str,
    member_user_id: str,
    req: ProjectMemberUpsertRequest,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="owner")
    if req.user_id != member_user_id:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "user_id mismatch"})

    role = req.role.strip().lower()
    if role not in {"owner", "maintainer", "viewer"}:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "invalid role"})

    existing = db.get(ProjectMember, {"project_id": project_id, "user_id": member_user_id})
    if existing is None:
        db.add(ProjectMember(tenant_id=user.tenant_id, project_id=project_id, user_id=member_user_id, role=role))
    else:
        existing.role = role

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="project.member.upsert",
            resource_type="project",
            resource_id=project_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id, "memberUserId": member_user_id, "role": role},
        )
    except Exception:
        pass

    return ProjectMemberResponse(user_id=member_user_id, role=role)


@router.post("/projects/{project_id}:archive", response_model=ProjectResponse)
def archive_project(
    project_id: str,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="owner")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    p.status = "archived"

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="project.archive",
            resource_type="project",
            resource_id=project_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id},
        )
    except Exception:
        pass

    return _project_to_response(p)


@router.post("/projects/{project_id}:unarchive", response_model=ProjectResponse)
def unarchive_project(
    project_id: str,
    request: Request,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="owner")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    p.status = "active"

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="project.unarchive",
            resource_type="project",
            resource_id=project_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id},
        )
    except Exception:
        pass

    return _project_to_response(p)
