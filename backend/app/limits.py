from datetime import UTC, datetime
from uuid import UUID, uuid4

import redis.asyncio as redis
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UsageCounter

PAGE_RENDER_REQUESTS = "page_render_requests"
RECIPE_RUN_REQUESTS = "recipe_run_requests"
EXPORT_REQUESTS = "export_requests"

RATE_LIMIT_WINDOW_SECONDS = 3600


def monthly_period_start(now: datetime | None = None) -> datetime:
    current = now or datetime.now(UTC)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def enforce_user_rate_limit(
    redis_client: redis.Redis,
    user_id: UUID,
    metric: str,
    limit: int,
) -> None:
    if limit < 1:
        raise _limit_error(f"{_metric_label(metric)} rate limit exceeded")

    window = int(datetime.now(UTC).timestamp() // RATE_LIMIT_WINDOW_SECONDS)
    key = f"rate_limit:{metric}:{user_id}:{window}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, RATE_LIMIT_WINDOW_SECONDS)
    if int(count) > limit:
        raise _limit_error(f"{_metric_label(metric)} rate limit exceeded")


async def enforce_org_quota(
    session: AsyncSession,
    organization_id: UUID,
    metric: str,
    quota: int,
) -> None:
    if quota < 1:
        raise _limit_error(f"{_metric_label(metric)} organization quota exceeded")

    period_start = monthly_period_start()
    result = await session.execute(
        select(UsageCounter.value).where(
            UsageCounter.organization_id == organization_id,
            UsageCounter.metric == metric,
            UsageCounter.period_start == period_start,
        )
    )
    current_value = result.scalar_one_or_none() or 0
    if current_value >= quota:
        raise _limit_error(f"{_metric_label(metric)} organization quota exceeded")


async def increment_usage_counter(
    session: AsyncSession,
    organization_id: UUID,
    metric: str,
    amount: int = 1,
) -> None:
    period_start = monthly_period_start()
    statement = (
        insert(UsageCounter)
        .values(
            id=uuid4(),
            organization_id=organization_id,
            metric=metric,
            period_start=period_start,
            value=amount,
        )
        .on_conflict_do_update(
            constraint="uq_usage_counters_org_metric_period",
            set_={"value": UsageCounter.value + amount},
        )
    )
    await session.execute(statement)


def _limit_error(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)


def _metric_label(metric: str) -> str:
    labels = {
        PAGE_RENDER_REQUESTS: "Page render",
        RECIPE_RUN_REQUESTS: "Recipe run",
        EXPORT_REQUESTS: "Export",
    }
    return labels.get(metric, "Request")
