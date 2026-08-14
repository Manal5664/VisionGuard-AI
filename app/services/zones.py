from app.core.database import SessionLocal
from app.models.zone import RestrictedZone
from app.services.intrusion import Coordinates


def to_zone_coordinates(zone: RestrictedZone) -> Coordinates:
    return {
        "x1": zone.x1,
        "y1": zone.y1,
        "x2": zone.x2,
        "y2": zone.y2,
    }


def get_restricted_zone() -> Coordinates | None:
    """Return the first saved restricted zone, or None if none exist."""
    db = SessionLocal()

    try:
        zone = db.query(RestrictedZone).order_by(RestrictedZone.id.asc()).first()
        return to_zone_coordinates(zone) if zone else None

    finally:
        db.close()
