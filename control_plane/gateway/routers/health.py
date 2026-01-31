from __future__ import annotations

from fastapi import APIRouter


router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz():
    return {"ok": True}
