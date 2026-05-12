import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.deps import current_user, get_session
from app.limits import (
    PAGE_RENDER_REQUESTS,
    enforce_org_quota,
    enforce_user_rate_limit,
    increment_usage_counter,
)
from app.models import Membership, PageSession, User
from app.observability import PAGE_RENDER_REQUEST_COUNTER
from app.recipe_runner import extract_preview_rows
from app.resources import make_s3_client
from app.selector_generator import SelectorMode, generate_selector
from app.ssrf import validate_public_render_url

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/page-sessions", tags=["page-sessions"])


class PageSessionCreateRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    url: str = Field(min_length=1, max_length=2048)


class DomNode(BaseModel):
    model_config = ConfigDict(strict=True)

    nodeId: str
    tag: str
    text: str
    attrs: dict[str, str] = Field(default_factory=dict)
    classes: list[str] = Field(default_factory=list)
    parentNodeId: str | None = None
    nthOfType: int = 1
    x: float
    y: float
    width: float
    height: float


class PageSessionCreateResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    sessionId: UUID
    screenshotUrl: str | None
    domNodes: list[DomNode]
    title: str | None
    jobStatus: str


class SelectorRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    nodeId: str = Field(min_length=1, max_length=80)
    mode: SelectorMode
    containerSelector: str | None = Field(default=None, max_length=512)


class SelectorResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    selector: str
    matchCount: int
    strategy: str


ExtractType = Literal["text", "href", "src", "attribute", "html"]


class PreviewField(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=64)
    selector: str = Field(min_length=1, max_length=512)
    extract: ExtractType
    attribute: str | None = Field(default=None, max_length=80)


class PreviewRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    containerSelector: str = Field(min_length=1, max_length=512)
    fields: list[PreviewField] = Field(min_length=1, max_length=20)


class PreviewResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    rows: list[dict[str, str]]
    rowCount: int


async def _primary_membership(user: User, session: AsyncSession) -> Membership:
    result = await session.execute(
        select(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User has no organization"
        )
    return membership


def _response_from_payload(
    request: Request,
    page_session: PageSession,
    payload: dict[str, Any] | None,
) -> PageSessionCreateResponse:
    metadata = payload.get("metadata", {}) if payload else {}
    raw_nodes = payload.get("domNodes", []) if payload else []
    dom_nodes = [
        DomNode.model_validate(_normalize_dom_node(node))
        for node in raw_nodes
        if isinstance(node, dict)
    ]
    screenshot_url = (
        str(request.url_for("page_session_screenshot", session_id=page_session.id))
        if page_session.screenshot_key
        else None
    )
    return PageSessionCreateResponse(
        sessionId=page_session.id,
        screenshotUrl=screenshot_url,
        domNodes=dom_nodes,
        title=metadata.get("title") if isinstance(metadata.get("title"), str) else None,
        jobStatus=page_session.status,
    )


def _normalize_dom_node(node: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(node)
    attrs = normalized.get("attrs")
    classes = normalized.get("classes")
    normalized["attrs"] = attrs if isinstance(attrs, dict) else {}
    normalized["classes"] = classes if isinstance(classes, list) else []
    normalized["parentNodeId"] = (
        normalized["parentNodeId"] if isinstance(normalized.get("parentNodeId"), str) else None
    )
    normalized["nthOfType"] = int(normalized.get("nthOfType") or 1)
    for key in ("x", "y", "width", "height"):
        normalized[key] = float(normalized.get(key, 0))
    return normalized


async def _org_scoped_page_session(
    session_id: UUID,
    user: User,
    session: AsyncSession,
) -> PageSession:
    result = await session.execute(
        select(PageSession)
        .join(
            Membership,
            (Membership.organization_id == PageSession.organization_id)
            & (Membership.user_id == user.id),
        )
        .where(PageSession.id == session_id)
    )
    page_session = result.scalar_one_or_none()
    if page_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page session not found")
    return page_session


async def _load_page_session_payload(request: Request, session_id: UUID) -> dict[str, Any]:
    redis_payload = await request.app.state.redis.get(f"page_session:{session_id}")
    if not isinstance(redis_payload, str):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Page session DOM payload is not available",
        )
    loaded_payload = json.loads(redis_payload)
    if not isinstance(loaded_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Page session DOM payload is invalid",
        )
    return loaded_payload


async def _load_page_session_html(page_session: PageSession, settings: Settings) -> str:
    if page_session.html_key is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Page session HTML snapshot is not available",
        )
    s3_client = make_s3_client(settings)

    def _get_object() -> str:
        response = s3_client.get_object(Bucket=settings.s3_bucket, Key=page_session.html_key)
        return response["Body"].read().decode("utf-8", errors="replace")

    return await asyncio.to_thread(_get_object)


@router.post("", response_model=PageSessionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_page_session(
    payload: PageSessionCreateRequest,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PageSessionCreateResponse:
    membership = await _primary_membership(user, session)
    structlog.contextvars.bind_contextvars(org_id=str(membership.organization_id))
    try:
        await enforce_user_rate_limit(
            request.app.state.redis,
            user.id,
            PAGE_RENDER_REQUESTS,
            settings.render_rate_limit_per_hour,
        )
    except HTTPException:
        PAGE_RENDER_REQUEST_COUNTER.labels(outcome="rate_limited").inc()
        raise
    try:
        url = await validate_public_render_url(payload.url)
    except HTTPException:
        PAGE_RENDER_REQUEST_COUNTER.labels(outcome="ssrf_rejected").inc()
        raise
    try:
        await enforce_org_quota(
            session,
            membership.organization_id,
            PAGE_RENDER_REQUESTS,
            settings.org_render_quota_per_month,
        )
    except HTTPException:
        PAGE_RENDER_REQUEST_COUNTER.labels(outcome="quota_exceeded").inc()
        raise
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.page_session_ttl_seconds)
    page_session = PageSession(
        organization_id=membership.organization_id,
        user_id=user.id,
        status="queued",
        url=url,
        expires_at=expires_at,
    )
    session.add(page_session)
    await increment_usage_counter(session, membership.organization_id, PAGE_RENDER_REQUESTS)
    await session.commit()
    await session.refresh(page_session)

    structlog.contextvars.bind_contextvars(page_session_id=str(page_session.id))
    logger.info("page_session_render_enqueue", url=url)
    job = await request.app.state.arq_pool.enqueue_job(
        "render_page",
        str(page_session.id),
        url,
        str(membership.organization_id),
        str(user.id),
    )
    if job is None:
        page_session.status = "failed"
        page_session.error_message = "Render job could not be enqueued"
        await session.commit()
        PAGE_RENDER_REQUEST_COUNTER.labels(outcome="enqueue_failed").inc()
        logger.error("page_session_render_enqueue_failed")
        return _response_from_payload(request, page_session, None)
    structlog.contextvars.bind_contextvars(job_id=job.job_id)
    PAGE_RENDER_REQUEST_COUNTER.labels(outcome="accepted").inc()

    result_payload: dict[str, Any] | None = None
    try:
        result = await job.result(timeout=settings.render_result_timeout_seconds)
        if isinstance(result, dict):
            result_payload = result
    except TimeoutError:
        pass
    except Exception:
        await session.refresh(page_session)
        return _response_from_payload(request, page_session, None)

    await session.refresh(page_session)
    if result_payload is None:
        redis_payload = await request.app.state.redis.get(f"page_session:{page_session.id}")
        if isinstance(redis_payload, str):
            loaded_payload = json.loads(redis_payload)
            if isinstance(loaded_payload, dict):
                result_payload = loaded_payload

    return _response_from_payload(request, page_session, result_payload)


@router.post("/{session_id}/selector", response_model=SelectorResponse)
async def page_session_selector(
    session_id: UUID,
    payload: SelectorRequest,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SelectorResponse:
    await _org_scoped_page_session(session_id, user, session)
    session_payload = await _load_page_session_payload(request, session_id)
    raw_nodes = session_payload.get("domNodes", [])
    if not isinstance(raw_nodes, list):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Page session DOM payload is invalid",
        )
    try:
        selector_result = generate_selector(
            raw_nodes, payload.nodeId, payload.mode, payload.containerSelector
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SelectorResponse.model_validate(selector_result)


@router.post("/{session_id}/preview", response_model=PreviewResponse)
async def page_session_preview(
    session_id: UUID,
    payload: PreviewRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PreviewResponse:
    page_session = await _org_scoped_page_session(session_id, user, session)
    html = await _load_page_session_html(page_session, settings)
    rows = extract_preview_rows(
        html,
        payload.containerSelector,
        [field.model_dump() for field in payload.fields],
    )
    return PreviewResponse(rows=rows, rowCount=len(rows))


@router.get("/{session_id}/screenshot", name="page_session_screenshot")
async def page_session_screenshot(
    session_id: UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    page_session = await _org_scoped_page_session(session_id, user, session)
    if page_session.screenshot_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot not found")

    s3_client = make_s3_client(settings)

    def _get_object() -> tuple[bytes, str]:
        response = s3_client.get_object(Bucket=settings.s3_bucket, Key=page_session.screenshot_key)
        return response["Body"].read(), response.get("ContentType", "image/png")

    body, content_type = await asyncio.to_thread(_get_object)
    return StreamingResponse(iter([body]), media_type=content_type)
