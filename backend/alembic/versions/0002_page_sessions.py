"""page sessions

Revision ID: 0002_page_sessions
Revises: 0001_auth_tenant_shell
Create Date: 2026-05-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_page_sessions"
down_revision: str | None = "0001_auth_tenant_shell"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "page_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("screenshot_key", sa.String(length=512), nullable=True),
        sa.Column("html_key", sa.String(length=512), nullable=True),
        sa.Column("error_message", sa.String(length=1024), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_page_sessions_organization_id"),
        "page_sessions",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_page_sessions_status"), "page_sessions", ["status"], unique=False)
    op.create_index(op.f("ix_page_sessions_user_id"), "page_sessions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_page_sessions_user_id"), table_name="page_sessions")
    op.drop_index(op.f("ix_page_sessions_status"), table_name="page_sessions")
    op.drop_index(op.f("ix_page_sessions_organization_id"), table_name="page_sessions")
    op.drop_table("page_sessions")
