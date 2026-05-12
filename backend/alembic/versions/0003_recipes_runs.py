"""recipes and extraction runs

Revision ID: 0003_recipes_runs
Revises: 0002_page_sessions
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_recipes_runs"
down_revision: str | None = "0002_page_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "websites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "domain", name="uq_websites_org_domain"),
    )
    op.create_index(op.f("ix_websites_organization_id"), "websites", ["organization_id"])

    op.create_table(
        "recipes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("website_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("url_pattern", sa.String(length=2048), nullable=False),
        sa.Column("page_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recipes_organization_id"), "recipes", ["organization_id"])
    op.create_index(op.f("ix_recipes_status"), "recipes", ["status"])
    op.create_index("ix_recipes_organization_id_status", "recipes", ["organization_id", "status"])

    op.create_table(
        "recipe_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("validation_report", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("recipe_id", "version", name="uq_recipe_versions_recipe_version"),
    )
    op.create_index(
        op.f("ix_recipe_versions_organization_id"), "recipe_versions", ["organization_id"]
    )
    op.create_index(op.f("ix_recipe_versions_recipe_id"), "recipe_versions", ["recipe_id"])

    op.create_table(
        "extraction_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("total_records", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(length=1024), nullable=True),
        sa.Column("job_id", sa.String(length=160), nullable=True),
        sa.Column("triggered_by_user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_extraction_runs_organization_id"), "extraction_runs", ["organization_id"])
    op.create_index(op.f("ix_extraction_runs_recipe_id"), "extraction_runs", ["recipe_id"])
    op.create_index("ix_extraction_runs_recipe_started", "extraction_runs", ["recipe_id", "started_at"])
    op.create_index(op.f("ix_extraction_runs_status"), "extraction_runs", ["status"])

    op.create_table(
        "extracted_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("record_key", sa.String(length=255), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
    op.create_index(op.f("ix_extracted_records_organization_id"), "extracted_records", ["organization_id"])
    op.create_index(op.f("ix_extracted_records_recipe_id"), "extracted_records", ["recipe_id"])
    op.create_index(op.f("ix_extracted_records_run_id"), "extracted_records", ["run_id"])
    op.create_index(
        "ix_extracted_records_run_id_record_key", "extracted_records", ["run_id", "record_key"]
    )


def downgrade() -> None:
    op.drop_index("ix_extracted_records_run_id_record_key", table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_run_id"), table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_recipe_id"), table_name="extracted_records")
    op.drop_index(op.f("ix_extracted_records_organization_id"), table_name="extracted_records")
    op.drop_table("extracted_records")
    op.drop_index(op.f("ix_extraction_runs_status"), table_name="extraction_runs")
    op.drop_index("ix_extraction_runs_recipe_started", table_name="extraction_runs")
    op.drop_index(op.f("ix_extraction_runs_recipe_id"), table_name="extraction_runs")
    op.drop_index(op.f("ix_extraction_runs_organization_id"), table_name="extraction_runs")
    op.drop_table("extraction_runs")
    op.drop_index(op.f("ix_recipe_versions_recipe_id"), table_name="recipe_versions")
    op.drop_index(op.f("ix_recipe_versions_organization_id"), table_name="recipe_versions")
    op.drop_table("recipe_versions")
    op.drop_index("ix_recipes_organization_id_status", table_name="recipes")
    op.drop_index(op.f("ix_recipes_status"), table_name="recipes")
    op.drop_index(op.f("ix_recipes_organization_id"), table_name="recipes")
    op.drop_table("recipes")
    op.drop_index(op.f("ix_websites_organization_id"), table_name="websites")
    op.drop_table("websites")
