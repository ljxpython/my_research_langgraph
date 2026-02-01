from __future__ import annotations

import threading
import time

from sqlalchemy import select, update

from gateway.db.engine import session_scope
from gateway.db.models import Environment, PlatformRun
from gateway.services.audit_service import try_write_audit_event
from gateway.services.platform_runs_service import append_run_event
from gateway.utils.time import utcnow


def _release_environment_lock(db, *, tenant_id: str, environment_id: str, run_id: str) -> None:
    db.execute(
        update(Environment)
        .where(
            Environment.tenant_id == tenant_id,
            Environment.environment_id == environment_id,
            Environment.active_run_id == run_id,
        )
        .values(active_run_id=None, lock_acquired_at=None, lock_expires_at=None)
    )


def _is_terminal(status: str) -> bool:
    return status in {"succeeded", "failed", "canceled"}


def _run_worker_loop(stop: threading.Event) -> None:
    """In-process runner for Phase A Dummy Runner.

    Coordination is DB-based so it can later run in multi-replica with safe claiming.
    """

    while not stop.is_set():
        did_work = False
        with session_scope() as db:
            # Pick a small batch.
            queued = list(
                db.execute(
                    select(PlatformRun)
                    .where(PlatformRun.status == "queued")
                    .order_by(PlatformRun.created_at.asc())
                    .limit(5)
                )
                .scalars()
                .all()
            )

            for run in queued:
                # Claim run atomically.
                now = utcnow()
                claim = (
                    update(PlatformRun)
                    .where(PlatformRun.tenant_id == run.tenant_id, PlatformRun.run_id == run.run_id, PlatformRun.status == "queued")
                    .values(status="running", started_at=now)
                )
                res = db.execute(claim)
                if res.rowcount != 1:
                    continue

                did_work = True
                run.status = "running"
                run.started_at = now
                append_run_event(db, run=run, event_type="run.started", payload={})

                # Simulate work.
                for i in range(5):
                    # Refresh from DB to observe cancel requests.
                    db.refresh(run)
                    if run.cancel_requested_at is not None:
                        break
                    append_run_event(
                        db,
                        run=run,
                        event_type="log.append",
                        payload={"level": "info", "message": f"dummy step {i + 1}/5"},
                    )
                    db.commit()
                    time.sleep(1)

                # Terminal transition.
                db.refresh(run)
                finished = utcnow()
                if run.cancel_requested_at is not None:
                    run.status = "canceled"
                    run.canceled_at = finished
                    run.finished_at = finished
                    append_run_event(db, run=run, event_type="run.finished", payload={"status": "canceled"})
                else:
                    run.status = "succeeded"
                    run.finished_at = finished
                    run.summary_json = {"summary_version": 1, "status": "succeeded"}
                    append_run_event(db, run=run, event_type="run.finished", payload={"status": "succeeded"})

                _release_environment_lock(db, tenant_id=run.tenant_id, environment_id=run.environment_id, run_id=run.run_id)

                # Best-effort audit.
                try:
                    try_write_audit_event(
                        db,
                        tenant_id=run.tenant_id,
                        actor_id=run.triggered_by,
                        action="run.finish",
                        resource_type="run",
                        resource_id=run.run_id,
                        request_id=run.request_id,
                        details={"projectId": run.project_id, "runId": run.run_id, "status": run.status},
                    )
                except Exception:
                    pass

        if not did_work:
            stop.wait(0.5)


def _env_lock_sweeper_loop(stop: threading.Event, *, system_actor_id: str) -> None:
    while not stop.is_set():
        now = utcnow()
        with session_scope() as db:
            expired = list(
                db.execute(
                    select(Environment)
                    .where(Environment.active_run_id.is_not(None), Environment.lock_expires_at.is_not(None), Environment.lock_expires_at < now)
                    .limit(50)
                )
                .scalars()
                .all()
            )

            for env in expired:
                active_run_id = env.active_run_id
                env.active_run_id = None
                env.lock_acquired_at = None
                env.lock_expires_at = None

                # Mark the run as failed if still non-terminal.
                if isinstance(active_run_id, str) and active_run_id:
                    run = db.execute(
                        select(PlatformRun).where(PlatformRun.tenant_id == env.tenant_id, PlatformRun.run_id == active_run_id)
                    ).scalar_one_or_none()
                    if run is not None and not _is_terminal(run.status):
                        run.status = "failed"
                        run.finished_at = now
                        run.summary_json = {"summary_version": 1, "status": "failed", "reason": "environment lock expired"}
                        append_run_event(
                            db,
                            run=run,
                            event_type="error.raised",
                            payload={"error_code": "LOCK_EXPIRED", "message": "environment lock expired"},
                        )
                        append_run_event(db, run=run, event_type="run.finished", payload={"status": "failed"})

                try:
                    try_write_audit_event(
                        db,
                        tenant_id=env.tenant_id,
                        actor_id=system_actor_id,
                        action="environment.lock.sweep",
                        resource_type="environment",
                        resource_id=env.environment_id,
                        request_id=None,
                        details={
                            "environmentId": env.environment_id,
                            "activeRunId": active_run_id,
                            "reason": "lock_expires_at passed",
                        },
                    )
                except Exception:
                    pass

        stop.wait(300)


def start_platform_workers(*, system_actor_id: str) -> threading.Event:
    stop = threading.Event()

    t1 = threading.Thread(target=_run_worker_loop, args=(stop,), name="platform-runner", daemon=True)
    t2 = threading.Thread(
        target=_env_lock_sweeper_loop,
        args=(stop,),
        kwargs={"system_actor_id": system_actor_id},
        name="env-lock-sweeper",
        daemon=True,
    )
    t1.start()
    t2.start()
    return stop
