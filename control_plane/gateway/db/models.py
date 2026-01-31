"""SQLAlchemy ORM models (Control Plane metadata).

Phase-1 scope:
- tenants/users (simplified login)
- agents (agent registry)
- threads/runs (busy lock, cancel idempotency)
- audit_events (append-only)

We do NOT store messages/state bodies here.
"""

from __future__ import annotations

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    username: Mapped[str] = mapped_column(String(128), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_users_tenant_username", "tenant_id", "username", unique=True),
    )


class Agent(Base):
    __tablename__ = "agents"

    agent_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")

    # Execution routing metadata.
    execution_target_id: Mapped[str] = mapped_column(String(64), nullable=False, default="local-dev")
    graph_id: Mapped[str] = mapped_column(String(128), nullable=False)
    assistant_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_agents_tenant_agent", "tenant_id", "agent_id", unique=True),
        Index("ix_agents_tenant_status", "tenant_id", "status"),
    )


class Thread(Base):
    __tablename__ = "threads"

    thread_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)

    agent_id: Mapped[str] = mapped_column(String(128), ForeignKey("agents.agent_id"), index=True)
    execution_target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    graph_id: Mapped[str] = mapped_column(String(128), nullable=False)
    assistant_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Busy lock slot (single active run per thread).
    active_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_activity_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_threads_tenant_creator_activity", "tenant_id", "created_by", "last_activity_at"),
        Index("ix_threads_tenant_agent_activity", "tenant_id", "agent_id", "last_activity_at"),
    )


class Run(Base):
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    thread_id: Mapped[str] = mapped_column(String(64), ForeignKey("threads.thread_id"), index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(64), ForeignKey("users.id"), nullable=True)

    started_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        Index("ix_runs_tenant_thread_started", "tenant_id", "thread_id", "started_at"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    actor_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)

    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(128), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    details_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_audit_resource", "resource_type", "resource_id", "created_at"),
        Index("ix_audit_tenant_created", "tenant_id", "created_at"),
    )
