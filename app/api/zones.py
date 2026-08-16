from fastapi import APIRouter
from pydantic import BaseModel, model_validator

from app.core.database import SessionLocal
from app.models.zone import RestrictedZone


router = APIRouter()


class ZoneCreate(BaseModel):
    name: str
    x1: float
    y1: float
    x2: float
    y2: float

    @model_validator(mode="after")
    def validate_ordering(self):
        if self.x2 <= self.x1:
            raise ValueError("x2 must be greater than x1")
        if self.y2 <= self.y1:
            raise ValueError("y2 must be greater than y1")
        return self


@router.post("/zones", status_code=201)
def create_zone(zone_data: ZoneCreate):
    db = SessionLocal()

    try:
        zone = RestrictedZone(
            name=zone_data.name,
            x1=zone_data.x1,
            y1=zone_data.y1,
            x2=zone_data.x2,
            y2=zone_data.y2,
        )

        db.add(zone)
        db.commit()
        db.refresh(zone)

        return {
            "id": zone.id,
            "name": zone.name,
            "x1": zone.x1,
            "y1": zone.y1,
            "x2": zone.x2,
            "y2": zone.y2,
            "created_at": zone.created_at,
        }

    finally:
        db.close()


@router.get("/zones")
def get_zones():
    db = SessionLocal()

    try:
        zones = (
            db.query(RestrictedZone)
            .filter(RestrictedZone.camera_id.is_(None))
            .order_by(RestrictedZone.id.asc())
            .all()
        )

        return [
            {
                "id": zone.id,
                "name": zone.name,
                "x1": zone.x1,
                "y1": zone.y1,
                "x2": zone.x2,
                "y2": zone.y2,
                "created_at": zone.created_at,
            }
            for zone in zones
        ]

    finally:
        db.close()
