"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from gateway.middleware.cors import add_cors
from gateway.middleware.request_id import RequestIdMiddleware
from gateway.routers.health import router as health_router
from gateway.routers.auth import router as auth_router
from gateway.routers.agents import router as agents_router
from gateway.routers.threads import router as threads_router
from gateway.routers.runs import router as runs_router

from gateway.db.engine import session_scope
from gateway.services.bootstrap_service import ensure_seed_data
from gateway.schemas.errors import ErrorBody, ErrorResponse


def create_app() -> FastAPI:
    app = FastAPI(title="Control Plane", version="0.1.0")

    # CORS is required because we run frontend and CP cross-origin.
    add_cors(app)

    # Ensure every request has a request_id for logs/audit.
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

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(agents_router)
    app.include_router(threads_router)
    app.include_router(runs_router)
    return app


app = create_app()
