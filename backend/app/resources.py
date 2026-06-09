import asyncio
from collections.abc import AsyncIterator
from typing import Any, cast

import boto3
import redis.asyncio as redis
import structlog
from arq import create_pool
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.sql import text

from app.arq_utils import redis_settings_from_url
from app.config import Settings
from app.page_html_cache import PageHtmlCache

logger = structlog.get_logger(__name__)


def make_page_html_cache(settings: Settings) -> PageHtmlCache | None:
    if not settings.page_html_cache_enabled:
        return None
    return PageHtmlCache(
        max_entries=settings.page_html_cache_max_entries,
        max_total_bytes=settings.page_html_cache_max_bytes,
        max_item_bytes=settings.page_html_cache_max_item_bytes,
        # Resolved in Settings._default_html_cache_ttl, so it's never None here.
        ttl_seconds=settings.page_html_cache_ttl_seconds or settings.page_session_ttl_seconds,
    )


def make_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(settings.database_url, pool_pre_ping=True)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker[AsyncSession](engine, expire_on_commit=False)


def make_redis(settings: Settings) -> redis.Redis:
    return cast(
        redis.Redis,
        redis.from_url(  # type: ignore[no-untyped-call]
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        ),
    )


def make_s3_client(settings: Settings) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}),
    )


async def ensure_bucket(settings: Settings) -> None:
    client = make_s3_client(settings)

    def _ensure() -> None:
        try:
            client.head_bucket(Bucket=settings.s3_bucket)
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status not in {404, 403}:
                raise
            client.create_bucket(Bucket=settings.s3_bucket)

    await asyncio.to_thread(_ensure)


async def check_postgres(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await connection.execute(text("select 1"))


async def check_redis(redis_client: redis.Redis) -> None:
    await redis_client.ping()


async def check_s3(settings: Settings) -> None:
    await ensure_bucket(settings)


async def lifespan_resources(app: FastAPI, settings: Settings) -> AsyncIterator[None]:
    app.state.engine = make_engine(settings)
    app.state.sessionmaker = make_sessionmaker(app.state.engine)
    app.state.redis = make_redis(settings)
    app.state.arq_pool = await create_pool(redis_settings_from_url(settings.redis_url))
    # Best-effort per-replica HTML cache for the preview loop (ADR 0008). None when
    # disabled, in which case the loader reads from S3 exactly as before.
    app.state.page_html_cache = make_page_html_cache(settings)
    await ensure_bucket(settings)
    logger.info("resources_ready")
    try:
        yield
    finally:
        await app.state.arq_pool.aclose()
        await app.state.redis.aclose()
        await app.state.engine.dispose()
        logger.info("resources_closed")
