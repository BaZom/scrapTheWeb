from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.limits import (
    PAGE_RENDER_REQUESTS,
    enforce_user_rate_limit,
)


class InMemoryRedis:
    def __init__(self) -> None:
        self.store: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def expire(self, key: str, seconds: int) -> bool:  # noqa: ARG002
        return True


async def test_rate_limit_allows_within_window() -> None:
    redis = InMemoryRedis()
    user_id = uuid4()
    for _ in range(3):
        await enforce_user_rate_limit(redis, user_id, PAGE_RENDER_REQUESTS, limit=3)


async def test_rate_limit_blocks_after_quota() -> None:
    redis = InMemoryRedis()
    user_id = uuid4()
    for _ in range(2):
        await enforce_user_rate_limit(redis, user_id, PAGE_RENDER_REQUESTS, limit=2)
    with pytest.raises(HTTPException) as exc:
        await enforce_user_rate_limit(redis, user_id, PAGE_RENDER_REQUESTS, limit=2)
    assert exc.value.status_code == 429


async def test_zero_limit_blocks_immediately() -> None:
    redis = InMemoryRedis()
    with pytest.raises(HTTPException):
        await enforce_user_rate_limit(redis, uuid4(), PAGE_RENDER_REQUESTS, limit=0)
