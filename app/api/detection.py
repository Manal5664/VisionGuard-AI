import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.database import SessionLocal
from app.models.event import Event
from app.services.annotation import annotate_detections
from app.services.detector import Detector, InferenceUnavailableError
from app.services.intrusion import is_person_intrusion
from app.services.zones import get_restricted_zone


router = APIRouter()

detector = Detector()

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    file_extension = Path(file.filename).suffix
    temp_filename = f"{uuid.uuid4()}{file_extension}"
    temp_path = UPLOAD_DIR / temp_filename

    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        try:
            detections = await run_in_threadpool(detector.detect, str(temp_path))
        except InferenceUnavailableError as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "AI inference is temporarily unavailable on this instance. "
                    "Try again later or run VisionGuard locally."
                ),
            ) from exc

        db = SessionLocal()

        try:
            restricted_zone = get_restricted_zone()

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
                detection["is_intrusion"] = is_intrusion

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
