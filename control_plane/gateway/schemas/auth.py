from __future__ import annotations

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Phase A 冻结：24h
    expires_in: int = 86400


class MeResponse(BaseModel):
    userId: str
    tenantId: str
    username: str
    roles: list[str]
    scopes: list[str]
    issuedAt: int
