import asyncio
import sys
import time
from pathlib import Path

from app.config import get_settings
from app.resources import make_redis

HEARTBEAT_PATH = Path("/tmp/scraptheweb-worker-alive")


async def check() -> int:
    if HEARTBEAT_PATH.exists():
        heartbeat_age_seconds = time.time() - float(HEARTBEAT_PATH.read_text(encoding="utf-8"))
        if heartbeat_age_seconds > 3600:
            return 1

    redis_client = make_redis(get_settings())
    try:
        await redis_client.ping()
    finally:
        await redis_client.aclose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(check()))
