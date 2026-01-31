"""Authorization helpers (Phase-1: minimal RBAC)."""

from __future__ import annotations

from fastapi import HTTPException

from gateway.deps.auth import UserContext


def require_admin(user: UserContext) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="FORBIDDEN")
