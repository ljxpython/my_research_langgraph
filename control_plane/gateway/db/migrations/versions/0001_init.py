"""init control plane schema

Revision ID: 0001_init
Revises:
Create Date: 2026-01-31
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"], unique=False)
    op.create_index("ix_users_tenant_username", "users", ["tenant_id", "username"], unique=True)

    op.create_table(
        "agents",
        sa.Column("agent_id", sa.String(length=128), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("display_name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("execution_target_id", sa.String(length=64), nullable=False, server_default="local-dev"),
        sa.Column("graph_id", sa.String(length=128), nullable=False),
        sa.Column("assistant_id", sa.String(length=128), nullable=True),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_agents_tenant_id", "agents", ["tenant_id"], unique=False)
    op.create_index("ix_agents_tenant_agent", "agents", ["tenant_id", "agent_id"], unique=True)
    op.create_index("ix_agents_tenant_status", "agents", ["tenant_id", "status"], unique=False)

    op.create_table(
        "threads",
        sa.Column("thread_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("created_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("agent_id", sa.String(length=128), sa.ForeignKey("agents.agent_id"), nullable=False),
        sa.Column("execution_target_id", sa.String(length=64), nullable=False),
        sa.Column("graph_id", sa.String(length=128), nullable=False),
        sa.Column("assistant_id", sa.String(length=128), nullable=True),
        sa.Column("active_run_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_threads_tenant_id", "threads", ["tenant_id"], unique=False)
    op.create_index("ix_threads_created_by", "threads", ["created_by"], unique=False)
    op.create_index("ix_threads_agent_id", "threads", ["agent_id"], unique=False)
    op.create_index("ix_threads_active_run_id", "threads", ["active_run_id"], unique=False)
    op.create_index(
        "ix_threads_tenant_creator_activity",
        "threads",
        ["tenant_id", "created_by", "last_activity_at"],
        unique=False,
    )
    op.create_index(
        "ix_threads_tenant_agent_activity",
        "threads",
        ["tenant_id", "agent_id", "last_activity_at"],
        unique=False,
    )

    op.create_table(
        "runs",
        sa.Column("run_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("thread_id", sa.String(length=64), sa.ForeignKey("threads.thread_id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("execution_run_id", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_runs_tenant_id", "runs", ["tenant_id"], unique=False)
    op.create_index("ix_runs_thread_id", "runs", ["thread_id"], unique=False)
    op.create_index("ix_runs_request_id", "runs", ["request_id"], unique=False)
    op.create_index("ix_runs_tenant_thread_started", "runs", ["tenant_id", "thread_id", "started_at"], unique=False)

    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("actor_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("details_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_audit_events_tenant_id", "audit_events", ["tenant_id"], unique=False)
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"], unique=False)
    op.create_index("ix_audit_events_request_id", "audit_events", ["request_id"], unique=False)
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"], unique=False)
    op.create_index(
        "ix_audit_resource",
        "audit_events",
        ["resource_type", "resource_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_audit_tenant_created",
        "audit_events",
        ["tenant_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("runs")
    op.drop_table("threads")
    op.drop_table("agents")
    op.drop_table("users")
    op.drop_table("tenants")
