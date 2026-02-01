"""Auth dependency stubs.

Phase-1 simplified login will live in services/auth_service.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from gateway.deps.db import get_db
from gateway.db.engine import SessionLocal
from gateway.repos.users_repo import get_user_by_id
from gateway.utils.jwt_tokens import InvalidTokenError, decode_access_token


@dataclass(frozen=True)
class UserContext:
    user_id: str
    tenant_id: str
    username: str
    is_admin: bool
    issued_at: int


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> UserContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_access_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    user = get_user_by_id(db, user_id=claims.sub)
    if user is None:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    # Phase A 决策：禁用用户不强制立即使已签发 token 失效（窗口期最长 token TTL）。
    # 因此这里不按 user.status 做强制拦截；只禁止其重新登录签发新 token（见 auth_service.login）。
    if user.tenant_id != claims.tenant_id:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    return UserContext(
        user_id=user.id,
        tenant_id=user.tenant_id,
        username=user.username,
        is_admin=bool(user.is_admin),
        issued_at=int(claims.iat),
    )


CurrentUser = Depends(get_current_user)


def get_current_user_streaming(
    authorization: Optional[str] = Header(default=None),
) -> UserContext:
    """Auth dependency for streaming endpoints.

    StreamingResponse keeps request-scoped yield dependencies alive until the
    stream completes. To avoid holding DB connections/transactions open, we use
    a short-lived session here.
    """

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_access_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    db = SessionLocal()
    try:
        user = get_user_by_id(db, user_id=claims.sub)
        if user is None or user.status != "active":
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        if user.tenant_id != claims.tenant_id:
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        return UserContext(
            user_id=user.id,
            tenant_id=user.tenant_id,
            username=user.username,
            is_admin=bool(user.is_admin),
            issued_at=int(claims.iat),
        )
    finally:
        db.close()


StreamingCurrentUser = Depends(get_current_user_streaming)
