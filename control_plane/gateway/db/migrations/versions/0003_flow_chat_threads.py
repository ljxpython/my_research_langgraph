"""flow chat threads mapping

Revision ID: 0003_flow_chat_threads
Revises: 0002_platform_phase_a
Create Date: 2026-02-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_flow_chat_threads"
down_revision = "0002_platform_phase_a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "flow_chat_threads",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("flow_instance_id", sa.String(length=128), nullable=False),
        sa.Column("section_key", sa.String(length=64), nullable=False),
        sa.Column("agent_id", sa.String(length=128), sa.ForeignKey("agents.agent_id"), nullable=False),
        sa.Column("thread_id", sa.String(length=64), sa.ForeignKey("threads.thread_id"), nullable=False),
        sa.Column("created_by", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_index("ix_flow_chat_threads_tenant_id", "flow_chat_threads", ["tenant_id"], unique=False)
    op.create_index("ix_flow_chat_threads_created_by", "flow_chat_threads", ["created_by"], unique=False)
    op.create_index(
        "ux_flow_chat_threads_tenant_flow_section",
        "flow_chat_threads",
        ["tenant_id", "flow_instance_id", "section_key"],
        unique=True,
    )
    op.create_index(
        "ix_flow_chat_threads_tenant_flow",
        "flow_chat_threads",
        ["tenant_id", "flow_instance_id"],
        unique=False,
    )
    op.create_index(
        "ix_flow_chat_threads_tenant_thread",
        "flow_chat_threads",
        ["tenant_id", "thread_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("flow_chat_threads")
