from __future__ import annotations

import time

from gateway.repos.users_repo import get_user_by_username
from gateway.schemas.auth import LoginResponse, MeResponse
from gateway.utils.jwt_tokens import decode_access_token, encode_access_token
from gateway.utils.passwords import verify_password


def login(db, *, tenant_id: str, username: str, password: str, expires_in: int = 86400) -> LoginResponse | None:
    user = get_user_by_username(db, tenant_id=tenant_id, username=username)
    if user is None:
        return None
    if user.status != "active":
        return None
    if not verify_password(password, user.password_hash):
        return None

    token = encode_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        username=user.username,
        is_admin=user.is_admin,
        expires_in=expires_in,
    )
    return LoginResponse(access_token=token, expires_in=expires_in)


def me_from_token(token: str) -> MeResponse:
    claims = decode_access_token(token)
    roles = ["admin"] if claims.is_admin else ["user"]
    scopes = ["*"] if claims.is_admin else []
    return MeResponse(
        userId=claims.sub,
        tenantId=claims.tenant_id,
        username=claims.username,
        roles=roles,
        scopes=scopes,
        issuedAt=int(claims.iat),
    )
