"""usage counters

Revision ID: 0005_usage_counters
Revises: 0004_change_events
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_usage_counters"
down_revision: str | None = "0004_change_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("metric", sa.String(length=80), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "metric",
            "period_start",
            name="uq_usage_counters_org_metric_period",
        ),
    )
    op.create_index(op.f("ix_usage_counters_organization_id"), "usage_counters", ["organization_id"])
    op.create_index(
        "ix_usage_counters_org_metric_period",
        "usage_counters",
        ["organization_id", "metric", "period_start"],
    )


def downgrade() -> None:
    op.drop_index("ix_usage_counters_org_metric_period", table_name="usage_counters")
    op.drop_index(op.f("ix_usage_counters_organization_id"), table_name="usage_counters")
    op.drop_table("usage_counters")
