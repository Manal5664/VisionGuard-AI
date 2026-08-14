import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.core.database import SessionLocal
from app.models.event import Event
from app.models.zone import RestrictedZone
from app.services.annotation import annotate_detections
from app.services.detector import Detector
from app.services.intrusion import Coordinates, is_person_intrusion


router = APIRouter()

detector = Detector()

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _to_zone_coordinates(zone: RestrictedZone) -> Coordinates:
    return {
        "x1": zone.x1,
        "y1": zone.y1,
        "x2": zone.x2,
        "y2": zone.y2,
    }


@router.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    file_extension = Path(file.filename).suffix
    temp_filename = f"{uuid.uuid4()}{file_extension}"
    temp_path = UPLOAD_DIR / temp_filename

    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        detections = detector.detect(str(temp_path))

        db = SessionLocal()

        try:
            zone = (
                db.query(RestrictedZone)
                .order_by(RestrictedZone.id.asc())
                .first()
            )
            restricted_zone = _to_zone_coordinates(zone) if zone else None

            annotated_image_path = annotate_detections(
                temp_path,
                detections,
                restricted_zone,
            )

            for detection in detections:
                is_intrusion = False
                if restricted_zone is not None:
                    is_intrusion = is_person_intrusion(
                        detection["class_name"],
                        detection["bbox"],
                        restricted_zone,
                    )

                event = Event(
                    event_type="intrusion" if is_intrusion else "detection",
                    object_type=detection["class_name"],
                    confidence=detection["confidence"],
                    image_path=file.filename,
                )

                db.add(event)

            db.commit()

        finally:
            db.close()

        return {
            "filename": file.filename,
            "detections": detections,
            "count": len(detections),
            "annotated_image_path": annotated_image_path.as_posix(),
        }

    finally:
        temp_path.unlink(missing_ok=True)
