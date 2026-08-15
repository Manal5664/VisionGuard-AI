from fastapi import APIRouter, Query

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
def get_events():
    db = SessionLocal()

    try:
        events = db.query(Event).order_by(Event.id.desc()).all()

        return [_serialize_event(event) for event in events]

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
