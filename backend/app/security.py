from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

import bcrypt
import jwt
from fastapi import HTTPException, status
from jwt import InvalidTokenError

from app.config import Settings

ACCESS_TOKEN_TYPE = "access"

API_KEY_PREFIX = "sk_"
API_KEY_DISPLAY_PREFIX_LENGTH = 12


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: UUID, settings: Settings) -> tuple[str, int]:
    expires_delta = timedelta(minutes=settings.jwt_access_token_minutes)
    expires_at = datetime.now(UTC) + expires_delta
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": datetime.now(UTC),
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str, settings: Settings) -> UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token"
        ) from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject"
        )

    try:
        return UUID(subject)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject"
        ) from exc


def create_refresh_token(settings: Settings) -> tuple[str, str, datetime]:
    token = token_urlsafe(48)
    return token, hash_refresh_token(token, settings), datetime.now(UTC) + timedelta(
        days=settings.refresh_token_days
    )


def hash_refresh_token(token: str, settings: Settings) -> str:
    return sha256(f"{settings.refresh_token_secret}:{token}".encode()).hexdigest()


def create_email_verification_token(settings: Settings) -> tuple[str, str, datetime]:
    token = token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=settings.email_verification_token_hours)
    return token, hash_verification_token(token, settings), expires_at


def hash_verification_token(token: str, settings: Settings) -> str:
    return sha256(f"{settings.refresh_token_secret}:verify:{token}".encode()).hexdigest()


def create_password_reset_token(settings: Settings) -> tuple[str, str, datetime]:
    token = token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.password_reset_token_minutes)
    return token, hash_password_reset_token(token, settings), expires_at


def hash_password_reset_token(token: str, settings: Settings) -> str:
    return sha256(f"{settings.refresh_token_secret}:reset:{token}".encode()).hexdigest()


def create_api_key(settings: Settings) -> tuple[str, str, str]:
    """Return (raw_key, prefix, key_hash). Raw key is shown once to the user."""
    raw = f"{API_KEY_PREFIX}{token_urlsafe(36)}"
    prefix = raw[:API_KEY_DISPLAY_PREFIX_LENGTH]
    return raw, prefix, hash_api_key(raw, settings)


def hash_api_key(raw_key: str, settings: Settings) -> str:
    return sha256(f"{settings.refresh_token_secret}:apikey:{raw_key}".encode()).hexdigest()
