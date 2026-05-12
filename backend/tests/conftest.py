"""Shared pytest fixtures.

Tests in this suite are pure unit tests: no Postgres, Redis, or S3 is required.
Anything that needs the database is covered by smoke scripts that run against
the live docker compose stack.
"""

import os

# Provide harmless defaults so importing `app.config` does not require a
# real environment when the tests collect modules.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("REFRESH_TOKEN_SECRET", "test-refresh-secret")
