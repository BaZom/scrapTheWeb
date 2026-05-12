"""change events

Revision ID: 0004_change_events
Revises: 0003_recipes_runs
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_change_events"
down_revision: str | None = "0003_recipes_runs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "change_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("change_type", sa.String(length=32), nullable=False),
        sa.Column("record_key", sa.String(length=255), nullable=False),
        sa.Column("old_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["extraction_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_change_events_change_type"), "change_events", ["change_type"])
    op.create_index(op.f("ix_change_events_organization_id"), "change_events", ["organization_id"])
    op.create_index(op.f("ix_change_events_recipe_id"), "change_events", ["recipe_id"])
    op.create_index(op.f("ix_change_events_run_id"), "change_events", ["run_id"])
    op.create_index(
        "ix_change_events_recipe_id_created_at", "change_events", ["recipe_id", "created_at"]
    )
    op.create_index(
        "ix_change_events_run_id_change_type", "change_events", ["run_id", "change_type"]
    )


def downgrade() -> None:
    op.drop_index("ix_change_events_run_id_change_type", table_name="change_events")
    op.drop_index("ix_change_events_recipe_id_created_at", table_name="change_events")
    op.drop_index(op.f("ix_change_events_run_id"), table_name="change_events")
    op.drop_index(op.f("ix_change_events_recipe_id"), table_name="change_events")
    op.drop_index(op.f("ix_change_events_organization_id"), table_name="change_events")
    op.drop_index(op.f("ix_change_events_change_type"), table_name="change_events")
    op.drop_table("change_events")
