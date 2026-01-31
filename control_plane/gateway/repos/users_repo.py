from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import User


def get_user_by_username(db, *, tenant_id: str, username: str) -> User | None:
    stmt = select(User).where(User.tenant_id == tenant_id, User.username == username)
    return db.execute(stmt).scalar_one_or_none()


def get_user_by_id(db, *, user_id: str) -> User | None:
    stmt = select(User).where(User.id == user_id)
    return db.execute(stmt).scalar_one_or_none()
