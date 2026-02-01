from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.deps.projects import require_project_role
from gateway.db.models import Artifact
from gateway.repos.artifacts_repo import get_artifact, list_artifacts_for_run
from gateway.repos.platform_runs_repo import get_platform_run
from gateway.repos.projects_repo import get_project
from gateway.schemas.artifacts import ArtifactResponse
from gateway.services.artifacts_service import get_artifacts_root_dir, save_upload_to_storage
from gateway.services.audit_service import try_write_audit_event
from gateway.services.platform_runs_service import append_run_event
from gateway.settings import settings
from gateway.utils.ids import make_id
from gateway.utils.time import dt_to_ms, utcnow


router = APIRouter(prefix="/v1", tags=["artifacts"])


def _artifact_download_url(artifact_id: str) -> str:
    return f"/v1/artifacts/{artifact_id}/download"


def _artifact_to_response(a: Artifact) -> ArtifactResponse:
    return ArtifactResponse(
        artifact_id=a.artifact_id,
        tenant_id=a.tenant_id,
        project_id=a.project_id,
        run_id=a.run_id,
        kind=a.kind,
        filename=a.filename,
        content_type=a.content_type,
        size_bytes=int(a.size_bytes or 0),
        created_at=dt_to_ms(getattr(a, "created_at", None)) or 0,
        created_by=a.created_by,
        download_url=_artifact_download_url(a.artifact_id),
    )


@router.post("/projects/{project_id}/artifacts", response_model=ArtifactResponse, status_code=201)
def upload_project_artifact(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    run_id: str | None = Form(default=None),
    kind: str = Form(default="other"),
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    require_project_role(db, user=user, project_id=project_id, min_role="maintainer")
    p = get_project(db, tenant_id=user.tenant_id, project_id=project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    if str(p.status).lower() == "archived":
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    prun = None
    if run_id:
        prun = get_platform_run(db, tenant_id=user.tenant_id, run_id=run_id)
        if prun is None or prun.project_id != project_id:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

    artifact_id = make_id("art")
    filename = file.filename or "artifact"
    content_type = file.content_type or "application/octet-stream"

    # Enforce direct-upload max (Phase A safety limits).
    max_bytes = int(getattr(settings, "artifact_direct_upload_max_bytes", 52428800))

    storage_key = f"{user.tenant_id}/{project_id}/{artifact_id}/{filename}"
    root = get_artifacts_root_dir()
    dest = (root / storage_key).resolve()
    # Prevent path traversal.
    if root.resolve() not in dest.parents:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "invalid storage path"})

    size_bytes, sha256hex = save_upload_to_storage(
        file_obj=file.file,
        max_bytes=max_bytes,
        dest_path=dest,
    )

    a = Artifact(
        artifact_id=artifact_id,
        tenant_id=user.tenant_id,
        project_id=project_id,
        run_id=run_id,
        kind=kind,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256hex,
        storage_key=storage_key,
        metadata_json={},
        created_at=utcnow(),
        created_by=user.user_id,
    )
    db.add(a)
    db.flush()

    if prun is not None:
        append_run_event(
            db,
            run=prun,
            event_type="artifact.created",
            payload={
                "artifact_id": artifact_id,
                "kind": kind,
                "filename": filename,
                "download_url": _artifact_download_url(artifact_id),
            },
        )

    try:
        try_write_audit_event(
            db,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            action="artifact.upload",
            resource_type="artifact",
            resource_id=artifact_id,
            request_id=getattr(request.state, "request_id", None),
            details={"projectId": project_id, "runId": run_id, "artifactId": artifact_id, "kind": kind},
        )
    except Exception:
        pass

    return _artifact_to_response(a)


@router.post("/artifacts", response_model=ArtifactResponse, status_code=201)
def upload_artifact_compat(
    request: Request,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    run_id: str | None = Form(default=None),
    kind: str = Form(default="other"),
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    """Compat entrypoint for Workbench-style uploads.

    Phase A platform MVP uses /v1/projects/{project_id}/artifacts.
    This endpoint exists to reduce future merge pain; it requires explicit project_id.
    """

    return upload_project_artifact(
        project_id=project_id,
        request=request,
        file=file,
        run_id=run_id,
        kind=kind,
        db=db,
        user=user,
    )


@router.get("/runs/{run_id}/artifacts", response_model=list[ArtifactResponse])
def get_run_artifacts(
    run_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    prun = get_platform_run(db, tenant_id=user.tenant_id, run_id=run_id)
    if prun is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=prun.project_id, min_role="viewer", allow_admin_read=True)
    artifacts = list_artifacts_for_run(db, tenant_id=user.tenant_id, run_id=run_id)
    return [_artifact_to_response(a) for a in artifacts]


@router.get("/artifacts/{artifact_id}", response_model=ArtifactResponse)
def get_artifact_metadata(
    artifact_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    a = get_artifact(db, tenant_id=user.tenant_id, artifact_id=artifact_id)
    if a is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=a.project_id, min_role="viewer", allow_admin_read=True)
    return _artifact_to_response(a)


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(
    artifact_id: str,
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    a = get_artifact(db, tenant_id=user.tenant_id, artifact_id=artifact_id)
    if a is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    require_project_role(db, user=user, project_id=a.project_id, min_role="viewer", allow_admin_read=True)

    root = get_artifacts_root_dir().resolve()
    path = (root / a.storage_key).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "invalid storage path"})
    if not path.exists():
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    return FileResponse(
        path=str(path),
        media_type=a.content_type,
        filename=a.filename,
    )
