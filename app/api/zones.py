from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from app.core.database import SessionLocal
from app.models.camera import Camera
from app.models.zone import RestrictedZone
from app.services.camera_monitor import camera_manager


router = APIRouter()

COORDINATE_FIELDS = ("x1", "y1", "x2", "y2")


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


class ZoneUpdate(BaseModel):
    name: str | None = None
    x1: float | None = None
    y1: float | None = None
    x2: float | None = None
    y2: float | None = None
    camera_id: int | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Zone name is required.")
        return value

    @model_validator(mode="after")
    def validate_coordinates(self):
        provided = [name for name in COORDINATE_FIELDS if name in self.model_fields_set]
        if provided and len(provided) != len(COORDINATE_FIELDS):
            raise ValueError(
                "Coordinates must be updated together: provide x1, y1, x2, and y2."
            )
        if len(provided) == len(COORDINATE_FIELDS):
            if self.x2 <= self.x1:
                raise ValueError("x2 must be greater than x1")
            if self.y2 <= self.y1:
                raise ValueError("y2 must be greater than y1")
        return self


def _serialize_zone(zone: RestrictedZone) -> dict:
    return {
        "id": zone.id,
        "name": zone.name,
        "x1": zone.x1,
        "y1": zone.y1,
        "x2": zone.x2,
        "y2": zone.y2,
        "camera_id": zone.camera_id,
        "created_at": zone.created_at,
    }


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

        return _serialize_zone(zone)

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

        return [_serialize_zone(zone) for zone in zones]

    finally:
        db.close()


@router.patch("/zones/{zone_id}")
def update_zone(zone_id: int, zone_data: ZoneUpdate):
    db = SessionLocal()

    try:
        zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
        if zone is None:
            raise HTTPException(status_code=404, detail="Restricted zone not found.")

        if "camera_id" in zone_data.model_fields_set and zone_data.camera_id is not None:
            camera = (
                db.query(Camera)
                .filter(Camera.id == zone_data.camera_id)
                .first()
            )
            if camera is None:
                raise HTTPException(status_code=404, detail="Camera not found.")

        fields = zone_data.model_fields_set
        if "name" in fields:
            zone.name = zone_data.name
        if set(COORDINATE_FIELDS) <= fields:
            zone.x1 = zone_data.x1
            zone.y1 = zone_data.y1
            zone.x2 = zone_data.x2
            zone.y2 = zone_data.y2
        if "camera_id" in fields:
            zone.camera_id = zone_data.camera_id

        db.commit()
        db.refresh(zone)
        result = _serialize_zone(zone)

        if zone.camera_id is not None:
            camera_manager.update_zone(zone.camera_id, result)

        return result

    finally:
        db.close()


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: int):
    db = SessionLocal()

    try:
        zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
        if zone is None:
            raise HTTPException(status_code=404, detail="Restricted zone not found.")

        db.delete(zone)
        db.commit()

    finally:
        db.close()
