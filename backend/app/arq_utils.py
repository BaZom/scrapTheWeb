from urllib.parse import urlparse

from arq.connections import RedisSettings


def redis_settings_from_url(redis_url: str) -> RedisSettings:
    parsed = urlparse(redis_url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.removeprefix("/") or "0"),
        password=parsed.password,
        ssl=parsed.scheme == "rediss",
    )
