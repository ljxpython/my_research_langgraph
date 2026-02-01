from __future__ import annotations

from fastapi import HTTPException

from gateway.deps.auth import UserContext
from gateway.repos.project_members_repo import get_project_member


_ROLE_ORDER: dict[str, int] = {
    "viewer": 1,
    "maintainer": 2,
    "owner": 3,
}


def _role_rank(role: str) -> int:
    return _ROLE_ORDER.get(role.strip().lower(), 0)


def require_project_role(
    db,
    *,
    user: UserContext,
    project_id: str,
    min_role: str,
    allow_admin_read: bool = False,
) -> str:
    """Require user has at least `min_role` in this project.

    allow_admin_read:
      - If True, tenant admin may pass with role='viewer' for read-only endpoints.
      - We do NOT grant admin implicit write permissions.
    """

    if allow_admin_read and user.is_admin:
        # Admin cross-project read.
        return "viewer"

    m = get_project_member(db, tenant_id=user.tenant_id, project_id=project_id, user_id=user.user_id)
    if m is None:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    if _role_rank(m.role) < _role_rank(min_role):
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    return m.role
