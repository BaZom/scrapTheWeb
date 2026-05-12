from uuid import uuid4

import pytest

from app.config import Settings
from app.security import (
    API_KEY_PREFIX,
    create_access_token,
    create_api_key,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    decode_access_token,
    hash_api_key,
    hash_password,
    hash_password_reset_token,
    hash_refresh_token,
    hash_verification_token,
    verify_password,
)


def _settings() -> Settings:
    return Settings(
        DATABASE_URL="postgresql+asyncpg://test:test@localhost/test",
        REDIS_URL="redis://localhost/0",
        S3_ENDPOINT_URL="http://localhost:9000",
        S3_ACCESS_KEY_ID="x",
        S3_SECRET_ACCESS_KEY="x",
        JWT_SECRET="jwt-secret",
        REFRESH_TOKEN_SECRET="refresh-secret",
    )  # type: ignore[call-arg]


def test_password_hash_roundtrip() -> None:
    digest = hash_password("hunter2!")
    assert verify_password("hunter2!", digest)
    assert not verify_password("wrong-password", digest)


def test_access_token_roundtrip() -> None:
    settings = _settings()
    user_id = uuid4()
    token, expires_in = create_access_token(user_id, settings)
    assert expires_in > 0
    assert decode_access_token(token, settings) == user_id


def test_refresh_token_hash_is_stable_and_secret_dependent() -> None:
    settings_a = _settings()
    settings_b = Settings(
        DATABASE_URL="postgresql+asyncpg://test:test@localhost/test",
        REDIS_URL="redis://localhost/0",
        S3_ENDPOINT_URL="http://localhost:9000",
        S3_ACCESS_KEY_ID="x",
        S3_SECRET_ACCESS_KEY="x",
        JWT_SECRET="jwt-secret",
        REFRESH_TOKEN_SECRET="other-refresh-secret",
    )  # type: ignore[call-arg]
    token, token_hash, _ = create_refresh_token(settings_a)
    assert hash_refresh_token(token, settings_a) == token_hash
    assert hash_refresh_token(token, settings_b) != token_hash


def test_email_verification_token_distinct_from_password_reset_hashing() -> None:
    settings = _settings()
    same_value = "same-token"
    assert hash_verification_token(same_value, settings) != hash_password_reset_token(
        same_value, settings
    )


def test_create_email_verification_token_has_future_expiry() -> None:
    settings = _settings()
    token, token_hash, expires_at = create_email_verification_token(settings)
    assert token and token_hash and expires_at
    assert hash_verification_token(token, settings) == token_hash


def test_create_password_reset_token_has_future_expiry() -> None:
    settings = _settings()
    token, token_hash, expires_at = create_password_reset_token(settings)
    assert token and token_hash and expires_at
    assert hash_password_reset_token(token, settings) == token_hash


def test_api_key_has_prefix_and_stable_hash() -> None:
    settings = _settings()
    raw, prefix, key_hash = create_api_key(settings)
    assert raw.startswith(API_KEY_PREFIX)
    assert raw.startswith(prefix)
    assert hash_api_key(raw, settings) == key_hash
    assert hash_api_key(raw + "x", settings) != key_hash


@pytest.mark.parametrize("bad_token", ["", "not-a-jwt", "a.b.c"])
def test_decode_access_token_rejects_invalid(bad_token: str) -> None:
    from fastapi import HTTPException

    settings = _settings()
    with pytest.raises(HTTPException):
        decode_access_token(bad_token, settings)
