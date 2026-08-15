from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import case, func

from app.core.database import SessionLocal
from app.models.event import Event


router = APIRouter()


def _serialize_event(event: Event) -> dict:
    return {
        "id": event.id,
        "event_type": event.event_type,
        "object_type": event.object_type,
        "confidence": event.confidence,
        "image_path": event.image_path,
        "source": event.source,
        "track_id": event.track_id,
        "frame": event.frame,
        "media_path": event.media_path,
        "job_id": event.job_id,
        "event_sequence": event.event_sequence,
        "zone_name": event.zone_name,
        "video_time_seconds": event.video_time_seconds,
        "created_at": event.created_at,
    }


@router.get("/events")
def get_events(
    event_type: Literal["detection", "intrusion"] | None = Query(None),
    source: Literal["image", "video"] | None = Query(None),
    before_id: int | None = Query(None, ge=1),
    created_from: datetime | None = Query(None),
    created_to: datetime | None = Query(None),
    limit: int | None = Query(None, ge=1, le=100),
):
    db = SessionLocal()

    try:
        query = db.query(Event)

        if event_type is not None:
            query = query.filter(Event.event_type == event_type)
        if source is not None:
            query = query.filter(Event.source == source)
        if before_id is not None:
            query = query.filter(Event.id < before_id)
        if created_from is not None:
            query = query.filter(Event.created_at >= _as_naive_utc(created_from))
        if created_to is not None:
            query = query.filter(Event.created_at <= _as_naive_utc(created_to))

        query = query.order_by(Event.id.desc())
        if limit is not None:
            query = query.limit(limit)

        events = query.all()

        return [_serialize_event(event) for event in events]

    finally:
        db.close()


@router.get("/events/summary")
def get_event_summary():
    db = SessionLocal()

    try:
        today_start = datetime.now(timezone.utc).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
            tzinfo=None,
        )
        (
            total_events,
            total_intrusions,
            total_detections,
            image_events,
            video_events,
            events_today,
        ) = db.query(
            func.count(Event.id),
            func.sum(case((Event.event_type == "intrusion", 1), else_=0)),
            func.sum(case((Event.event_type == "detection", 1), else_=0)),
            func.sum(case((Event.source == "image", 1), else_=0)),
            func.sum(case((Event.source == "video", 1), else_=0)),
            func.sum(case((Event.created_at >= today_start, 1), else_=0)),
        ).one()

        return {
            "total_events": int(total_events or 0),
            "total_intrusions": int(total_intrusions or 0),
            "total_detections": int(total_detections or 0),
            "image_events": int(image_events or 0),
            "video_events": int(video_events or 0),
            "events_today": int(events_today or 0),
        }

    finally:
        db.close()


@router.get("/notifications")
def get_notifications(
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, ge=1),
):
    db = SessionLocal()

    try:
        query = db.query(Event).filter(
            Event.event_type == "intrusion",
            Event.source == "video",
        )
        if before_id is not None:
            query = query.filter(Event.id < before_id)

        events = query.order_by(Event.id.desc()).limit(limit).all()
        return [_serialize_event(event) for event in events]

    finally:
        db.close()


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
