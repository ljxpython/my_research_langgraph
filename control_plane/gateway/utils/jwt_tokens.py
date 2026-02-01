from __future__ import annotations

import time
from dataclasses import dataclass

import jwt

from gateway.settings import settings


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    tenant_id: str
    username: str
    is_admin: bool
    iat: int
    exp: int


class InvalidTokenError(Exception):
    """Raised when a JWT cannot be decoded/validated."""


def encode_access_token(*, user_id: str, tenant_id: str, username: str, is_admin: bool, expires_in: int = 86400) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "is_admin": bool(is_admin),
        "iat": now,
        "exp": now + int(expires_in),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> TokenClaims:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return TokenClaims(
            sub=str(payload["sub"]),
            tenant_id=str(payload["tenant_id"]),
            username=str(payload.get("username", "")),
            is_admin=bool(payload.get("is_admin", False)),
            iat=int(payload.get("iat", 0)),
            exp=int(payload.get("exp", 0)),
        )
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as e:
        raise InvalidTokenError("invalid access token") from e
