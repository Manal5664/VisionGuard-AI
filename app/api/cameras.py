from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError

from app.core.database import SessionLocal
from app.models.camera import Camera
from app.models.zone import RestrictedZone
from app.services.camera_monitor import camera_manager
from app.services.zones import to_zone_coordinates


router = APIRouter()


class CameraCreate(BaseModel):
    name: str
    source_type: Literal["webcam"] = "webcam"
    webcam_index: int = Field(0, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Camera name is required.")
        return value


class CameraUpdate(BaseModel):
    name: str | None = None
    webcam_index: int | None = Field(None, ge=0)
    is_enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Camera name is required.")
        return value


class CameraZoneCreate(BaseModel):
    name: str
    x1: float
    y1: float
    x2: float
    y2: float

    @model_validator(mode="after")
    def validate_zone(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Zone name is required.")
        if self.x2 <= self.x1:
            raise ValueError("x2 must be greater than x1")
        if self.y2 <= self.y1:
            raise ValueError("y2 must be greater than y1")
        return self


def _serialize_camera(camera: Camera) -> dict:
    return {
        "id": camera.id,
        "name": camera.name,
        "source_type": camera.source_type,
        "webcam_index": camera.webcam_index,
        "is_enabled": camera.is_enabled,
        "created_at": camera.created_at,
        "updated_at": camera.updated_at,
        "monitor": camera_manager.status(camera.id),
    }


def _serialize_zone(zone: RestrictedZone) -> dict:
    return {
        "id": zone.id,
        "camera_id": zone.camera_id,
        "name": zone.name,
        **to_zone_coordinates(zone),
        "created_at": zone.created_at,
    }


def _get_camera(db, camera_id: int) -> Camera:
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    return camera


def _active_zone(db, camera_id: int) -> RestrictedZone | None:
    return (
        db.query(RestrictedZone)
        .filter(RestrictedZone.camera_id == camera_id)
        .order_by(RestrictedZone.id.desc())
        .first()
    )


@router.get("/cameras")
def list_cameras():
    db = SessionLocal()
    try:
        cameras = db.query(Camera).order_by(Camera.id.asc()).all()
        return [_serialize_camera(camera) for camera in cameras]
    finally:
        db.close()


@router.post("/cameras", status_code=201)
def create_camera(camera_data: CameraCreate):
    db = SessionLocal()
    try:
        camera = Camera(**camera_data.model_dump(), is_enabled=True)
        db.add(camera)
        db.commit()
        db.refresh(camera)
        return _serialize_camera(camera)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A camera with this name already exists.",
        ) from exc
    finally:
        db.close()


@router.get("/cameras/{camera_id}")
def get_camera(camera_id: int):
    db = SessionLocal()
    try:
        return _serialize_camera(_get_camera(db, camera_id))
    finally:
        db.close()


@router.patch("/cameras/{camera_id}")
def update_camera(camera_id: int, camera_data: CameraUpdate):
    db = SessionLocal()
    try:
        camera = _get_camera(db, camera_id)
        if camera_manager.status(camera_id)["status"] in {
            "starting",
            "running",
            "stopping",
        }:
            raise HTTPException(
                status_code=409,
                detail="Stop monitoring before changing this camera.",
            )
        for field, value in camera_data.model_dump(
            exclude_unset=True,
            exclude_none=True,
        ).items():
            setattr(camera, field, value)
        db.commit()
        db.refresh(camera)
        return _serialize_camera(camera)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A camera with this name already exists.",
        ) from exc
    finally:
        db.close()


@router.get("/cameras/{camera_id}/zones")
def list_camera_zones(camera_id: int):
    db = SessionLocal()
    try:
        _get_camera(db, camera_id)
        zones = (
            db.query(RestrictedZone)
            .filter(RestrictedZone.camera_id == camera_id)
            .order_by(RestrictedZone.id.desc())
            .all()
        )
        return [_serialize_zone(zone) for zone in zones]
    finally:
        db.close()


@router.post("/cameras/{camera_id}/zones", status_code=201)
def create_camera_zone(camera_id: int, zone_data: CameraZoneCreate):
    db = SessionLocal()
    try:
        _get_camera(db, camera_id)
        zone = RestrictedZone(
            camera_id=camera_id,
            **zone_data.model_dump(),
        )
        db.add(zone)
        db.commit()
        db.refresh(zone)
        result = _serialize_zone(zone)
        camera_manager.update_zone(camera_id, result)
        return result
    finally:
        db.close()


@router.post("/cameras/{camera_id}/monitor/start")
def start_camera_monitoring(camera_id: int):
    db = SessionLocal()
    try:
        camera = _get_camera(db, camera_id)
        if not camera.is_enabled:
            raise HTTPException(status_code=409, detail="This camera is disabled.")
        camera_config = {
            "id": camera.id,
            "name": camera.name,
            "source_type": camera.source_type,
            "webcam_index": camera.webcam_index,
        }
        zone = _active_zone(db, camera_id)
        zone_data = _serialize_zone(zone) if zone is not None else None
    finally:
        db.close()

    try:
        return camera_manager.start(camera_config, zone_data)
    except (RuntimeError, TimeoutError, NotImplementedError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/cameras/{camera_id}/monitor/stop")
def stop_camera_monitoring(camera_id: int):
    db = SessionLocal()
    try:
        _get_camera(db, camera_id)
    finally:
        db.close()
    return camera_manager.stop(camera_id)


@router.get("/cameras/{camera_id}/monitor/status")
def camera_monitor_status(camera_id: int):
    db = SessionLocal()
    try:
        _get_camera(db, camera_id)
    finally:
        db.close()
    return camera_manager.status(camera_id)


@router.get("/cameras/{camera_id}/monitor/stream")
def camera_mjpeg_stream(camera_id: int):
    frames = camera_manager.frames(camera_id)
    if frames is None:
        raise HTTPException(status_code=409, detail="Camera monitoring is not running.")
    return StreamingResponse(
        frames,
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.get("/cameras/{camera_id}/events/stream")
def camera_event_stream(camera_id: int):
    db = SessionLocal()
    try:
        _get_camera(db, camera_id)
    finally:
        db.close()
    return StreamingResponse(
        camera_manager.event_stream(camera_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
