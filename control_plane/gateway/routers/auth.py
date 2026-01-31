from __future__ import annotations

from fastapi import APIRouter, HTTPException

import os

from sqlalchemy import select

from gateway.db.engine import session_scope
from gateway.db.models import Tenant
from gateway.schemas.auth import LoginRequest, LoginResponse, MeResponse
from gateway.schemas.errors import ErrorResponse
from gateway.deps.auth import CurrentUser, UserContext
from gateway.services.auth_service import login as login_service


router = APIRouter(prefix="/v1", tags=["auth"])
@router.post("/auth/login", response_model=LoginResponse, responses={401: {"model": ErrorResponse}})
def login(req: LoginRequest):
    with session_scope() as db:
        tenant_name = os.getenv("BOOTSTRAP_TENANT_NAME", "default")
        tenant = db.execute(select(Tenant).where(Tenant.name == tenant_name)).scalar_one_or_none()
        if tenant is None:
            raise HTTPException(status_code=401, detail="UNAUTHORIZED")
        resp = login_service(
            db,
            tenant_id=tenant.id,
            username=req.username,
            password=req.password,
        )

    if resp is None:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    return resp


@router.get("/me", response_model=MeResponse, responses={401: {"model": ErrorResponse}})
def me(
    user: UserContext = CurrentUser,
):
    roles = ["admin"] if user.is_admin else ["user"]
    scopes = ["*"] if user.is_admin else []
    return MeResponse(
        userId=user.user_id,
        tenantId=user.tenant_id,
        username=user.username,
        roles=roles,
        scopes=scopes,
        issuedAt=int(user.issued_at),
    )
