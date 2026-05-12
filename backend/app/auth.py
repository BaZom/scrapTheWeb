from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.deps import current_user, get_session, require_org_member
from app.models import (
    ApiKey,
    EmailVerificationToken,
    Membership,
    Organization,
    PasswordResetToken,
    RefreshToken,
    User,
)
from app.security import (
    create_access_token,
    create_api_key,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    hash_password,
    hash_password_reset_token,
    hash_refresh_token,
    hash_verification_token,
    verify_password,
)

logger = structlog.get_logger(__name__)
router = APIRouter()


class AuthCredentials(BaseModel):
    model_config = ConfigDict(strict=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    refresh_token: str = Field(min_length=32)


class UserResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    email: str
    email_verified: bool = False


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    name: str
    role: str


class AuthResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
    organization: OrganizationResponse


class DashboardResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    user: UserResponse
    organizations: list[OrganizationResponse]


class StatusResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    status: str


class EmailRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    email: EmailStr


class VerifyEmailRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    token: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    token: str = Field(min_length=8, max_length=128)
    password: str = Field(min_length=8, max_length=256)


class ApiKeyCreateRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=160)


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    name: str
    prefix: str
    last_used_at: datetime | None
    created_at: datetime


class ApiKeyCreateResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    key: ApiKeyResponse
    api_key: str


class RevokeAllSessionsResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    revoked_count: int


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _organization_name_for(email: str) -> str:
    local_part = email.split("@", 1)[0]
    cleaned = local_part.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    owner = cleaned.title() if cleaned else "Personal"
    return f"{owner} Organization"


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        email_verified=user.email_verified_at is not None,
    )


async def _issue_auth_response(
    session: AsyncSession,
    user: User,
    organization: Organization,
    role: str,
    settings: Settings,
) -> AuthResponse:
    access_token, expires_in = create_access_token(user.id, settings)
    refresh_token, token_hash, expires_at = create_refresh_token(settings)
    session.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    await session.commit()

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=_user_response(user),
        organization=OrganizationResponse(id=organization.id, name=organization.name, role=role),
    )


async def _issue_email_verification_token(
    session: AsyncSession, user: User, settings: Settings
) -> str:
    raw, token_hash, expires_at = create_email_verification_token(settings)
    session.add(
        EmailVerificationToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    )
    logger.info(
        "email_verification_token_issued",
        user_id=str(user.id),
        verification_code_dev=raw,
        expires_at=expires_at.isoformat(),
    )
    return raw


@router.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    credentials: AuthCredentials,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    email = _normalize_email(credentials.email)
    user = User(email=email, password_hash=hash_password(credentials.password))
    organization = Organization(name=_organization_name_for(email))
    membership = Membership(user=user, organization=organization, role="owner")
    session.add_all([user, organization, membership])

    try:
        await session.flush()
        await _issue_email_verification_token(session, user, settings)
        return await _issue_auth_response(session, user, organization, membership.role, settings)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        ) from exc


@router.post("/auth/login", response_model=AuthResponse)
async def login(
    credentials: AuthCredentials,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    email = _normalize_email(credentials.email)
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if settings.require_email_verification and user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified"
        )

    membership_result = await session.execute(
        select(Membership, Organization)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    membership, organization = membership_result.first() or (None, None)
    if membership is None or organization is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User has no organization"
        )

    return await _issue_auth_response(session, user, organization, membership.role, settings)


@router.post("/auth/refresh", response_model=AuthResponse)
async def refresh(
    payload: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    token_hash = hash_refresh_token(payload.refresh_token, settings)
    token_result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored_token = token_result.scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        stored_token is None
        or stored_token.revoked_at is not None
        or stored_token.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user = await session.get(User, stored_token.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    membership_result = await session.execute(
        select(Membership, Organization)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    membership, organization = membership_result.first() or (None, None)
    if membership is None or organization is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User has no organization"
        )

    new_refresh_token, new_token_hash, expires_at = create_refresh_token(settings)
    replacement = RefreshToken(user_id=user.id, token_hash=new_token_hash, expires_at=expires_at)
    session.add(replacement)
    await session.flush()
    stored_token.revoked_at = now
    stored_token.replaced_by_token_id = replacement.id

    access_token, expires_in = create_access_token(user.id, settings)
    await session.commit()

    return AuthResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=expires_in,
        user=_user_response(user),
        organization=OrganizationResponse(
            id=organization.id, name=organization.name, role=membership.role
        ),
    )


@router.post("/auth/logout", response_model=StatusResponse)
async def logout(
    payload: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StatusResponse:
    token_hash = hash_refresh_token(payload.refresh_token, settings)
    token_result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored_token = token_result.scalar_one_or_none()
    if stored_token is not None and stored_token.revoked_at is None:
        stored_token.revoked_at = datetime.now(UTC)
        await session.commit()

    return StatusResponse(status="ok")


@router.post("/auth/sessions/revoke-all", response_model=RevokeAllSessionsResponse)
async def revoke_all_sessions(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RevokeAllSessionsResponse:
    now = datetime.now(UTC)
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
        )
    )
    tokens = result.scalars().all()
    for token in tokens:
        token.revoked_at = now
    await session.commit()
    return RevokeAllSessionsResponse(revoked_count=len(tokens))


@router.post("/auth/verify/request", response_model=StatusResponse)
async def request_email_verification(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StatusResponse:
    if user.email_verified_at is not None:
        return StatusResponse(status="already_verified")
    await _issue_email_verification_token(session, user, settings)
    await session.commit()
    return StatusResponse(status="sent")


@router.post("/auth/verify/confirm", response_model=StatusResponse)
async def confirm_email_verification(
    payload: VerifyEmailRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StatusResponse:
    token_hash = hash_verification_token(payload.token, settings)
    result = await session.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        record is None
        or record.used_at is not None
        or record.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token"
        )
    user = await session.get(User, record.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token"
        )
    record.used_at = now
    if user.email_verified_at is None:
        user.email_verified_at = now
    await session.commit()
    return StatusResponse(status="verified")


@router.post("/auth/password-reset/request", response_model=StatusResponse)
async def request_password_reset(
    payload: EmailRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StatusResponse:
    email = _normalize_email(payload.email)
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is not None:
        raw, token_hash, expires_at = create_password_reset_token(settings)
        session.add(
            PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
        )
        await session.commit()
        logger.info(
            "password_reset_token_issued",
            user_id=str(user.id),
            reset_code_dev=raw,
            expires_at=expires_at.isoformat(),
        )
    return StatusResponse(status="sent")


@router.post("/auth/password-reset/confirm", response_model=StatusResponse)
async def confirm_password_reset(
    payload: PasswordResetRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StatusResponse:
    token_hash = hash_password_reset_token(payload.token, settings)
    result = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        record is None
        or record.used_at is not None
        or record.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token"
        )
    user = await session.get(User, record.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token"
        )
    user.password_hash = hash_password(payload.password)
    record.used_at = now

    revoke_result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
        )
    )
    for token in revoke_result.scalars().all():
        token.revoked_at = now

    await session.commit()
    return StatusResponse(status="reset")


@router.post(
    "/me/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key_endpoint(
    payload: ApiKeyCreateRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApiKeyCreateResponse:
    membership_result = await session.execute(
        select(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User has no organization"
        )

    raw, prefix, key_hash = create_api_key(settings)
    record = ApiKey(
        organization_id=membership.organization_id,
        user_id=user.id,
        name=payload.name.strip(),
        prefix=prefix,
        key_hash=key_hash,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return ApiKeyCreateResponse(
        api_key=raw,
        key=ApiKeyResponse(
            id=record.id,
            name=record.name,
            prefix=record.prefix,
            last_used_at=record.last_used_at,
            created_at=record.created_at,
        ),
    )


@router.get("/me/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApiKeyResponse]:
    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc())
    )
    return [
        ApiKeyResponse(
            id=record.id,
            name=record.name,
            prefix=record.prefix,
            last_used_at=record.last_used_at,
            created_at=record.created_at,
        )
        for record in result.scalars().all()
    ]


@router.delete("/me/api-keys/{key_id}", response_model=StatusResponse)
async def delete_api_key(
    key_id: UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StatusResponse:
    record = await session.get(ApiKey, key_id)
    if record is None or record.user_id != user.id or record.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    record.revoked_at = datetime.now(UTC)
    await session.commit()
    return StatusResponse(status="revoked")


@router.get("/me/dashboard", response_model=DashboardResponse)
async def dashboard(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DashboardResponse:
    result = await session.execute(
        select(Membership, Organization)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    organizations = [
        OrganizationResponse(id=organization.id, name=organization.name, role=membership.role)
        for membership, organization in result.all()
    ]
    return DashboardResponse(user=_user_response(user), organizations=organizations)


@router.get("/orgs/{org_id}/member-check", response_model=StatusResponse)
async def org_member_check(
    membership: Annotated[Membership, Depends(require_org_member)],
) -> StatusResponse:
    return StatusResponse(status=f"ok:{membership.role}")


__all__ = ["router"]
