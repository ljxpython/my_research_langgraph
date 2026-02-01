"""platform phase a

Revision ID: 0002_platform_phase_a
Revises: 0001_init
Create Date: 2026-01-31
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_platform_phase_a"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("project_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_projects_tenant_id", "projects", ["tenant_id"], unique=False)
    op.create_index("ix_projects_created_by", "projects", ["created_by"], unique=False)
    op.create_index("ix_projects_tenant_created", "projects", ["tenant_id", "created_at"], unique=False)

    op.create_table(
        "project_members",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.project_id"), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_project_members_tenant_id", "project_members", ["tenant_id"], unique=False)
    op.create_index("ix_project_members_tenant_project", "project_members", ["tenant_id", "project_id"], unique=False)

    op.create_table(
        "environments",
        sa.Column("environment_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.project_id"), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False, server_default="generic"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column(
            "config_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("health_status", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("active_run_id", sa.String(length=64), nullable=True),
        sa.Column("lock_acquired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lock_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_environments_tenant_id", "environments", ["tenant_id"], unique=False)
    op.create_index("ix_environments_project_id", "environments", ["project_id"], unique=False)
    op.create_index("ix_environments_active_run_id", "environments", ["active_run_id"], unique=False)
    op.create_index("ix_environments_lock_expires_at", "environments", ["lock_expires_at"], unique=False)
    op.create_index(
        "ix_env_tenant_project_name",
        "environments",
        ["tenant_id", "project_id", "name"],
        unique=False,
    )

    op.create_table(
        "platform_runs",
        sa.Column("run_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.project_id"), nullable=False),
        sa.Column(
            "environment_id",
            sa.String(length=64),
            sa.ForeignKey("environments.environment_id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("runner", sa.String(length=32), nullable=False, server_default="dummy"),
        sa.Column("client_run_id", sa.String(length=128), nullable=False),
        sa.Column(
            "params_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("triggered_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "summary_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("next_event_seq", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_platform_runs_tenant_id", "platform_runs", ["tenant_id"], unique=False)
    op.create_index("ix_platform_runs_project_id", "platform_runs", ["project_id"], unique=False)
    op.create_index("ix_platform_runs_environment_id", "platform_runs", ["environment_id"], unique=False)
    op.create_index("ix_platform_runs_request_id", "platform_runs", ["request_id"], unique=False)
    op.create_index("ix_platform_runs_triggered_by", "platform_runs", ["triggered_by"], unique=False)
    op.create_index(
        "ix_platform_runs_tenant_project_created",
        "platform_runs",
        ["tenant_id", "project_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_platform_runs_project_client",
        "platform_runs",
        ["project_id", "client_run_id"],
        unique=True,
    )
    op.create_index(
        "ix_platform_runs_env_status",
        "platform_runs",
        ["environment_id", "status"],
        unique=False,
    )

    op.create_table(
        "platform_run_events",
        sa.Column("event_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.project_id"), nullable=False),
        sa.Column("run_id", sa.String(length=64), sa.ForeignKey("platform_runs.run_id"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column(
            "payload_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_index("ix_platform_run_events_tenant_id", "platform_run_events", ["tenant_id"], unique=False)
    op.create_index("ix_platform_run_events_project_id", "platform_run_events", ["project_id"], unique=False)
    op.create_index("ix_platform_run_events_run_id", "platform_run_events", ["run_id"], unique=False)
    op.create_index(
        "ix_platform_run_events_run_seq",
        "platform_run_events",
        ["run_id", "seq"],
        unique=True,
    )
    op.create_index(
        "ix_platform_run_events_tenant_run_seq",
        "platform_run_events",
        ["tenant_id", "run_id", "seq"],
        unique=False,
    )

    op.create_table(
        "artifacts",
        sa.Column("artifact_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.project_id"), nullable=False),
        sa.Column("run_id", sa.String(length=64), sa.ForeignKey("platform_runs.run_id"), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False, server_default="other"),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("created_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_artifacts_tenant_id", "artifacts", ["tenant_id"], unique=False)
    op.create_index("ix_artifacts_project_id", "artifacts", ["project_id"], unique=False)
    op.create_index("ix_artifacts_run_id", "artifacts", ["run_id"], unique=False)
    op.create_index("ix_artifacts_created_by", "artifacts", ["created_by"], unique=False)
    op.create_index(
        "ix_artifacts_tenant_project_created",
        "artifacts",
        ["tenant_id", "project_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_artifacts_run",
        "artifacts",
        ["run_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("artifacts")
    op.drop_table("platform_run_events")
    op.drop_table("platform_runs")
    op.drop_table("environments")
    op.drop_table("project_members")
    op.drop_table("projects")
