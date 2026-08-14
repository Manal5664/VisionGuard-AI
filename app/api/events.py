from fastapi import APIRouter

from app.core.database import SessionLocal
from app.models.event import Event


router = APIRouter()


@router.get("/events")
def get_events():
    db = SessionLocal()

    try:
        events = db.query(Event).order_by(Event.id.desc()).all()

        return [
            {
                "id": event.id,
                "event_type": event.event_type,
                "object_type": event.object_type,
                "confidence": event.confidence,
                "image_path": event.image_path,
                "created_at": event.created_at,
            }
            for event in events
        ]

    finally:
        db.close()