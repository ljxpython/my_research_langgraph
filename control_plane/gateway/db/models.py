"""SQLAlchemy ORM models (Control Plane metadata).

Phase-1 scope:
- tenants/users (simplified login)
- agents (agent registry)
- threads/runs (busy lock, cancel idempotency)
- audit_events (append-only)

We do NOT store messages/state bodies here.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
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


# ==================== Flow workbench（flowInstance -> chat threads mapping） ====================


class FlowChatThread(Base):
    """Bind a flow instance section to a chat thread.

    Notes:
    - A flow instance (flow_instance_id) is a product-level concept; it is not a DB table yet.
    - We store only the mapping metadata here. Messages/state remain in Execution Plane.
    """

    __tablename__ = "flow_chat_threads"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)

    flow_instance_id: Mapped[str] = mapped_column(String(128), nullable=False)
    section_key: Mapped[str] = mapped_column(String(64), nullable=False)

    agent_id: Mapped[str] = mapped_column(String(128), ForeignKey("agents.agent_id"), nullable=False)
    thread_id: Mapped[str] = mapped_column(String(64), ForeignKey("threads.thread_id"), nullable=False)

    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index(
            "ux_flow_chat_threads_tenant_flow_section",
            "tenant_id",
            "flow_instance_id",
            "section_key",
            unique=True,
        ),
        Index(
            "ix_flow_chat_threads_tenant_flow",
            "tenant_id",
            "flow_instance_id",
        ),
        Index(
            "ix_flow_chat_threads_tenant_thread",
            "tenant_id",
            "thread_id",
        ),
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


# ==================== Platform（projects/environments/runs/artifacts） ====================


class Project(Base):
    __tablename__ = "projects"

    project_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")

    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_projects_tenant_created", "tenant_id", "created_at"),
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.project_id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)

    role: Mapped[str] = mapped_column(String(32), nullable=False)  # owner/maintainer/viewer
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_project_members_tenant_project", "tenant_id", "project_id"),
    )


class Environment(Base):
    __tablename__ = "environments"

    environment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.project_id"), index=True)

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="generic")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")

    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    health_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Concurrency lock slot (single active run per environment).
    active_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    lock_acquired_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lock_expires_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_env_tenant_project_name", "tenant_id", "project_id", "name"),
    )


class PlatformRun(Base):
    __tablename__ = "platform_runs"

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.project_id"), index=True)
    environment_id: Mapped[str] = mapped_column(String(64), ForeignKey("environments.environment_id"), index=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False)
    runner: Mapped[str] = mapped_column(String(32), nullable=False, default="dummy")

    client_run_id: Mapped[str] = mapped_column(String(128), nullable=False)
    params_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    triggered_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cancel_requested_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    summary_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Monotonic event sequence allocation.
    next_event_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_platform_runs_tenant_project_created", "tenant_id", "project_id", "created_at"),
        Index("ix_platform_runs_project_client", "project_id", "client_run_id", unique=True),
        Index("ix_platform_runs_env_status", "environment_id", "status"),
    )


class PlatformRunEvent(Base):
    __tablename__ = "platform_run_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.project_id"), index=True)
    run_id: Mapped[str] = mapped_column(String(64), ForeignKey("platform_runs.run_id"), index=True)

    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    ts: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_platform_run_events_run_seq", "run_id", "seq", unique=True),
        Index("ix_platform_run_events_tenant_run_seq", "tenant_id", "run_id", "seq"),
    )


class Artifact(Base):
    __tablename__ = "artifacts"

    artifact_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), ForeignKey("tenants.id"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.project_id"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("platform_runs.run_id"), nullable=True, index=True)

    kind: Mapped[str] = mapped_column(String(64), nullable=False, default="other")
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)

    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)

    __table_args__ = (
        Index("ix_artifacts_tenant_project_created", "tenant_id", "project_id", "created_at"),
        Index("ix_artifacts_run", "run_id", "created_at"),
    )
