import asyncio
import csv
import io
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlparse
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.deps import current_user, current_user_or_api_key, get_session
from app.limits import (
    EXPORT_REQUESTS,
    RECIPE_RUN_REQUESTS,
    enforce_org_quota,
    enforce_user_rate_limit,
    increment_usage_counter,
)
from app.models import (
    ChangeEvent,
    ExtractedRecord,
    ExtractionRun,
    Membership,
    Recipe,
    RecipeVersion,
    User,
    Website,
)
from app.observability import EXPORT_REQUEST_COUNTER, RECIPE_RUN_REQUEST_COUNTER
from app.ssrf import validate_public_render_url

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["recipes"])

ExtractType = Literal["text", "href", "src", "attribute", "html"]


class RecipeField(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=64)
    selector: str = Field(min_length=1, max_length=512)
    extract: ExtractType
    attribute: str | None = Field(default=None, max_length=80)
    required: bool = False


class RecipeCreateRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2048)
    containerSelector: str = Field(min_length=1, max_length=512)
    fields: list[RecipeField] = Field(min_length=1, max_length=20)
    pageType: str = Field(default="listing", min_length=1, max_length=64)


class RecipeResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    organizationId: UUID
    websiteId: UUID
    name: str
    url: str
    pageType: str
    status: str
    version: int
    config: dict[str, Any]
    createdAt: datetime
    updatedAt: datetime


class RecipeRunCreateResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    runId: UUID
    jobId: str | None
    status: str


class ExtractedRecordResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    recordKey: str
    data: dict[str, Any]
    createdAt: datetime


class ChangeEventResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    changeType: str
    recordKey: str
    oldData: dict[str, Any] | None
    newData: dict[str, Any] | None
    createdAt: datetime


class RunChangesResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    new: list[ChangeEventResponse]
    changed: list[ChangeEventResponse]
    removed: list[ChangeEventResponse]


class RunResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    id: UUID
    recipeId: UUID
    organizationId: UUID
    url: str
    status: str
    totalRecords: int
    startedAt: datetime | None
    finishedAt: datetime | None
    errorMessage: str | None
    jobId: str | None
    records: list[ExtractedRecordResponse]
    changes: RunChangesResponse


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


async def _org_scoped_recipe(
    recipe_id: UUID,
    user: User,
    session: AsyncSession,
) -> Recipe:
    result = await session.execute(
        select(Recipe)
        .options(selectinload(Recipe.versions))
        .join(
            Membership,
            (Membership.organization_id == Recipe.organization_id)
            & (Membership.user_id == user.id),
        )
        .where(Recipe.id == recipe_id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return recipe


async def _org_scoped_run(
    run_id: UUID,
    user: User,
    session: AsyncSession,
) -> ExtractionRun:
    result = await session.execute(
        select(ExtractionRun)
        .options(selectinload(ExtractionRun.records), selectinload(ExtractionRun.change_events))
        .join(
            Membership,
            (Membership.organization_id == ExtractionRun.organization_id)
            & (Membership.user_id == user.id),
        )
        .where(ExtractionRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


def _domain_for_url(url: str) -> str:
    parsed = urlparse(url)
    domain = parsed.hostname or ""
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="URL is invalid"
        )
    return domain.lower()


def _config_for(payload: RecipeCreateRequest, url: str, domain: str) -> dict[str, Any]:
    return {
        "domain": domain,
        "urlPattern": url,
        "pageType": payload.pageType,
        "containerSelector": payload.containerSelector,
        "fields": [field.model_dump(exclude_none=True) for field in payload.fields],
        "deduplication": {"primaryKey": "detail_url"},
        "pagination": {"type": "none"},
    }


def _latest_version(recipe: Recipe) -> RecipeVersion:
    if not recipe.versions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Recipe has no saved version"
        )
    return sorted(recipe.versions, key=lambda version: version.version, reverse=True)[0]


def _recipe_response(recipe: Recipe, version: RecipeVersion | None = None) -> RecipeResponse:
    version = version or _latest_version(recipe)
    return RecipeResponse(
        id=recipe.id,
        organizationId=recipe.organization_id,
        websiteId=recipe.website_id,
        name=recipe.name,
        url=recipe.url_pattern,
        pageType=recipe.page_type,
        status=recipe.status,
        version=version.version,
        config=version.config,
        createdAt=recipe.created_at,
        updatedAt=recipe.updated_at,
    )


def _run_response(run: ExtractionRun) -> RunResponse:
    records = sorted(run.records, key=lambda record: record.created_at)
    changes = _group_change_events(run.change_events)
    return RunResponse(
        id=run.id,
        recipeId=run.recipe_id,
        organizationId=run.organization_id,
        url=run.url,
        status=run.status,
        totalRecords=run.total_records,
        startedAt=run.started_at,
        finishedAt=run.finished_at,
        errorMessage=run.error_message,
        jobId=run.job_id,
        records=[
            ExtractedRecordResponse(
                id=record.id,
                recordKey=record.record_key,
                data=record.data,
                createdAt=record.created_at,
            )
            for record in records
        ],
        changes=changes,
    )


def _group_change_events(events: list[ChangeEvent]) -> RunChangesResponse:
    grouped: dict[str, list[ChangeEventResponse]] = {"new": [], "changed": [], "removed": []}
    for event in sorted(events, key=lambda item: (item.change_type, item.record_key)):
        if event.change_type not in grouped:
            continue
        grouped[event.change_type].append(
            ChangeEventResponse(
                id=event.id,
                changeType=event.change_type,
                recordKey=event.record_key,
                oldData=event.old_data,
                newData=event.new_data,
                createdAt=event.created_at,
            )
        )
    return RunChangesResponse(**grouped)


def _export_columns(records: list[ExtractedRecord], configured_fields: list[str]) -> list[str]:
    columns: list[str] = ["record_key"]
    seen = set(columns)
    for key in configured_fields:
        if key not in seen:
            columns.append(key)
            seen.add(key)
    for record in records:
        for key in record.data.keys():
            if key not in seen:
                columns.append(key)
                seen.add(key)
    return columns


def _safe_filename(run: ExtractionRun, suffix: str) -> str:
    return f"scraptheweb-run-{run.id}.{suffix}"


async def _configured_field_names(run: ExtractionRun, session: AsyncSession) -> list[str]:
    result = await session.execute(
        select(RecipeVersion)
        .where(
            RecipeVersion.recipe_id == run.recipe_id,
            RecipeVersion.organization_id == run.organization_id,
        )
        .order_by(RecipeVersion.version.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    fields = version.config.get("fields", []) if version is not None else []
    if not isinstance(fields, list):
        return []
    return [
        str(field.get("name"))
        for field in fields
        if isinstance(field, dict) and field.get("name")
    ]


@router.post("/api/recipes", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    payload: RecipeCreateRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RecipeResponse:
    url = await validate_public_render_url(payload.url)
    membership = await _primary_membership(user, session)
    domain = _domain_for_url(url)

    website_result = await session.execute(
        select(Website).where(
            Website.organization_id == membership.organization_id,
            Website.domain == domain,
        )
    )
    website = website_result.scalar_one_or_none()
    if website is None:
        website = Website(organization_id=membership.organization_id, domain=domain)
        session.add(website)
        await session.flush()

    recipe = Recipe(
        organization_id=membership.organization_id,
        website_id=website.id,
        name=payload.name.strip(),
        url_pattern=url,
        page_type=payload.pageType,
        status="active",
        created_by_user_id=user.id,
    )
    session.add(recipe)
    await session.flush()

    version = RecipeVersion(
        organization_id=membership.organization_id,
        recipe_id=recipe.id,
        version=1,
        config=_config_for(payload, url, domain),
        validation_report=None,
        created_by_user_id=user.id,
    )
    session.add(version)
    await session.commit()

    return _recipe_response(recipe, version)


@router.get("/api/recipes", response_model=list[RecipeResponse])
async def list_recipes(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[RecipeResponse]:
    result = await session.execute(
        select(Recipe)
        .options(selectinload(Recipe.versions))
        .join(
            Membership,
            (Membership.organization_id == Recipe.organization_id)
            & (Membership.user_id == user.id),
        )
        .order_by(Recipe.updated_at.desc(), Recipe.created_at.desc())
        .limit(limit)
    )
    recipes = result.scalars().unique().all()
    return [_recipe_response(recipe) for recipe in recipes]


@router.get("/api/recipes/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RecipeResponse:
    recipe = await _org_scoped_recipe(recipe_id, user, session)
    return _recipe_response(recipe)


@router.post("/api/recipes/{recipe_id}/runs", response_model=RecipeRunCreateResponse)
async def create_recipe_run(
    recipe_id: UUID,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RecipeRunCreateResponse:
    recipe = await _org_scoped_recipe(recipe_id, user, session)
    structlog.contextvars.bind_contextvars(
        org_id=str(recipe.organization_id), recipe_id=str(recipe.id)
    )
    try:
        await enforce_user_rate_limit(
            request.app.state.redis,
            user.id,
            RECIPE_RUN_REQUESTS,
            settings.recipe_run_rate_limit_per_hour,
        )
    except HTTPException:
        RECIPE_RUN_REQUEST_COUNTER.labels(outcome="rate_limited").inc()
        raise
    try:
        url = await validate_public_render_url(recipe.url_pattern)
    except HTTPException:
        RECIPE_RUN_REQUEST_COUNTER.labels(outcome="ssrf_rejected").inc()
        raise
    try:
        await enforce_org_quota(
            session,
            recipe.organization_id,
            RECIPE_RUN_REQUESTS,
            settings.org_recipe_run_quota_per_month,
        )
    except HTTPException:
        RECIPE_RUN_REQUEST_COUNTER.labels(outcome="quota_exceeded").inc()
        raise
    run = ExtractionRun(
        recipe_id=recipe.id,
        organization_id=recipe.organization_id,
        url=url,
        status="queued",
        total_records=0,
        triggered_by_user_id=user.id,
    )
    session.add(run)
    await increment_usage_counter(session, recipe.organization_id, RECIPE_RUN_REQUESTS)
    await session.commit()
    await session.refresh(run)

    structlog.contextvars.bind_contextvars(run_id=str(run.id))
    logger.info("recipe_run_enqueue", url=url)
    job = await request.app.state.arq_pool.enqueue_job(
        "run_recipe",
        str(run.id),
        str(recipe.id),
        str(recipe.organization_id),
    )
    if job is None:
        run.status = "failed"
        run.error_message = "Recipe run job could not be enqueued"
        run.finished_at = datetime.now(UTC)
        await session.commit()
        RECIPE_RUN_REQUEST_COUNTER.labels(outcome="enqueue_failed").inc()
        logger.error("recipe_run_enqueue_failed")
        return RecipeRunCreateResponse(runId=run.id, jobId=None, status=run.status)

    run.job_id = job.job_id
    await session.commit()
    structlog.contextvars.bind_contextvars(job_id=job.job_id)
    RECIPE_RUN_REQUEST_COUNTER.labels(outcome="accepted").inc()
    return RecipeRunCreateResponse(runId=run.id, jobId=job.job_id, status=run.status)


@router.get("/api/runs", response_model=list[RunResponse])
async def list_runs(
    user: Annotated[User, Depends(current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[RunResponse]:
    result = await session.execute(
        select(ExtractionRun)
        .options(
            selectinload(ExtractionRun.records),
            selectinload(ExtractionRun.change_events),
        )
        .join(
            Membership,
            (Membership.organization_id == ExtractionRun.organization_id)
            & (Membership.user_id == user.id),
        )
        .order_by(
            ExtractionRun.started_at.desc().nullslast(),
            ExtractionRun.finished_at.desc().nullslast(),
        )
        .limit(limit)
    )
    runs = result.scalars().unique().all()
    return [_run_response(run) for run in runs]


@router.get("/api/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: UUID,
    user: Annotated[User, Depends(current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RunResponse:
    run = await _org_scoped_run(run_id, user, session)
    return _run_response(run)


# Bounds an SSE run stream: it ends as soon as the run reaches a terminal state, so the
# cap only matters for an abandoned/stuck job. Poll interval matches the old client poll.
_RUN_STREAM_MAX_SECONDS = 300
_RUN_STREAM_POLL_SECONDS = 1.0
_RUN_TERMINAL_STATES = ("completed", "failed")


@router.get("/api/runs/{run_id}/events")
async def stream_run_events(
    run_id: UUID,
    request: Request,
    user: Annotated[User, Depends(current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StreamingResponse:
    """Stream a run's state as Server-Sent Events until it reaches a terminal state.

    Replaces the frontend's 1.5 s poll: the server watches the run and pushes the full
    RunResponse whenever it changes. We authorize once up front (404 if the run isn't in
    the caller's org), then re-read the run with short-lived sessions inside the stream so
    we don't pin the request-scoped connection for the whole stream. Consumed via fetch +
    ReadableStream on the client, so the normal Bearer/X-API-Key auth header applies (the
    native EventSource API can't set headers).
    """
    run = await _org_scoped_run(run_id, user, session)
    org_id = run.organization_id
    sessionmaker = request.app.state.sessionmaker
    # Release the request-scoped connection now: the stream can stay open for minutes and
    # only needs the short-lived per-poll sessions below, not this one.
    await session.close()

    async def event_stream() -> AsyncIterator[str]:
        last_payload: str | None = None
        deadline = asyncio.get_event_loop().time() + _RUN_STREAM_MAX_SECONDS
        while asyncio.get_event_loop().time() < deadline:
            if await request.is_disconnected():
                return
            async with sessionmaker() as poll_session:
                result = await poll_session.execute(
                    select(ExtractionRun)
                    .options(
                        selectinload(ExtractionRun.records),
                        selectinload(ExtractionRun.change_events),
                    )
                    .where(
                        ExtractionRun.id == run_id,
                        ExtractionRun.organization_id == org_id,
                    )
                )
                run_row = result.scalar_one_or_none()
            if run_row is None:
                yield 'event: error\ndata: {"detail": "Run not found"}\n\n'
                return
            payload = json.dumps(_run_response(run_row).model_dump(mode="json"))
            if payload != last_payload:
                last_payload = payload
                yield f"data: {payload}\n\n"
            if run_row.status in _RUN_TERMINAL_STATES:
                return
            await asyncio.sleep(_RUN_STREAM_POLL_SECONDS)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/runs/{run_id}/export.csv")
async def export_run_csv(
    run_id: UUID,
    request: Request,
    user: Annotated[User, Depends(current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    run = await _org_scoped_run(run_id, user, session)
    structlog.contextvars.bind_contextvars(
        org_id=str(run.organization_id), run_id=str(run.id)
    )
    try:
        await enforce_user_rate_limit(
            request.app.state.redis,
            user.id,
            EXPORT_REQUESTS,
            settings.export_rate_limit_per_hour,
        )
    except HTTPException:
        EXPORT_REQUEST_COUNTER.labels(format="csv", outcome="rate_limited").inc()
        raise
    try:
        await enforce_org_quota(
            session,
            run.organization_id,
            EXPORT_REQUESTS,
            settings.org_export_quota_per_month,
        )
    except HTTPException:
        EXPORT_REQUEST_COUNTER.labels(format="csv", outcome="quota_exceeded").inc()
        raise
    await increment_usage_counter(session, run.organization_id, EXPORT_REQUESTS)
    await session.commit()
    records = sorted(run.records, key=lambda record: record.created_at)
    columns = _export_columns(records, await _configured_field_names(run, session))

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for record in records:
        writer.writerow({"record_key": record.record_key, **record.data})

    EXPORT_REQUEST_COUNTER.labels(format="csv", outcome="success").inc()
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{_safe_filename(run, "csv")}"'
        },
    )


@router.get("/api/runs/{run_id}/export.json")
async def export_run_json(
    run_id: UUID,
    request: Request,
    user: Annotated[User, Depends(current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    run = await _org_scoped_run(run_id, user, session)
    structlog.contextvars.bind_contextvars(
        org_id=str(run.organization_id), run_id=str(run.id)
    )
    try:
        await enforce_user_rate_limit(
            request.app.state.redis,
            user.id,
            EXPORT_REQUESTS,
            settings.export_rate_limit_per_hour,
        )
    except HTTPException:
        EXPORT_REQUEST_COUNTER.labels(format="json", outcome="rate_limited").inc()
        raise
    try:
        await enforce_org_quota(
            session,
            run.organization_id,
            EXPORT_REQUESTS,
            settings.org_export_quota_per_month,
        )
    except HTTPException:
        EXPORT_REQUEST_COUNTER.labels(format="json", outcome="quota_exceeded").inc()
        raise
    await increment_usage_counter(session, run.organization_id, EXPORT_REQUESTS)
    await session.commit()
    records = sorted(run.records, key=lambda record: record.created_at)
    EXPORT_REQUEST_COUNTER.labels(format="json", outcome="success").inc()
    payload = {
        "run": {
            "id": str(run.id),
            "recipeId": str(run.recipe_id),
            "organizationId": str(run.organization_id),
            "url": run.url,
            "status": run.status,
            "totalRecords": run.total_records,
            "startedAt": run.started_at.isoformat() if run.started_at else None,
            "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
        },
        "records": [
            {
                "recordKey": record.record_key,
                "data": record.data,
                "createdAt": record.created_at.isoformat(),
            }
            for record in records
        ],
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{_safe_filename(run, "json")}"'
        },
    )
