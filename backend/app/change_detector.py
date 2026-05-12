from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ChangeEvent, ExtractedRecord, ExtractionRun

ChangeType = Literal["new", "changed", "removed"]


def detect_changes(
    previous_records: dict[str, dict[str, Any]],
    current_records: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for record_key in sorted(current_records.keys() - previous_records.keys()):
        events.append(
            {
                "change_type": "new",
                "record_key": record_key,
                "old_data": None,
                "new_data": current_records[record_key],
            }
        )

    for record_key in sorted(previous_records.keys() & current_records.keys()):
        old_data = previous_records[record_key]
        new_data = current_records[record_key]
        if old_data != new_data:
            events.append(
                {
                    "change_type": "changed",
                    "record_key": record_key,
                    "old_data": old_data,
                    "new_data": new_data,
                }
            )

    for record_key in sorted(previous_records.keys() - current_records.keys()):
        events.append(
            {
                "change_type": "removed",
                "record_key": record_key,
                "old_data": previous_records[record_key],
                "new_data": None,
            }
        )

    return events


async def persist_change_events_for_run(session: AsyncSession, run_id: UUID) -> int:
    run = await session.get(ExtractionRun, run_id)
    if run is None:
        raise ValueError("Run not found")

    previous_result = await session.execute(
        select(ExtractionRun)
        .where(
            ExtractionRun.recipe_id == run.recipe_id,
            ExtractionRun.organization_id == run.organization_id,
            ExtractionRun.id != run.id,
            ExtractionRun.status == "completed",
        )
        .order_by(
            ExtractionRun.finished_at.desc().nullslast(),
            ExtractionRun.started_at.desc().nullslast(),
        )
        .limit(1)
    )
    previous_run = previous_result.scalar_one_or_none()
    if previous_run is None:
        return 0

    previous_records = await _record_map(session, previous_run.id)
    current_records = await _record_map(session, run.id)
    events = detect_changes(previous_records, current_records)

    await session.execute(delete(ChangeEvent).where(ChangeEvent.run_id == run.id))
    for event in events:
        session.add(
            ChangeEvent(
                organization_id=run.organization_id,
                recipe_id=run.recipe_id,
                run_id=run.id,
                change_type=event["change_type"],
                record_key=event["record_key"],
                old_data=event["old_data"],
                new_data=event["new_data"],
            )
        )
    await session.flush()
    return len(events)


async def load_change_events_for_run(session: AsyncSession, run_id: UUID) -> list[ChangeEvent]:
    result = await session.execute(
        select(ChangeEvent)
        .where(ChangeEvent.run_id == run_id)
        .order_by(ChangeEvent.change_type.asc(), ChangeEvent.record_key.asc())
    )
    return list(result.scalars().all())


async def load_run_with_changes(session: AsyncSession, run_id: UUID) -> ExtractionRun | None:
    return await session.get(
        ExtractionRun,
        run_id,
        options=[
            selectinload(ExtractionRun.records),
            selectinload(ExtractionRun.change_events),
        ],
    )


async def _record_map(session: AsyncSession, run_id: UUID) -> dict[str, dict[str, Any]]:
    result = await session.execute(
        select(ExtractedRecord).where(ExtractedRecord.run_id == run_id)
    )
    records: dict[str, dict[str, Any]] = {}
    for record in result.scalars().all():
        records[record.record_key] = record.data
    return records
