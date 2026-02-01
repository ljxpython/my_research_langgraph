from __future__ import annotations

import threading
import time

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from gateway.schemas.errors import ErrorBody, ErrorResponse
from gateway.utils.jwt_tokens import InvalidTokenError, decode_access_token


class _InMemoryFixedWindow:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, tuple[int, float]] = {}

    def incr(self, key: str, *, ttl_seconds: int) -> int:
        now = time.time()
        with self._lock:
            cur, exp = self._data.get(key, (0, now + ttl_seconds))
            if exp <= now:
                cur, exp = 0, now + ttl_seconds
            cur += 1
            self._data[key] = (cur, exp)
            return cur


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        enabled: bool,
        user_write_rpm: int,
        user_read_rpm: int,
        user_poll_rpm: int,
        redis_url: str | None = None,
    ) -> None:
        super().__init__(app)
        self._enabled = enabled
        self._limits = {
            "user.write": max(int(user_write_rpm), 0),
            "user.read": max(int(user_read_rpm), 0),
            "user.poll": max(int(user_poll_rpm), 0),
        }
        self._store = _InMemoryFixedWindow()
        self._redis = None
        if redis_url:
            try:
                import redis  # type: ignore

                self._redis = redis.Redis.from_url(redis_url)
            except Exception:
                self._redis = None

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._enabled:
            return await call_next(request)

        path = request.url.path
        if path == "/healthz" or path.startswith("/v1/auth/"):
            return await call_next(request)

        # Determine bucket.
        bucket = "user.write"
        if request.method.upper() == "GET":
            bucket = "user.read"
            if path.startswith("/v1/runs/") and path.endswith("/events"):
                bucket = "user.poll"

        limit = self._limits.get(bucket, 0)
        if limit <= 0:
            return await call_next(request)

        # Subject from Bearer token (no DB lookup).
        auth = request.headers.get("Authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return await call_next(request)

        token = auth.split(" ", 1)[1]
        try:
            claims = decode_access_token(token)
        except InvalidTokenError:
            return await call_next(request)

        now = int(time.time())
        window = now // 60
        key = f"rl:{claims.tenant_id}:{claims.sub}:{bucket}:{window}"

        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incr(key)
                pipe.expire(key, 120)
                count = int(pipe.execute()[0])
            except Exception:
                count = self._store.incr(key, ttl_seconds=120)
        else:
            count = self._store.incr(key, ttl_seconds=120)
        if count <= limit:
            return await call_next(request)

        retry_after = 60 - (now % 60)
        request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-Id")
        body = ErrorResponse(
            error=ErrorBody(
                code="RATE_LIMITED",
                message="Too many requests.",
                requestId=request_id,
                details={
                    "bucket": bucket,
                    "scope": "tenant+subject",
                    "tenantId": claims.tenant_id,
                    "retryAfterSeconds": retry_after,
                },
            )
        )

        return JSONResponse(
            status_code=429,
            content=body.model_dump(),
            headers={"Retry-After": str(retry_after), "X-Request-Id": request_id or ""},
        )
