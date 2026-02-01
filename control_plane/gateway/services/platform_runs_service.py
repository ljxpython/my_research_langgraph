from __future__ import annotations

import datetime

from fastapi import HTTPException
from sqlalchemy import and_, select, update

from gateway.db.models import Environment, PlatformRun, PlatformRunEvent
from gateway.settings import settings
from gateway.utils.ids import make_id
from gateway.utils.time import utcnow


def _ensure_ascii_client_run_id(client_run_id: str) -> None:
    try:
        client_run_id.encode("ascii")
    except Exception:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "client_run_id must be ASCII"})
    if len(client_run_id) > 128:
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "client_run_id too long"})


def create_platform_run(
    db,
    *,
    tenant_id: str,
    project_id: str,
    triggered_by: str,
    client_run_id: str,
    environment_id: str,
    runner: str,
    params: dict,
    request_id: str | None,
) -> tuple[PlatformRun, bool]:
    """Create or replay a platform run.

    Returns: (run, created)
      - created=True: new run created (HTTP 201)
      - created=False: replay (HTTP 200)
    """

    _ensure_ascii_client_run_id(client_run_id)

    existing = db.execute(
        select(PlatformRun).where(
            PlatformRun.tenant_id == tenant_id,
            PlatformRun.project_id == project_id,
            PlatformRun.client_run_id == client_run_id,
        )
    ).scalar_one_or_none()

    if existing is not None:
        # Idempotent replay: body must match.
        if existing.environment_id != environment_id or existing.runner != runner or (existing.params_json or {}) != (params or {}):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "IDEMPOTENCY_KEY_CONFLICT",
                    "message": "client_run_id already used with a different request body",
                    "details": {
                        "projectId": project_id,
                        "clientRunId": client_run_id,
                        "existingRunId": existing.run_id,
                    },
                },
            )
        return existing, False

    if runner.strip().lower() != "dummy":
        raise HTTPException(status_code=400, detail={"code": "ERROR", "message": "unsupported runner"})

    # Acquire environment lock.
    now = utcnow()
    ttl_seconds = int(getattr(settings, "default_env_lock_ttl_seconds", 7200))
    expires_at = now + datetime.timedelta(seconds=ttl_seconds)

    run_id = make_id("prun")
    upd = (
        update(Environment)
        .where(
            Environment.tenant_id == tenant_id,
            Environment.project_id == project_id,
            Environment.environment_id == environment_id,
            Environment.status == "active",
            and_(
                # Free slot or expired.
                (Environment.active_run_id.is_(None))
                | (Environment.lock_expires_at.is_(None))
                | (Environment.lock_expires_at < now)
            ),
        )
        .values(active_run_id=run_id, lock_acquired_at=now, lock_expires_at=expires_at)
    )
    result = db.execute(upd)
    if result.rowcount != 1:
        env = db.execute(
            select(Environment).where(
                Environment.tenant_id == tenant_id,
                Environment.project_id == project_id,
                Environment.environment_id == environment_id,
            )
        ).scalar_one_or_none()
        if env is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")
        if env.status != "active":
            raise HTTPException(status_code=403, detail="FORBIDDEN")
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ENVIRONMENT_BUSY",
                "message": "This environment already has an active run.",
                "details": {"environmentId": environment_id, "activeRunId": env.active_run_id},
            },
        )

    run = PlatformRun(
        run_id=run_id,
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        status="queued",
        runner=runner,
        client_run_id=client_run_id,
        params_json=params or {},
        request_id=request_id,
        triggered_by=triggered_by,
        created_at=now,
        started_at=None,
        finished_at=None,
        cancel_requested_at=None,
        canceled_at=None,
        summary_json={},
        next_event_seq=0,
    )
    db.add(run)
    db.flush()
    return run, True


def append_run_event(
    db,
    *,
    run: PlatformRun,
    event_type: str,
    payload: dict,
) -> PlatformRunEvent:
    # Allocate seq atomically from the run row.
    res = db.execute(
        update(PlatformRun)
        .where(PlatformRun.tenant_id == run.tenant_id, PlatformRun.run_id == run.run_id)
        .values(next_event_seq=PlatformRun.next_event_seq + 1)
        .returning(PlatformRun.next_event_seq)
    )
    new_seq = res.scalar_one()

    evt = PlatformRunEvent(
        event_id=make_id("revt"),
        tenant_id=run.tenant_id,
        project_id=run.project_id,
        run_id=run.run_id,
        seq=int(new_seq),
        type=event_type,
        payload_json=payload or {},
    )
    db.add(evt)
    return evt


def request_cancel(db, *, tenant_id: str, run_id: str) -> PlatformRun | None:
    run = db.execute(select(PlatformRun).where(PlatformRun.tenant_id == tenant_id, PlatformRun.run_id == run_id)).scalar_one_or_none()
    if run is None:
        return None
    now = utcnow()

    if run.status in {"succeeded", "failed", "canceled"}:
        return run

    # If queued, we can cancel immediately.
    if run.status == "queued":
        run.status = "canceled"
        run.cancel_requested_at = now
        run.canceled_at = now
        run.finished_at = now

        # Release environment lock slot immediately.
        db.execute(
            update(Environment)
            .where(
                Environment.tenant_id == tenant_id,
                Environment.environment_id == run.environment_id,
                Environment.active_run_id == run.run_id,
            )
            .values(active_run_id=None, lock_acquired_at=None, lock_expires_at=None)
        )
        return run

    run.cancel_requested_at = now
    return run
