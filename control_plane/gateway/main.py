"""FastAPI application entrypoint."""

from __future__ import annotations

import os

from fastapi import FastAPI

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from gateway.middleware.cors import add_cors
from gateway.middleware.request_id import RequestIdMiddleware
from gateway.middleware.rate_limit import RateLimitMiddleware
from gateway.routers.health import router as health_router
from gateway.routers.auth import router as auth_router
from gateway.routers.agents import router as agents_router
from gateway.routers.threads import router as threads_router
from gateway.routers.runs import router as runs_router

from gateway.routers.projects import router as projects_router
from gateway.routers.environments import router as environments_router
from gateway.routers.platform_runs import router as platform_runs_router
from gateway.routers.artifacts import router as artifacts_router
from gateway.routers.audit import router as audit_router
from gateway.routers.flow_instances import router as flow_instances_router

from gateway.db.engine import session_scope
from gateway.settings import settings
from gateway.services.bootstrap_service import ensure_seed_data
from gateway.services.platform_workers import start_platform_workers
from gateway.schemas.errors import ErrorBody, ErrorResponse


def create_app() -> FastAPI:
    app = FastAPI(title="Control Plane", version="0.1.0")

    # CORS is required because we run frontend and CP cross-origin.
    add_cors(app)

    # Ensure every request has a request_id for logs/audit.
    app.add_middleware(
        RateLimitMiddleware,
        enabled=getattr(settings, "rate_limit_enabled", True),
        user_write_rpm=getattr(settings, "rate_limit_user_write_rpm", 120),
        user_read_rpm=getattr(settings, "rate_limit_user_read_rpm", 1200),
        user_poll_rpm=getattr(settings, "rate_limit_user_poll_rpm", 60),
        redis_url=getattr(settings, "redis_url", None),
    )
    app.add_middleware(RequestIdMiddleware)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Normalize HTTP errors to shared contract shape.

        shared/contracts/http/errors.md
        """

        request_id = getattr(request.state, "request_id", None)

        # Allow raising structured errors via HTTPException(detail={...}).
        if isinstance(exc.detail, dict):
            code = str(exc.detail.get("code", "ERROR"))
            message = str(exc.detail.get("message", code))
            details = exc.detail.get("details")
            if not isinstance(details, dict):
                details = {}
        else:
            code = str(exc.detail) if isinstance(exc.detail, str) else "ERROR"
            message = code
            details = {}

        body = ErrorResponse(
            error=ErrorBody(code=code, message=message, requestId=request_id, details=details)
        )
        return JSONResponse(status_code=exc.status_code, content=body.model_dump())

    @app.on_event("startup")
    def _startup_seed():
        # Seed minimal tenant/admin user for Phase-1.
        with session_scope() as db:
            ensure_seed_data(db)

        # Start platform background workers (Dummy Runner + lock sweeper).
        # This is safe for single-instance dev; multi-replica needs shared DB coordination (which we already use).
        system_actor_id = os.getenv("BOOTSTRAP_SYSTEM_USER_ID", "u_system")
        app.state.platform_workers_stop = start_platform_workers(system_actor_id=system_actor_id)

    @app.on_event("shutdown")
    def _shutdown_workers():
        stop = getattr(app.state, "platform_workers_stop", None)
        if stop is not None:
            try:
                stop.set()
            except Exception:
                pass

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(agents_router)
    app.include_router(threads_router)
    app.include_router(runs_router)
    app.include_router(projects_router)
    app.include_router(environments_router)
    app.include_router(platform_runs_router)
    app.include_router(artifacts_router)
    app.include_router(audit_router)
    app.include_router(flow_instances_router)
    return app


app = create_app()
